import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredential } from '@azure/identity';
import chalk from 'chalk';

interface EntraApp {
  id: string;
  appId: string;
  ssoUrl: string;
  entityId: string;
}

interface SAMLConfig {
  ssoUrl: string;
  entityId: string;
  certificate: string;
}

export class AzureService {
  private graphClient: Client;
  private tenantDomain: string;

  constructor(credential: TokenCredential, tenantDomain: string) {
    this.tenantDomain = tenantDomain;
    this.graphClient = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          const token = await credential.getToken('https://graph.microsoft.com/.default');
          return token?.token || '';
        }
      }
    });
  }

  async createGitHubEnterpriseApp(enterpriseName: string): Promise<EntraApp> {
    try {
      console.log(chalk.gray('   Step 1: Finding GitHub Enterprise template in gallery...'));
      
      // Step 1: Find GitHub Enterprise template in the gallery
      const template = await this.findGitHubGalleryApp();
      
      if (template) {
        console.log(chalk.gray(`   Step 2: Instantiating ${template.displayName}...`));
        
        // Step 2: Instantiate the application from the template
        const instantiateResponse = await this.graphClient
          .api(`/applicationTemplates/${template.id}/instantiate`)
          .post({
            displayName: `GitHub Enterprise SSO - ${enterpriseName}`
          });        const applicationId = instantiateResponse.application.id;
        let servicePrincipalId = instantiateResponse.servicePrincipal.id;
        const appId = instantiateResponse.application.appId;console.log(chalk.gray('   Step 3: Configuring SAML SSO mode...'));
        
        // Add delay to ensure service principal is fully created
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Step 3: Set SAML as the SSO mode with retry logic
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            await this.graphClient
              .api(`/servicePrincipals/${servicePrincipalId}`)
              .patch({
                preferredSingleSignOnMode: 'saml'
              });
            break; // Success, exit retry loop
          } catch (error: any) {
            retryCount++;
            console.log(chalk.yellow(`   ⚠️  Attempt ${retryCount}/${maxRetries} failed: ${error.message}`));
            
            if (retryCount >= maxRetries) {
              console.log(chalk.yellow('   Trying alternative approach to find service principal...'));
              
              // Alternative: search for the service principal by app ID
              const servicePrincipals = await this.graphClient
                .api('/servicePrincipals')
                .filter(`appId eq '${appId}'`)
                .get();
                
              if (servicePrincipals.value && servicePrincipals.value.length > 0) {
                const alternativeSpId = servicePrincipals.value[0].id;
                console.log(chalk.gray(`   Found service principal with alternative ID: ${alternativeSpId}`));
                
                await this.graphClient
                  .api(`/servicePrincipals/${alternativeSpId}`)
                  .patch({
                    preferredSingleSignOnMode: 'saml'
                  });
                  
                // Update the ID for subsequent calls
                servicePrincipalId = alternativeSpId;
                break;
              } else {
                throw new Error(`Failed to configure SAML SSO mode after ${maxRetries} attempts: ${error.message}`);
              }
            }
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        console.log(chalk.gray('   Step 4: Configuring SAML URLs...'));
        
        // Step 4: Configure SAML URLs for the application
        await this.graphClient
          .api(`/applications/${applicationId}`)
          .patch({
            identifierUris: [
              `https://github.com/enterprises/${enterpriseName}`
            ],
            web: {
              redirectUris: [
                `https://github.com/enterprises/${enterpriseName}/saml/consume`
              ]
            }
          });

        console.log(chalk.gray('   Step 5: Creating signing certificate...'));
        
        // Step 5: Create a token signing certificate
        const certificateResponse = await this.graphClient
          .api(`/servicePrincipals/${servicePrincipalId}/addTokenSigningCertificate`)
          .post({
            displayName: `CN=GitHub-${enterpriseName}`,
            endDateTime: new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000).toISOString() // 3 years from now
          });

        // Get tenant ID for entity ID
        const tenantId = await this.getTenantId();
        
        return {
          id: servicePrincipalId,
          appId: appId,
          ssoUrl: `https://login.microsoftonline.com/${tenantId}/saml2`,
          entityId: `https://sts.windows.net/${tenantId}/`
        };
        
      } else {
        console.log(chalk.yellow('   No template found, creating custom SAML application...'));
        return await this.createCustomSAMLApp(enterpriseName);
      }    } catch (error: any) {
      console.log(chalk.red(`   ❌ Template instantiation failed: ${error.message}`));
      console.log(chalk.yellow('   Falling back to custom SAML application...'));
      return await this.createCustomSAMLApp(enterpriseName);
    }
  }

  async findGitHubGalleryApp(): Promise<{ id: string; displayName: string } | null> {
    try {
      console.log(chalk.gray('   Searching for GitHub Enterprise templates...'));
      
      // Search for GitHub Enterprise application templates
      const searchTerms = [
        'GitHub Enterprise Managed User',
        'GitHub Enterprise Server',
        'GitHub Enterprise Cloud',
        'GitHub Enterprise'
      ];

      for (const searchTerm of searchTerms) {
        try {
          const response = await this.graphClient
            .api('/applicationTemplates')
            .filter(`displayName eq '${searchTerm}'`)
            .get();

          if (response.value && response.value.length > 0) {
            const app = response.value[0];
            console.log(chalk.green(`   ✅ Found template: ${app.displayName} (ID: ${app.id})`));
            return { id: app.id, displayName: app.displayName };
          }
        } catch (searchError) {
          console.log(chalk.gray(`   No exact match for "${searchTerm}"`));
        }
      }

      // If no exact match, search more broadly
      console.log(chalk.gray('   Searching broadly for GitHub templates...'));
      try {
        const response = await this.graphClient
          .api('/applicationTemplates')
          .filter(`contains(displayName, 'GitHub')`)
          .get();

        if (response.value && response.value.length > 0) {
          console.log(chalk.yellow(`   Found ${response.value.length} GitHub-related templates:`));
          response.value.forEach((app: any, index: number) => {
            console.log(chalk.gray(`     ${index + 1}. ${app.displayName} (ID: ${app.id})`));
          });
          
          // Try to find the most relevant one
          const preferredApp = response.value.find((app: any) => 
            app.displayName.toLowerCase().includes('enterprise') ||
            app.displayName.toLowerCase().includes('managed')
          ) || response.value[0];
          
          console.log(chalk.yellow(`   Using: ${preferredApp.displayName}`));
          return { id: preferredApp.id, displayName: preferredApp.displayName };
        }      } catch (broadSearchError: any) {
        console.log(chalk.red(`   Broad search failed: ${broadSearchError.message}`));
      }

      console.log(chalk.yellow('   No GitHub templates found in gallery'));
      return null;
    } catch (error: any) {
      console.log(chalk.red(`   Gallery search failed: ${error.message}`));
      return null;
    }
  }

  async createCustomSAMLApp(enterpriseName: string): Promise<EntraApp> {
    try {
      console.log(chalk.gray('   Creating custom SAML application...'));
      
      // Create a custom application
      const application = await this.graphClient
        .api('/applications')
        .post({
          displayName: `GitHub Enterprise SSO - ${enterpriseName}`,
          signInAudience: 'AzureADMyOrg',
          web: {
            redirectUris: [
              `https://github.com/enterprises/${enterpriseName}/saml/consume`
            ]
          },
          identifierUris: [
            `https://github.com/enterprises/${enterpriseName}`
          ]
        });

      // Create service principal for the application
      const servicePrincipal = await this.graphClient
        .api('/servicePrincipals')
        .post({
          appId: application.appId,
          preferredSingleSignOnMode: 'saml'
        });

      // Create signing certificate
      const certificateResponse = await this.graphClient
        .api(`/servicePrincipals/${servicePrincipal.id}/addTokenSigningCertificate`)
        .post({
          displayName: `CN=GitHub-${enterpriseName}`,
          endDateTime: new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000).toISOString()
        });

      // Get tenant ID
      const tenantId = await this.getTenantId();

      return {
        id: servicePrincipal.id,
        appId: application.appId,
        ssoUrl: `https://login.microsoftonline.com/${tenantId}/saml2`,
        entityId: `https://sts.windows.net/${tenantId}/`
      };
    } catch (error: any) {
      throw new Error(`Failed to create custom SAML app: ${error.message}`);
    }
  }
  async configureSAMLSettings(servicePrincipalId: string, enterpriseName: string): Promise<void> {
    try {
      console.log(chalk.gray('   Configuring SAML settings...'));
      
      // First, get the service principal to find the associated application
      const servicePrincipal = await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}`)
        .select('appId')
        .get();

      // Get the application object
      const applications = await this.graphClient
        .api('/applications')
        .filter(`appId eq '${servicePrincipal.appId}'`)
        .get();

      if (!applications.value || applications.value.length === 0) {
        throw new Error('Associated application not found');
      }

      const applicationId = applications.value[0].id;

      // Configure SAML settings on the APPLICATION object
      await this.graphClient
        .api(`/applications/${applicationId}`)
        .patch({
          web: {
            redirectUris: [
              `https://github.com/enterprises/${enterpriseName}/saml/consume`
            ],
            logoutUrl: `https://github.com/enterprises/${enterpriseName}/saml/sls`
          },
          identifierUris: [
            `https://github.com/enterprises/${enterpriseName}`
          ]
        });

      // Configure additional properties on the SERVICE PRINCIPAL
      await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}`)
        .patch({
          loginUrl: `https://github.com/enterprises/${enterpriseName}/sso`,
          preferredSingleSignOnMode: 'saml'
        });
      
      console.log(chalk.green('   ✅ SAML settings configured'));
    } catch (error: any) {
      throw new Error(`Failed to configure SAML settings: ${error.message}`);
    }
  }

  async downloadSAMLCertificate(servicePrincipalId: string): Promise<string> {
    try {
      console.log(chalk.gray('   Retrieving SAML certificate...'));
      
      // Get the service principal with key credentials
      const servicePrincipal = await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}`)
        .select('keyCredentials')
        .get();

      // Find the signing certificate
      const signingCert = servicePrincipal.keyCredentials?.find((cred: any) => 
        cred.usage === 'Verify' && cred.type === 'AsymmetricX509Cert'
      );

      if (!signingCert) {
        throw new Error('SAML signing certificate not found');
      }

      // Format the certificate for GitHub
      const cert = signingCert.key;
      const formattedCert = `-----BEGIN CERTIFICATE-----\n${cert.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`;
      
      console.log(chalk.green('   ✅ Certificate retrieved'));
      return formattedCert;
    } catch (error: any) {
      throw new Error(`Failed to download SAML certificate: ${error.message}`);
    }
  }

  private async getTenantId(): Promise<string> {
    try {
      const organization = await this.graphClient
        .api('/organization')
        .select('id')
        .get();
      
      return organization.value[0].id;
    } catch (error: any) {
      // Fallback: extract from tenant domain if available
      throw new Error(`Failed to get tenant ID: ${error.message}`);
    }
  }  async assignCurrentUserToApp(servicePrincipalId: string): Promise<void> {
    try {
      console.log(chalk.gray('   Assigning current user to the application...'));
      
      // Get current user
      const currentUser = await this.graphClient
        .api('/me')
        .select('id,displayName,userPrincipalName')
        .get();
      
      console.log(chalk.gray(`   Current user: ${currentUser.displayName} (${currentUser.userPrincipalName})`));
      
      // Get the service principal with app roles to find Enterprise Owner role
      const servicePrincipal = await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}`)
        .select('appRoles,displayName')
        .get();
      
      console.log(chalk.gray(`   Looking for Enterprise Owner role in ${servicePrincipal.displayName}...`));
      
      // Find the Enterprise Owner role
      let enterpriseOwnerRole = null;
      
      if (servicePrincipal.appRoles && servicePrincipal.appRoles.length > 0) {
        console.log(chalk.gray('   Available roles:'));
        
        // Look for Enterprise Owner role (common names it might have)
        const ownerRolePatterns = [
          'Enterprise Owner',
          'EnterpriseOwner'
        ];
        
        for (const role of servicePrincipal.appRoles) {
          console.log(chalk.gray(`     - ${role.displayName || role.value || 'Unnamed role'} (${role.id})`));
          
          // Check if this role matches Enterprise Owner patterns
          for (const pattern of ownerRolePatterns) {
            if (role.displayName?.includes(pattern) || role.value?.includes(pattern)) {
              enterpriseOwnerRole = role;
              console.log(chalk.green(`     ✅ Found Enterprise Owner role: ${role.displayName || role.value}`));
              break;
            }
          }
          
          if (enterpriseOwnerRole) break;
        }
      }
      
      // If we didn't find a specific Enterprise Owner role, use the first available role or default
      if (!enterpriseOwnerRole) {
        if (servicePrincipal.appRoles && servicePrincipal.appRoles.length > 0) {
          enterpriseOwnerRole = servicePrincipal.appRoles[0];
          console.log(chalk.yellow(`   ⚠️  Enterprise Owner role not found, using: ${enterpriseOwnerRole.displayName || enterpriseOwnerRole.value || 'First available role'}`));
        } else {
          console.log(chalk.yellow('   ⚠️  No app roles found, using default role'));
          enterpriseOwnerRole = { id: '00000000-0000-0000-0000-000000000000' }; // Default role
        }
      }
      
      // Check if user is already assigned
      try {
        const existingAssignments = await this.graphClient
          .api(`/servicePrincipals/${servicePrincipalId}/appRoleAssignedTo`)
          .filter(`principalId eq ${currentUser.id}`)
          .get();
        
        if (existingAssignments.value && existingAssignments.value.length > 0) {
          console.log(chalk.green('   ✅ User already assigned to application'));
          return;
        }
      } catch (checkError) {
        console.log(chalk.gray('   Could not check existing assignments, proceeding with assignment...'));
      }

      try {
        // Assign the user to the application with the Enterprise Owner role
        await this.graphClient
          .api(`/users/${currentUser.id}/appRoleAssignments`)
          .post({
            principalId: currentUser.id,
            resourceId: servicePrincipalId,
            appRoleId: enterpriseOwnerRole.id
          });
        
        console.log(chalk.green(`   ✅ Current user assigned with role: ${enterpriseOwnerRole.displayName || enterpriseOwnerRole.value || 'Default'}`));
        
      } catch (assignmentError: any) {
        // If direct assignment fails, try enabling assignment requirement
        console.log(chalk.gray('   Standard assignment failed, trying alternative approach...'));
        
        try {
          // Update the service principal to allow user assignment
          await this.graphClient
            .api(`/servicePrincipals/${servicePrincipalId}`)
            .patch({
              appRoleAssignmentRequired: false // Allow all users in the tenant
            });
          
          console.log(chalk.green('   ✅ Application configured to allow all tenant users'));
            } catch (configError: any) {
          throw new Error(`Failed to configure user access: ${configError.message}`);
        }
      }
      
    } catch (error: any) {
      console.log(chalk.yellow(`   ⚠️  Failed to assign user: ${error.message}`));
      console.log(chalk.gray('   Note: You may need to manually assign users in Azure Portal'));
      // Don't throw error as this is not critical for SAML setup
    }
  }

  async configureProvisioning(servicePrincipalId: string, enterpriseName: string): Promise<void> {
    try {
      console.log(chalk.gray('   Configuring user provisioning...'));
      
      // Note: GitHub Enterprise requires SAML SSO to be enabled first before provisioning can be configured
      // This sets up the provisioning configuration but won't be active until SAML is working
      
      // Enable synchronization
      const provisioningConfig = {
        synchronization: {
          settings: [
            {
              name: 'AzureADEndpoint',
              value: `https://graph.microsoft.com/v1.0/servicePrincipals/${servicePrincipalId}`
            },
            {
              name: 'ApplicationId',
              value: servicePrincipalId
            }
          ]
        }
      };
      
      // Check if GitHub has provisioning capabilities
      const servicePrincipal = await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}`)
        .select('synchronization')
        .get();
      
      if (servicePrincipal.synchronization) {
        console.log(chalk.green('   ✅ Provisioning capabilities detected'));
        
        // Set up provisioning job (this might not be available for all templates)
        try {
          const provisioningJobs = await this.graphClient
            .api(`/servicePrincipals/${servicePrincipalId}/synchronization/jobs`)
            .get();
          
          if (provisioningJobs.value && provisioningJobs.value.length > 0) {
            console.log(chalk.green('   ✅ Provisioning job already exists'));
          } else {
            console.log(chalk.yellow('   ⚠️  No provisioning jobs found - may need manual setup'));
          }
        } catch (jobError: any) {
          console.log(chalk.yellow(`   ⚠️  Could not check provisioning jobs: ${jobError.message}`));
        }
      } else {
        console.log(chalk.yellow('   ⚠️  No synchronization capabilities found'));
      }
      
      console.log(chalk.cyan('\n   📝 Provisioning Notes:'));
      console.log(chalk.gray('   • User provisioning requires SAML SSO to be enabled in GitHub first'));
      console.log(chalk.gray('   • After GitHub SAML setup is complete, return to Azure AD:'));
      console.log(chalk.gray('     1. Go to Enterprise Applications > Your GitHub App'));
      console.log(chalk.gray('     2. Click "Provisioning" in the left menu'));
      console.log(chalk.gray('     3. Set Provisioning Mode to "Automatic"'));
      console.log(chalk.gray('     4. Configure the GitHub SCIM endpoint and token'));
      console.log(chalk.gray('     5. Test the connection and start provisioning'));
      
    } catch (error: any) {
      console.log(chalk.yellow(`   ⚠️  Provisioning setup failed: ${error.message}`));
      // Don't throw error as this is not critical for initial SAML setup
    }
  }

  async addProvisioningNotes(enterpriseName: string): Promise<void> {
    console.log(chalk.cyan('\n🔄 User Provisioning Setup:'));
    console.log(chalk.gray('User provisioning allows automatic user/group sync between Azure AD and GitHub.'));
    console.log(chalk.gray('This requires additional setup after SAML SSO is working:\n'));
    
    console.log(chalk.yellow('Prerequisites:'));
    console.log(chalk.gray('• SAML SSO must be enabled and working in GitHub Enterprise'));
    console.log(chalk.gray('• GitHub Enterprise must support SCIM provisioning'));
    console.log(chalk.gray('• You need GitHub Enterprise Owner permissions\n'));
    
    console.log(chalk.yellow('Setup Steps:'));
    console.log(chalk.gray('1. Complete GitHub SAML SSO setup first'));
    console.log(chalk.gray('2. In GitHub Enterprise, go to Settings > Security > SAML SSO'));
    console.log(chalk.gray('3. Enable "Require SAML SSO authentication for all members"'));
    console.log(chalk.gray('4. Go to Settings > Security > Team synchronization'));
    console.log(chalk.gray('5. Enable team synchronization and get the SCIM endpoint URL'));
    console.log(chalk.gray('6. Generate a SCIM token in GitHub'));
    console.log(chalk.gray('7. Return to Azure AD > Enterprise Applications > Your GitHub App'));
    console.log(chalk.gray('8. Configure provisioning with the SCIM endpoint and token\n'));
  }

  async configureSCIMProvisioning(servicePrincipalId: string, scimEndpoint: string, scimToken: string): Promise<void> {
    try {
      console.log(chalk.gray('   Configuring SCIM provisioning settings...'));
      
      // Configure the provisioning settings
      const provisioningConfig = {
        provisioningEnabled: true,
        mappings: [
          {
            name: "Microsoft Azure Active Directory to GitHub Enterprise Managed User",
            sourceObjectName: "User",
            targetObjectName: "User",
            mappingBehavior: 0, // Create/Update/Delete
            enabled: true,
            targetAttributeMappings: [
              {
                source: { name: "userPrincipalName", type: "Attribute" },
                target: { name: "userName", type: "Attribute" },
                matchingPriority: 1,
                defaultValue: null,
                expressionLanguage: null
              },
              {
                source: { name: "displayName", type: "Attribute" },
                target: { name: "displayName", type: "Attribute" },
                defaultValue: null
              },
              {
                source: { name: "givenName", type: "Attribute" },
                target: { name: "name.givenName", type: "Attribute" },
                defaultValue: null
              },
              {
                source: { name: "surname", type: "Attribute" },
                target: { name: "name.familyName", type: "Attribute" },
                defaultValue: null
              },
              {
                source: { name: "mail", type: "Attribute" },
                target: { name: "emails[type eq \"work\"].value", type: "Attribute" },
                defaultValue: null
              }
            ]
          }
        ]
      };

      // Set the SCIM endpoint and authentication
      await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}/synchronization/secrets`)
        .put({
          value: [
            {
              key: "BaseAddress",
              value: scimEndpoint
            },
            {
              key: "SecretToken", 
              value: scimToken
            }
          ]
        });      console.log(chalk.green('   ✅ SCIM endpoint and token configured'));

      // Get available synchronization templates for this service principal
      const templates = await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}/synchronization/templates`)
        .get();

      let templateId = null;
      if (templates.value && templates.value.length > 0) {
        // Use the first available template (GitHub Enterprise should have one)
        templateId = templates.value[0].id;
        console.log(chalk.gray(`   Using synchronization template: ${templateId}`));
      } else {
        throw new Error('No synchronization templates found for this application');
      }

      // Check if a job already exists
      const existingJobs = await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}/synchronization/jobs`)
        .get();

      if (existingJobs.value && existingJobs.value.length > 0) {
        console.log(chalk.green('   ✅ SCIM provisioning job already exists'));
        
        // Update existing job to ensure it's configured correctly
        const jobId = existingJobs.value[0].id;
        await this.graphClient
          .api(`/servicePrincipals/${servicePrincipalId}/synchronization/jobs/${jobId}`)
          .patch({
            schedule: {
              expiration: null,
              interval: "PT1H", // Every hour
              state: "Active"
            }
          });
        console.log(chalk.green('   ✅ SCIM provisioning job updated'));
      } else {
        // Create new synchronization job
        await this.graphClient
          .api(`/servicePrincipals/${servicePrincipalId}/synchronization/jobs`)
          .post({
            templateId: templateId
          });
        console.log(chalk.green('   ✅ SCIM provisioning job created'));
      }
      
    } catch (error: any) {
      throw new Error(`Failed to configure SCIM provisioning: ${error.message}`);
    }
  }
  async testSCIMConnection(servicePrincipalId: string): Promise<boolean> {
    try {
      console.log(chalk.gray('   Testing SCIM connection...'));
      
      // First, get the synchronization job to find the template ID
      const jobs = await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}/synchronization/jobs`)
        .get();
      
      if (!jobs.value || jobs.value.length === 0) {
        throw new Error('No synchronization jobs found');
      }
      
      const syncJob = jobs.value[0];
      const templateId = syncJob.templateId;
      
      if (!templateId) {
        throw new Error('Template ID not found in synchronization job');
      }
      
      console.log(chalk.gray(`   Using template ID: ${templateId}`));
        // Test the provisioning connection with saved credentials
      await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}/synchronization/jobs/${syncJob.id}/validateCredentials`)
        .post({
          templateId: templateId,
          useSavedCredentials: true
        });
        
      console.log(chalk.green('   ✅ SCIM connection test successful'));
      return true;
    } catch (error: any) {
      console.log(chalk.yellow(`   ⚠️  SCIM connection test failed: ${error.message}`));
      return false;
    }
  }

  async enableProvisioningOnDemand(servicePrincipalId: string): Promise<void> {
    try {
      console.log(chalk.gray('   Enabling on-demand provisioning...'));
      
      await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}`)
        .patch({
          preferredSingleSignOnMode: "saml",
          tags: ["WindowsAzureActiveDirectoryOnPremApp", "ProvisioningOnDemand"]
        });
        
      console.log(chalk.green('   ✅ On-demand provisioning enabled'));
    } catch (error: any) {
      console.log(chalk.yellow(`   ⚠️  Could not enable on-demand provisioning: ${error.message}`));
    }
  }

  async startProvisioning(servicePrincipalId: string): Promise<void> {
    try {
      console.log(chalk.gray('   Starting provisioning job...'));
      
      // Get the synchronization job ID
      const syncJobs = await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}/synchronization/jobs`)
        .get();

      if (!syncJobs.value || syncJobs.value.length === 0) {
        throw new Error('No synchronization jobs found. Please create SCIM configuration first.');
      }

      const jobId = syncJobs.value[0].id;
      
      // Start the synchronization job
      await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}/synchronization/jobs/${jobId}/start`)
        .post({});

      console.log(chalk.green('   ✅ Provisioning started successfully'));
      console.log(chalk.gray('   Initial synchronization may take several minutes to complete'));
      
    } catch (error: any) {
      throw new Error(`Failed to start provisioning: ${error.message}`);
    }
  }

  async getProvisioningStatus(servicePrincipalId: string): Promise<any> {
    try {
      const syncJobs = await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}/synchronization/jobs`)
        .get();

      if (!syncJobs.value || syncJobs.value.length === 0) {
        return { status: 'Not configured' };
      }

      const job = syncJobs.value[0];
      return {
        status: job.schedule?.state || 'Unknown',
        lastExecution: job.schedule?.expiration,
        jobId: job.id
      };
    } catch (error: any) {
      throw new Error(`Failed to get provisioning status: ${error.message}`);
    }
  }
}

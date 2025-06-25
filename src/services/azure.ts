import { Client } from '@microsoft/microsoft-graph-client';
import { getBaseUrls } from '../utils/envUrls';
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
  private envType: 'github.com' | 'ghe.com';

  constructor(credential: TokenCredential, tenantDomain?: string, envType: 'github.com' | 'ghe.com' = 'github.com') {
    this.tenantDomain = tenantDomain || 'common';
    this.envType = envType;
    this.graphClient = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          const token = await credential.getToken('https://graph.microsoft.com/.default');
          return token?.token || '';
        }
      }
    });
  }



  async createGitHubEnterpriseApp(enterpriseName: string, ssoType: 'saml' | 'oidc' = 'saml'): Promise<EntraApp> {
    try {
      console.log(chalk.gray('   Step 1: Checking for existing GitHub Enterprise applications...'));     
      
      // First, check if there's already a GitHub Enterprise app for this enterprise
      const existingApp = await this.findExistingGitHubApp(enterpriseName, ssoType);
      if (existingApp) {
        console.log(chalk.yellow(`\n🔍 Found existing GitHub Enterprise application:`));
        console.log(chalk.gray(`   Name: ${existingApp.displayName}`));
        console.log(chalk.gray(`   Application ID: ${existingApp.appId}`));
        
        // Import inquirer to prompt user
        const inquirer = await import('inquirer');
        const { reuseApp } = await inquirer.default.prompt([{
          type: 'confirm',
          name: 'reuseApp',
          message: 'Do you want to reuse this existing application?',
          default: true
        }]);
          if (reuseApp) {
          console.log(chalk.green('   ✅ Reusing existing application...'));
          
          // Get tenant ID for URLs
          const tenantId = await this.getTenantId();
          
          if (ssoType === 'oidc') {
            return {
              id: existingApp.id,
              appId: existingApp.appId,
              ssoUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
              entityId: `https://sts.windows.net/${tenantId}/`
            };
          } else {
            return {
              id: existingApp.id,
              appId: existingApp.appId,
              ssoUrl: `https://login.microsoftonline.com/${tenantId}/saml2`,
              entityId: `https://sts.windows.net/${tenantId}/`
            };
          }
        } else {
          console.log(chalk.red('\n❌ Cannot proceed without reusing existing application.'));
          console.log(chalk.yellow('To avoid conflicts, you must either:'));
          console.log(chalk.gray('1. Choose to reuse the existing application, or'));
          console.log(chalk.gray('2. Delete the existing application in Azure Portal first'));
          console.log(chalk.gray('3. Use a different enterprise name'));
          const error = new Error('Setup cancelled: Cannot create duplicate applications for the same GitHub Enterprise.');
          (error as any).userCancelled = true;
          throw error;
        }
      }
        console.log(chalk.gray(`   Step 2: Finding GitHub Enterprise ${ssoType.toUpperCase()} template in gallery...`));
      
      // Step 1: Find GitHub Enterprise template in the gallery
      const template = await this.findGitHubGalleryApp(ssoType);
      
      if (template) {
        console.log(chalk.gray(`   Step 2: Instantiating ${template.displayName}...`));
        
        // Step 2: Instantiate the application from the template
        const instantiateResponse = await this.graphClient
          .api(`/applicationTemplates/${template.id}/instantiate`)
          .post({
            displayName: `GitHub Enterprise ${ssoType.toUpperCase()} SSO - ${enterpriseName}`
          });
        
        const applicationId = instantiateResponse.application.id;
        let servicePrincipalId = instantiateResponse.servicePrincipal.id;
        const appId = instantiateResponse.application.appId;

        if (ssoType === 'saml') {
          console.log(chalk.gray('   Step 3: Configuring SAML SSO mode...'));
          
          // Add delay to ensure service principal is fully created
          await new Promise(resolve => setTimeout(resolve, 5000));
          
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
          
          // Step 4: Configure SAML URLs for the application - do this AFTER certificate creation
          // We'll configure this later in configureSAMLSettings to avoid conflicts
          
          console.log(chalk.gray('   Step 5: Creating signing certificate...'));
          
          // Step 5: Create a token signing certificate
          const certificateResponse = await this.graphClient
            .api(`/servicePrincipals/${servicePrincipalId}/addTokenSigningCertificate`)
            .post({
              displayName: `CN=GitHub-${enterpriseName}`,
              endDateTime: new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000).toISOString() // 3 years from now
            });
        } else {
          console.log(chalk.gray('   Step 3: Configuring OIDC mode...'));
          
          // Add delay to ensure service principal is fully created
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // For OIDC, we don't need to set SAML mode or create certificates
          // The OIDC template handles authentication configuration automatically
          console.log(chalk.green('   ✅ OIDC configuration completed (managed automatically)'));
        }        
        
        // Get tenant ID for entity ID
        const tenantId = await this.getTenantId();
        
        if (ssoType === 'oidc') {
          return {
            id: servicePrincipalId,
            appId: appId,
            ssoUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
            entityId: `https://sts.windows.net/${tenantId}/`
          };
        } else {
          return {
            id: servicePrincipalId,
            appId: appId,
            ssoUrl: `https://login.microsoftonline.com/${tenantId}/saml2`,
            entityId: `https://sts.windows.net/${tenantId}/`
          };
        }      
      } else {
        // STRICT: Do not allow fallback to custom apps - this breaks SCIM provisioning
        const templateName = ssoType === 'oidc' ? 'GitHub Enterprise Managed User (OIDC)' : 'GitHub Enterprise Managed User';
        console.log(chalk.red(`   ❌ ${templateName} template is required for SCIM provisioning`));
        throw new Error(`${templateName} template not found. This template is required for SCIM provisioning support.`);
      }
    } catch (error: any) {
      // Re-throw user cancellation errors - don't fall back to custom app creation
      if (error.userCancelled) {
        throw error;
      }
      
      // STRICT: Do not fall back to custom SAML app creation for SCIM scenarios
      console.log(chalk.red(`   ❌ Template instantiation failed: ${error.message}`));
      console.log(chalk.red('   Cannot create GitHub Enterprise app without the proper gallery template.'));
      console.log(chalk.yellow('   The "GitHub Enterprise Managed User" template is required.'));
      throw new Error(`GitHub Enterprise app creation failed: ${error.message}. Gallery template is required for SCIM support.`);
    }
  }
  async findGitHubGalleryApp(ssoType: 'saml' | 'oidc' = 'saml'): Promise<{ id: string; displayName: string } | null> {    try {
      console.log(chalk.gray(`   Searching for GitHub Enterprise Managed User ${ssoType === 'oidc' ? '(OIDC)' : ''} template...`));
      
      // STRICT: Only search for the exact template based on SSO type
      // This is the ONLY supported template for SCIM provisioning with GitHub Enterprise
      const exactTemplateName = ssoType === 'oidc' 
        ? 'GitHub Enterprise Managed User (OIDC)'
        : 'GitHub Enterprise Managed User';
      
      try {
        const response = await this.graphClient
          .api('/applicationTemplates')
          .filter(`displayName eq '${exactTemplateName}'`)
          .get();

        if (response.value && response.value.length > 0) {
          const app = response.value[0];
          console.log(chalk.green(`   ✅ Found required template: ${app.displayName} (ID: ${app.id})`));
          return { id: app.id, displayName: app.displayName };
        }
      } catch (searchError: any) {
        console.log(chalk.red(`   Failed to search for template: ${searchError.message}`));
      }      
      
      // STRICT: Do NOT fall back to other templates - this causes the wrong sync template to be used
      console.log(chalk.red(`   ❌ Required template not found: ${exactTemplateName}`));
      console.log(chalk.yellow('   This template is required for proper SCIM provisioning with GitHub Enterprise.'));
      console.log(chalk.yellow('   Possible causes:'));
      console.log(chalk.gray('     1. The template may not be available in your Azure tenant'));
      console.log(chalk.gray('     2. Your tenant may not have access to GitHub Enterprise gallery apps'));
      console.log(chalk.gray('     3. The template name may have changed in the Azure gallery'));
      
      // Let's also search to see what GitHub templates ARE available for troubleshooting
      try {
        const allGitHubResponse = await this.graphClient
          .api('/applicationTemplates')
          .filter(`contains(displayName, 'GitHub')`)
          .get();

        if (allGitHubResponse.value && allGitHubResponse.value.length > 0) {
          console.log(chalk.yellow(`   Available GitHub templates in your tenant:`));
          allGitHubResponse.value.forEach((app: any, index: number) => {
            console.log(chalk.gray(`     ${index + 1}. ${app.displayName} (ID: ${app.id})`));
          });
        }
      } catch (listError) {
        console.log(chalk.gray('   Could not list available GitHub templates'));
      }

      return null;
    } catch (error: any) {
      console.log(chalk.red(`   Gallery search failed: ${error.message}`));
      return null;
    }
  }

  async findExistingGitHubApp(enterpriseName: string, ssoType: 'saml' | 'oidc' = 'saml'): Promise<{ id: string; appId: string; displayName: string } | null> {
    try {
      console.log(chalk.gray(`   Looking for existing GitHub Enterprise apps for: ${enterpriseName}...`));
        // Search for service principals that might be GitHub Enterprise apps
      const servicePrincipals = await this.graphClient
        .api('/servicePrincipals')
        .select('id,displayName,appId,preferredSingleSignOnMode,servicePrincipalType,tags,publisherName')
        .get();

      if (!servicePrincipals.value || servicePrincipals.value.length === 0) {
        return null;
      }

      // Filter for potential GitHub apps
      const potentialGitHubApps = servicePrincipals.value.filter((sp: any) => 
        sp.displayName && 
        sp.displayName.toLowerCase().includes('github')
      );

      if (potentialGitHubApps.length === 0) {
        console.log(chalk.gray(`   No existing GitHub apps found for enterprise: ${enterpriseName}`));
        return null;
      }      
      
      // For OIDC, use more flexible detection since GitHub creates apps with generated names
      // For SAML, check entity ID and reply URL configuration
      for (const sp of potentialGitHubApps) {
        try {
          if (ssoType === 'oidc') {
            // For OIDC, check multiple criteria since GitHub creates the app with generated names
            // Get additional details about the service principal to identify it
            const spDetails = await this.graphClient
              .api(`/servicePrincipals/${sp.id}`)
              .select('id,displayName,appId,tags,servicePrincipalType,appDisplayName,publisherName,verifiedPublisher')
              .get();
            
            // Check for indicators this is a GitHub OIDC app:
            // 1. Service principal type should be Application
            // 2. Tags might indicate it's from GitHub
            // 3. Publisher information might indicate GitHub
            const isApplication = spDetails.servicePrincipalType === 'Application';
            const hasGitHubTags = (spDetails.tags || []).some((tag: string) => 
              tag.toLowerCase().includes('github') || tag.toLowerCase().includes('oidc')
            );
            const publisherIsGitHub = (spDetails.publisherName || '').toLowerCase().includes('github') ||
                                    (spDetails.verifiedPublisher?.displayName || '').toLowerCase().includes('github');
            
            // Check if display name follows GitHub's OIDC app naming pattern
            const nameIndicatesGitHub = sp.displayName && (
              sp.displayName.toLowerCase().includes('github') ||
              sp.displayName.toLowerCase().includes('webhook') ||
              // GitHub often uses app IDs that start with specific patterns
              /^[a-z0-9]{20,}$/.test(sp.displayName.toLowerCase())
            );
            
            console.log(chalk.gray(`   Evaluating OIDC app: ${sp.displayName}`));
            console.log(chalk.gray(`     Type: ${spDetails.servicePrincipalType}, GitHub tags: ${hasGitHubTags}, Publisher: ${publisherIsGitHub}, Name pattern: ${nameIndicatesGitHub}`));
            
            // For OIDC, we'll be more permissive - any GitHub app that looks like it could be the OIDC app
            if (isApplication && (hasGitHubTags || publisherIsGitHub || nameIndicatesGitHub)) {
              console.log(chalk.green(`   ✅ Found potential OIDC app: ${sp.displayName}`));
              return {
                id: sp.id,
                appId: sp.appId,
                displayName: sp.displayName
              };
            } else {
              console.log(chalk.yellow(`   ⚠️  App ${sp.displayName} doesn't match OIDC criteria`));
            }
          } else {
            // For SAML, check entity ID and reply URL configuration
            const applications = await this.graphClient
              .api('/applications')
              .filter(`appId eq '${sp.appId}'`)
              .select('id,identifierUris,web')
              .get();

            if (applications.value && applications.value.length > 0) {
              const app = applications.value[0];
              const { web } = getBaseUrls(this.envType, enterpriseName);
              const expectedEntityId = `${web}/enterprises/${enterpriseName}`;
              const expectedReplyUrl = `${web}/enterprises/${enterpriseName}/saml/consume`;
              const hasCorrectEntityId = app.identifierUris?.includes(expectedEntityId);
              const hasCorrectReplyUrl = app.web?.redirectUris?.includes(expectedReplyUrl);
              if (hasCorrectEntityId && hasCorrectReplyUrl) {
                console.log(chalk.green(`   ✅ Found existing properly configured SAML app: ${sp.displayName}`));
                console.log(chalk.gray(`     Entity ID: ${expectedEntityId}`));
                console.log(chalk.gray(`     Reply URL: ${expectedReplyUrl}`));
                return {
                  id: sp.id,
                  appId: sp.appId,
                  displayName: sp.displayName
                };
              } else if (hasCorrectEntityId || hasCorrectReplyUrl) {
                console.log(chalk.yellow(`   ⚠️  Found partially configured app: ${sp.displayName}`));
                console.log(chalk.gray(`     Entity ID match: ${hasCorrectEntityId ? '✅' : '❌'}`));
                console.log(chalk.gray(`     Reply URL match: ${hasCorrectReplyUrl ? '✅' : '❌'}`));
                // Continue looking for a fully configured app
              }
            }
          }
        } catch (error: any) {
          // Continue checking other apps
          console.log(chalk.red(`   ❌ Unexpected error when checking app: ${error.message}`));
          continue;        }
      }

      // Fallback for OIDC: if we only found one GitHub app and we're looking for OIDC, use it
      if (ssoType === 'oidc' && potentialGitHubApps.length === 1) {
        const singleApp = potentialGitHubApps[0];
        console.log(chalk.yellow(`   ⚠️  Only one GitHub app found for OIDC: ${singleApp.displayName}`));
        console.log(chalk.yellow(`   Assuming this is the correct OIDC app created by GitHub`));
        return {
          id: singleApp.id,
          appId: singleApp.appId,
          displayName: singleApp.displayName
        };
      }

      console.log(chalk.gray(`   No matching GitHub apps found for enterprise: ${enterpriseName}`));
      return null;
    } catch (error: any) {
      console.log(chalk.gray(`   Error searching for existing apps: ${error.message}`));
      return null;
    }
  }

  async configureSAMLSettings(servicePrincipalId: string, enterpriseName: string): Promise<void> {
    try {
      console.log(chalk.gray('   Configuring SAML settings...'));
      
      // First, get the service principal to find the associated application
      const servicePrincipal = await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}`)
        .select('appId,displayName')
        .get();

      console.log(chalk.gray(`   Configuring ${servicePrincipal.displayName}...`));

      // Get the application object
      const applications = await this.graphClient
        .api('/applications')
        .filter(`appId eq '${servicePrincipal.appId}'`)
        .get();

      if (!applications.value || applications.value.length === 0) {
        throw new Error('Associated application not found');
      }

      const applicationId = applications.value[0].id;
      const currentApp = applications.value[0];

      // Check if this application already has the correct configuration
      const { web } = getBaseUrls(this.envType, enterpriseName);
      const targetEntityId = `${web}/enterprises/${enterpriseName}`;
      const targetReplyUrl = `${web}/enterprises/${enterpriseName}/saml/consume`;
      
      const hasCorrectEntityId = currentApp.identifierUris?.includes(targetEntityId);
      const hasCorrectReplyUrl = currentApp.web?.redirectUris?.includes(targetReplyUrl);
      
      if (hasCorrectEntityId && hasCorrectReplyUrl) {
        console.log(chalk.green('   ✅ SAML configuration already correct'));
        return;
      }      
      
      // Check for conflicts with other applications
      console.log(chalk.gray('   Checking for existing configurations...'));
      try {
        const allApplications = await this.graphClient
          .api('/applications')
          .filter(`identifierUris/any(uri:uri eq '${targetEntityId}')`)
          .select('id,displayName,identifierUris')
          .get();

        if (allApplications.value && allApplications.value.length > 0) {
          const conflictingApps = allApplications.value.filter((app: any) => app.id !== applicationId);
          
          if (conflictingApps.length > 0) {
            console.log(chalk.red(`\n❌ Configuration conflict detected!`));
            console.log(chalk.yellow(`Found ${conflictingApps.length} existing application(s) with the same Entity ID:`));
            console.log(chalk.gray(`Entity ID: ${targetEntityId}\n`));
            
            conflictingApps.forEach((app: any, index: number) => {
              console.log(chalk.yellow(`${index + 1}. ${app.displayName}`));
              console.log(chalk.gray(`   Application ID: ${app.id}`));
            });
            
            console.log(chalk.cyan('\n💡 Resolution options:'));
            console.log(chalk.gray('1. Delete the conflicting application(s) in Azure Portal if no longer needed'));
            console.log(chalk.gray('2. Use a different enterprise name for this setup'));
            console.log(chalk.gray('3. Reuse the existing application if it\'s for the same GitHub Enterprise'));
            
            throw new Error(`Cannot configure SAML: Entity ID '${targetEntityId}' is already in use by another application. Please resolve the conflict and try again.`);
          }
        }
      } catch (searchError: any) {
        // If it's our custom error, re-throw it
        if (searchError.message.includes('Cannot configure SAML')) {
          throw searchError;
        }
        console.log(chalk.gray(`   Could not search for conflicts: ${searchError.message}`));
        // Continue with normal configuration
      }

      // No conflicts found, use standard URLs
      await this.configureSAMLWithUrls(applicationId, servicePrincipalId, enterpriseName, targetEntityId, targetReplyUrl);
      
    } catch (error: any) {
      throw new Error(`Failed to configure SAML settings: ${error.message}`);
    }
  }

  private async configureSAMLWithUrls(applicationId: string, servicePrincipalId: string, enterpriseName: string, entityId: string, replyUrl: string): Promise<void> {
    // Configure SAML settings on the APPLICATION object first
    console.log(chalk.gray('   Setting application SAML configuration...'));
    const { web } = getBaseUrls(this.envType, enterpriseName);
    await this.graphClient
      .api(`/applications/${applicationId}`)
      .patch({
        web: {
          redirectUris: [replyUrl],
          logoutUrl: `${web}/enterprises/${enterpriseName}/saml/sls`
        },
        identifierUris: [entityId]
      });

    // Wait a moment for the application update to propagate
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Configure additional properties on the SERVICE PRINCIPAL
    console.log(chalk.gray('   Setting service principal SAML configuration...'));
    await this.graphClient
      .api(`/servicePrincipals/${servicePrincipalId}`)
      .patch({
        loginUrl: `${web}/enterprises/${enterpriseName}/sso`,
        preferredSingleSignOnMode: 'saml'
      });

    // Verify the configuration was applied
    console.log(chalk.gray('   Verifying SAML configuration...'));
    const updatedApp = await this.graphClient
      .api(`/applications/${applicationId}`)
      .select('identifierUris,web')
      .get();

    const updatedSp = await this.graphClient
      .api(`/servicePrincipals/${servicePrincipalId}`)
      .select('preferredSingleSignOnMode,loginUrl')
      .get();

    // Check if configuration was applied correctly
    const hasCorrectEntityId = updatedApp.identifierUris?.includes(entityId);
    const hasCorrectReplyUrl = updatedApp.web?.redirectUris?.includes(replyUrl);
    const hasCorrectSsoMode = updatedSp.preferredSingleSignOnMode === 'saml';

    if (!hasCorrectEntityId || !hasCorrectReplyUrl || !hasCorrectSsoMode) {
      console.log(chalk.yellow('   ⚠️  Configuration verification failed, retrying...'));
      
      // Retry the configuration
      await this.graphClient
        .api(`/applications/${applicationId}`)
        .patch({
          web: {
            redirectUris: [replyUrl],
            logoutUrl: `${web}/enterprises/${enterpriseName}/saml/sls`
          },
          identifierUris: [entityId]
        });

      await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}`)
        .patch({
          loginUrl: `${web}/enterprises/${enterpriseName}/sso`,
          preferredSingleSignOnMode: 'saml'
        });
    }
    
    console.log(chalk.green('   ✅ SAML settings configured and verified'));
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
      // Fallback: try to extract tenant ID from domain if available
      if (this.tenantDomain && this.tenantDomain !== 'common') {
        console.log(chalk.yellow(`   ⚠️  Could not get tenant ID from organization API, attempting to resolve from domain: ${this.tenantDomain}`));
        
        try {
          // Try to get tenant info from the domain
          const tenantInfo = await this.graphClient
            .api(`/tenantRelationships/findTenantInformationByDomainName(domainName='${this.tenantDomain}')`)
            .get();
          
          if (tenantInfo && tenantInfo.tenantId) {
            console.log(chalk.green(`   ✅ Resolved tenant ID from domain: ${tenantInfo.tenantId}`));
            return tenantInfo.tenantId;
          }
        } catch (domainError: any) {
          console.log(chalk.yellow(`   ⚠️  Could not resolve tenant from domain: ${domainError.message}`));
        }
      }
      
      throw new Error(`Failed to get tenant ID: ${error.message}`);
    }
  }
  
  async assignCurrentUserToApp(servicePrincipalId: string): Promise<void> {
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
    console.log(chalk.gray('2. Generate a SCIM token in GitHub'));
    console.log(chalk.gray('3. Return to Azure AD > Enterprise Applications > Your GitHub App'));
    console.log(chalk.gray('4. Configure provisioning with the SCIM endpoint and token\n'));  
  }
  
  // Validate that the service principal is from the correct GitHub Enterprise gallery app
  async validateGitHubEnterpriseApp(servicePrincipalId: string): Promise<void> {
    try {
      console.log(chalk.gray('   Validating GitHub Enterprise application...'));
      
      // Get service principal details
      const servicePrincipal = await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}`)
        .select('id,displayName,appId,tags,servicePrincipalType,appDisplayName')
        .get();
      
      console.log(chalk.gray(`   App: ${servicePrincipal.displayName || servicePrincipal.appDisplayName}`));
      console.log(chalk.gray(`   Type: ${servicePrincipal.servicePrincipalType}`));
      console.log(chalk.gray(`   Tags: ${JSON.stringify(servicePrincipal.tags || [])}`));
      
      // Validate it's a gallery application (not custom)
      if (servicePrincipal.servicePrincipalType !== 'Application') {
        console.log(chalk.yellow('   ⚠️  Service principal type is not "Application"'));
      }
      
      // Check if it's from a gallery template (gallery apps typically have specific tags)
      const hasGalleryTag = (servicePrincipal.tags || []).some((tag: string) => 
        tag.includes('Gallery') || tag.includes('Template') || tag.includes('WindowsAzureActiveDirectoryOnPremApp')
      );
      
      if (!hasGalleryTag) {
        console.log(chalk.yellow('   ⚠️  Application does not appear to be from the Azure gallery'));
        console.log(chalk.yellow('   This may cause SCIM provisioning issues if it\'s a custom SAML app'));
      }
      
      // Validate display name contains GitHub
      const displayName = (servicePrincipal.displayName || servicePrincipal.appDisplayName || '').toLowerCase();
      if (!displayName.includes('github')) {
        console.log(chalk.yellow('   ⚠️  Application name does not contain "GitHub"'));
      }
      
      // Check for synchronization template availability
      console.log(chalk.gray('   Checking for SCIM provisioning support...'));
      const templates = await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}/synchronization/templates`)
        .get();
      
      if (!templates.value || templates.value.length === 0) {
        console.log(chalk.red('   ❌ No synchronization templates found'));
        console.log(chalk.yellow('   This application does not support SCIM provisioning'));
        console.log(chalk.gray('   Ensure you used the "GitHub Enterprise Managed User" gallery app'));
        throw new Error('No SCIM synchronization templates found. Please recreate using "GitHub Enterprise Managed User" gallery app.');
      }
      
      console.log(chalk.green(`   ✅ Application validation passed (${templates.value.length} sync template(s) found)`));
      
    } catch (error: any) {
      if (error.message.includes('No SCIM synchronization templates')) {
        throw error; // Re-throw our specific error
      }
      throw new Error(`Failed to validate GitHub Enterprise application: ${error.message}`);
    }  
  }

  // Simplified SCIM provisioning method based on working version
  async configureSCIMProvisioning(servicePrincipalId: string, scimEndpoint: string, scimToken: string): Promise<void> {
    try {
      console.log(chalk.gray('   Configuring SCIM provisioning settings...'));
      
      // STRICT: Validate that we have the correct GitHub Enterprise application first
      await this.validateGitHubEnterpriseApp(servicePrincipalId);
      
      // Set the SCIM endpoint and authentication
      console.log(chalk.gray('   Setting SCIM endpoint and authentication...'));
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
        });      
      
      console.log(chalk.green('   ✅ SCIM endpoint and token configured'));
      // Get available synchronization templates for this service principal
      console.log(chalk.gray('   Checking for synchronization templates...'));
      const templates = await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}/synchronization/templates`)
        .get();

      let templateId = null;
      if (templates.value && templates.value.length > 0) {
        // STRICT: Validate that we have the correct template for GitHub Enterprise Managed User
        console.log(chalk.gray(`   Found ${templates.value.length} synchronization template(s):`));
        
        // Log all available templates for debugging
        templates.value.forEach((template: any, index: number) => {
          console.log(chalk.gray(`     ${index + 1}. Template ID: ${template.id}`));
          console.log(chalk.gray(`        Application ID: ${template.applicationId || 'Not specified'}`));
          console.log(chalk.gray(`        Description: ${template.description || 'No description'}`));
          console.log(chalk.gray(`        Metadata: ${JSON.stringify(template.metadata || {}, null, 2)}`));
        });

        // STRICT: Validate template selection
        // For GitHub Enterprise Managed User, we should have specific template characteristics
        let validTemplate = null;
        
        // Strategy 1: Look for template with GitHub-related metadata or description
        validTemplate = templates.value.find((template: any) => {
          const description = (template.description || '').toLowerCase();
          const metadata = JSON.stringify(template.metadata || {}).toLowerCase();
          return description.includes('github') || metadata.includes('github') || 
                 description.includes('manageduser') || metadata.includes('manageduser');
        });

        // Strategy 2: If no GitHub-specific template found and we only have one template, 
        // validate it's from the correct gallery app by checking context
        if (!validTemplate && templates.value.length === 1) {
          // Since we got here from the GitHub Enterprise Managed User gallery app,
          // the single template should be the correct one
          validTemplate = templates.value[0];
          console.log(chalk.yellow('   ⚠️  Single template found - assuming it\'s correct since we\'re from the GitHub gallery app'));
        }

        // Strategy 3: If multiple templates and none are clearly GitHub-related, this is an error
        if (!validTemplate && templates.value.length > 1) {
          console.log(chalk.red('   ❌ Multiple sync templates found but none appear to be GitHub-specific'));
          console.log(chalk.yellow('   This suggests the wrong gallery application was used.'));
          console.log(chalk.gray('   Expected: GitHub Enterprise Managed User gallery app'));
          throw new Error('Multiple sync templates found but none are GitHub-specific. Please recreate the app using the "GitHub Enterprise Managed User" gallery template.');
        }

        if (validTemplate) {
          templateId = validTemplate.id;
          console.log(chalk.green(`   ✅ Using validated synchronization template: ${templateId}`));
          
          // Additional validation
          if (!templateId) {
            console.log(chalk.yellow('   ⚠️  Template found but ID is null/undefined'));
            console.log(chalk.gray(`   Template object: ${JSON.stringify(validTemplate, null, 2)}`));
            throw new Error('Template ID is null - this indicates an issue with the gallery application template');
          }
        } else {
          console.log(chalk.red('   ❌ No valid GitHub Enterprise synchronization template found'));
          throw new Error('No GitHub Enterprise sync template found. Please recreate the application using the "GitHub Enterprise Managed User" gallery template.');
        }
      } else {
        console.log(chalk.red('   ❌ No synchronization templates found for this application'));
        console.log(chalk.yellow('   This indicates the application does not support SCIM provisioning.'));
        console.log(chalk.gray('   Possible causes:'));
        console.log(chalk.gray('     1. Wrong gallery application was used (should be "GitHub Enterprise Managed User")'));
        console.log(chalk.gray('     2. Application was manually created instead of from gallery'));
        console.log(chalk.gray('     3. Application template is corrupted'));
        throw new Error('No synchronization templates found. This application does not support SCIM provisioning.');
      }

      // Check if a job already exists
      console.log(chalk.gray('   Checking for existing synchronization jobs...'));
      const existingJobs = await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}/synchronization/jobs`)
        .get();

      if (existingJobs.value && existingJobs.value.length > 0) {
        console.log(chalk.green('   ✅ SCIM provisioning job already exists'));
        
        // Update existing job to ensure it's configured correctly
        const jobId = existingJobs.value[0].id;
        console.log(chalk.gray(`   Updating existing job: ${jobId}`));
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
        console.log(chalk.gray('   Creating new synchronization job...'));
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
      
      // Verify the service principal exists before testing
      try {
        await this.graphClient
          .api(`/servicePrincipals/${servicePrincipalId}`)
          .select('id,displayName')
          .get();
      } catch (verifyError: any) {
        console.log(chalk.yellow(`   ⚠️  Service principal not found before SCIM test: ${verifyError.message}`));
        return false;
      }
      
      // First, get the synchronization job to find the template ID
      const jobs = await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}/synchronization/jobs`)
        .get();
      
      if (!jobs.value || jobs.value.length === 0) {
        console.log(chalk.yellow('   ⚠️  No synchronization jobs found - skipping connection test'));
        return false;
      }
      
      const syncJob = jobs.value[0];
      const templateId = syncJob.templateId;
      
      if (!templateId) {
        console.log(chalk.yellow('   ⚠️  Template ID not found in synchronization job - skipping connection test'));
        return false;
      }
      
      console.log(chalk.gray(`   Using template ID: ${templateId}`));
        
      // Test the provisioning connection with saved credentials
      await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}/synchronization/jobs/${syncJob.id}/validateCredentials`)
        .post({
          templateId: templateId,
          useSavedCredentials: true
        });
        
      // Verify the service principal still exists after the test
      try {
        await this.graphClient
          .api(`/servicePrincipals/${servicePrincipalId}`)
          .select('id,displayName')
          .get();
        console.log(chalk.green('   ✅ SCIM connection test successful'));
        return true;
      } catch (verifyError: any) {
        throw new Error(`Service principal was deleted during SCIM connection test: ${verifyError.message}`);
      }
        
    } catch (error: any) {
      console.log(chalk.yellow(`   ⚠️  SCIM connection test failed: ${error.message}`));
      return false;
    }
  }

  async enableProvisioningOnDemand(servicePrincipalId: string): Promise<void> {
    try {
      console.log(chalk.gray('   Enabling on-demand provisioning...'));
      
      // Verify the service principal exists before making changes
      try {
        const servicePrincipal = await this.graphClient
          .api(`/servicePrincipals/${servicePrincipalId}`)
          .select('id,displayName,preferredSingleSignOnMode,tags')
          .get();
        console.log(chalk.gray(`   ✅ Service principal verified: ${servicePrincipal.displayName}`));
      } catch (verifyError: any) {
        throw new Error(`Service principal not found before enabling on-demand provisioning: ${verifyError.message}`);
      }
      
      // Be more conservative with tags - only add what's necessary
      await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}`)
        .patch({
          preferredSingleSignOnMode: "saml",
          tags: ["WindowsAzureActiveDirectoryOnPremApp"] // Remove "ProvisioningOnDemand" as it might cause issues
        });
        
      // Verify the service principal still exists after the change
      try {
        await this.graphClient
          .api(`/servicePrincipals/${servicePrincipalId}`)
          .select('id,displayName')
          .get();
        console.log(chalk.green('   ✅ On-demand provisioning enabled safely'));
      } catch (verifyError: any) {
        throw new Error(`Service principal was deleted after enabling on-demand provisioning: ${verifyError.message}`);
      }
        
    } catch (error: any) {
      console.log(chalk.yellow(`   ⚠️  Could not enable on-demand provisioning: ${error.message}`));
      // Don't throw error here - this is not critical for basic SCIM setup
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

  /**
   * Validates that the Entra ID application exists and is properly configured
   */  
  async validateEnterpriseApp(): Promise<{ success: boolean; message: string }> {
    try {
      // Search for GitHub Enterprise applications in the tenant
      // Note: We'll get all service principals and filter client-side since Graph API has limited filter support
      const servicePrincipals = await this.graphClient
        .api('/servicePrincipals')
        .select('id,displayName,appId,preferredSingleSignOnMode,servicePrincipalType')
        .get();      
        if (!servicePrincipals.value || servicePrincipals.value.length === 0) {
        return {
          success: false,
          message: 'No applications found in Entra ID'
        };
      }

      // Filter for GitHub Enterprise applications client-side
      const githubApps = servicePrincipals.value.filter((sp: any) => 
        sp.displayName && sp.displayName.toLowerCase().includes('github')
      );

      if (githubApps.length === 0) {
        return {
          success: false,
          message: 'No GitHub Enterprise applications found in Entra ID'
        };
      }      // Check if any GitHub app has SAML SSO configured
      const samlApps = githubApps.filter((sp: any) => 
        sp.preferredSingleSignOnMode === 'saml'
      );

      if (samlApps.length === 0) {
        return {
          success: false,
          message: `Found ${githubApps.length} GitHub app(s) but none configured for SAML SSO`
        };
      }

      return {
        success: true,
        message: `Found ${samlApps.length} GitHub Enterprise app(s) with SAML SSO configured`
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error checking Entra ID applications: ${error.message}`
      };
    }
  }

  /**
   * Validates the SAML configuration for GitHub Enterprise applications
   */  
  async validateSAMLConfig(enterpriseName: string): Promise<{ success: boolean; message: string }> {
    try {
      // Get all service principals and filter client-side
      const servicePrincipals = await this.graphClient
        .api('/servicePrincipals')
        .select('id,displayName,appId,preferredSingleSignOnMode')
        .get();

      if (!servicePrincipals.value || servicePrincipals.value.length === 0) {
        return {
          success: false,
          message: 'No applications found in Entra ID'
        };
      }

      // Filter for GitHub Enterprise applications with SAML SSO
      const githubSamlApps = servicePrincipals.value.filter((sp: any) => 
        sp.displayName && 
        sp.displayName.toLowerCase().includes('github') && 
        sp.preferredSingleSignOnMode === 'saml'
      );

      if (githubSamlApps.length === 0) {
        return {
          success: false,
          message: 'No GitHub Enterprise applications with SAML SSO found'
        };
      }      const validationResults = [];

      for (const sp of githubSamlApps) {
        try {
          // Get the associated application
          const applications = await this.graphClient
            .api('/applications')
            .filter(`appId eq '${sp.appId}'`)
            .select('id,identifierUris,web')
            .get();

          if (!applications.value || applications.value.length === 0) {
            validationResults.push(`${sp.displayName}: Associated application not found`);
            continue;
          }

          const app = applications.value[0];
          const issues = [];

          // Use getBaseUrls helper for both checks
          const { web } = getBaseUrls(this.envType, enterpriseName);
          // Check identifier URIs (Entity ID)
          if (!app.identifierUris || app.identifierUris.length === 0) {
            issues.push('Missing Entity ID (identifier URIs)');
          } else {
            const hasGitHubEntityId = app.identifierUris.some((uri: string) => 
              uri.includes(web + '/enterprises')
            );
            if (!hasGitHubEntityId) {
              issues.push('Entity ID does not match GitHub Enterprise format');
            }
          }

          // Check redirect URIs (Reply URLs)
          if (!app.web?.redirectUris || app.web.redirectUris.length === 0) {
            issues.push('Missing Reply URLs');
          } else {
            const hasGitHubReplyUrl = app.web.redirectUris.some((uri: string) => 
              uri.includes(web + '/enterprises') && uri.includes('/saml/consume')
            );
            if (!hasGitHubReplyUrl) {
              issues.push('Reply URL does not match GitHub Enterprise SAML consume URL');
            }
          }

          if (issues.length === 0) {
            validationResults.push(`${sp.displayName}: ✅ SAML configuration valid`);
          } else {
            validationResults.push(`${sp.displayName}: ❌ ${issues.join(', ')}`);
          }

        } catch (error: any) {
          validationResults.push(`${sp.displayName}: Error checking configuration - ${error.message}`);
        }
      }

      const hasErrors = validationResults.some(result => result.includes('❌') || result.includes('Error'));

      return {
        success: !hasErrors,
        message: validationResults.join('; ')
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error validating SAML configuration: ${error.message}`
      };
    }
  }

  /**
   * Validates the SAML signing certificates for GitHub Enterprise applications
   */  
  async validateCertificate(): Promise<{ success: boolean; message: string }> {
    try {
      // Get all service principals and filter client-side
      const servicePrincipals = await this.graphClient
        .api('/servicePrincipals')
        .select('id,displayName,preferredSingleSignOnMode')
        .get();

      if (!servicePrincipals.value || servicePrincipals.value.length === 0) {
        return {
          success: false,
          message: 'No applications found in Entra ID'
        };
      }

      // Filter for GitHub Enterprise applications with SAML SSO
      const githubSamlApps = servicePrincipals.value.filter((sp: any) => 
        sp.displayName && 
        sp.displayName.toLowerCase().includes('github') && 
        sp.preferredSingleSignOnMode === 'saml'
      );

      if (githubSamlApps.length === 0) {
        return {
          success: false,
          message: 'No GitHub Enterprise applications with SAML SSO found'
        };
      }      
      const certificateResults = [];

      for (const sp of githubSamlApps) {
        try {
          // Get signing certificates for the service principal
          const certificates = await this.graphClient
            .api(`/servicePrincipals/${sp.id}`)
            .select('keyCredentials')
            .get();

          if (!certificates.keyCredentials || certificates.keyCredentials.length === 0) {
            certificateResults.push(`${sp.displayName}: ❌ No signing certificates found`);
            continue;
          }

          // Check certificate validity
          const now = new Date();
          const validCertificates = certificates.keyCredentials.filter((cert: any) => {
            const endDate = new Date(cert.endDateTime);
            const usage = cert.usage;
            return usage === 'Sign' && endDate > now;
          });

          if (validCertificates.length === 0) {
            const expiredCerts = certificates.keyCredentials.filter((cert: any) => {
              const endDate = new Date(cert.endDateTime);
              return cert.usage === 'Sign' && endDate <= now;
            });

            if (expiredCerts.length > 0) {
              certificateResults.push(`${sp.displayName}: ❌ All signing certificates have expired`);
            } else {
              certificateResults.push(`${sp.displayName}: ❌ No valid signing certificates found`);
            }
          } else {
            // Check for certificates expiring soon (within 30 days)
            const soonToExpire = validCertificates.filter((cert: any) => {
              const endDate = new Date(cert.endDateTime);
              const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
              return endDate <= thirtyDaysFromNow;
            });

            if (soonToExpire.length > 0) {
              const expiryDates = soonToExpire.map((cert: any) => 
                new Date(cert.endDateTime).toLocaleDateString()
              ).join(', ');
              certificateResults.push(`${sp.displayName}: ⚠️ ${validCertificates.length} valid certificate(s), ${soonToExpire.length} expiring soon (${expiryDates})`);
            } else {
              const nextExpiry = validCertificates.reduce((earliest: any, cert: any) => {
                const certDate = new Date(cert.endDateTime);
                const earliestDate = new Date(earliest.endDateTime);
                return certDate < earliestDate ? cert : earliest;
              });
              const nextExpiryDate = new Date(nextExpiry.endDateTime).toLocaleDateString();
              certificateResults.push(`${sp.displayName}: ✅ ${validCertificates.length} valid certificate(s), next expiry: ${nextExpiryDate}`);
            }
          }

        } catch (error: any) {
          certificateResults.push(`${sp.displayName}: Error checking certificates - ${error.message}`);
        }
      }

      const hasErrors = certificateResults.some(result => result.includes('❌') || result.includes('Error'));
      const hasWarnings = certificateResults.some(result => result.includes('⚠️'));

      return {
        success: !hasErrors,
        message: certificateResults.join('; ')
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error validating certificates: ${error.message}`
      };
    }
  }

  /**
   * Diagnostic method to check if a service principal exists and get its current state
   */
  async diagnoseSCIMIssues(servicePrincipalId: string, enterpriseName: string): Promise<{ exists: boolean; details?: any; recommendations: string[] }> {
    const recommendations: string[] = [];
    
    try {
      // Check if service principal still exists
      const servicePrincipal = await this.graphClient
        .api(`/servicePrincipals/${servicePrincipalId}`)
        .select('id,displayName,preferredSingleSignOnMode,tags,appId')
        .get();
      
      console.log(chalk.green(`✅ Service Principal exists: ${servicePrincipal.displayName}`));
      
      // Check associated application
      let application = null;
      try {
        const applications = await this.graphClient
          .api('/applications')
          .filter(`appId eq '${servicePrincipal.appId}'`)
          .select('id,displayName,identifierUris,web')
          .get();
        
        if (applications.value && applications.value.length > 0) {
          application = applications.value[0];
          console.log(chalk.green(`✅ Associated Application exists: ${application.displayName}`));
        } else {
          console.log(chalk.red(`❌ Associated Application not found for appId: ${servicePrincipal.appId}`));
          recommendations.push('The Application Registration may have been deleted - this could cause the Service Principal to be removed');
        }
      } catch (appError: any) {
        console.log(chalk.red(`❌ Error checking associated application: ${appError.message}`));
        recommendations.push('Unable to verify associated Application Registration');
      }
      
      // Check SCIM configuration
      try {
        const syncJobs = await this.graphClient
          .api(`/servicePrincipals/${servicePrincipalId}/synchronization/jobs`)
          .get();
        
        if (syncJobs.value && syncJobs.value.length > 0) {
          console.log(chalk.green(`✅ SCIM Jobs found: ${syncJobs.value.length}`));
          
          // Check job status
          syncJobs.value.forEach((job: any, index: number) => {
            console.log(chalk.gray(`   Job ${index + 1}: ${job.templateId} - Status: ${job.schedule?.state || 'Unknown'}`));
          });
        } else {
          console.log(chalk.yellow(`⚠️  No SCIM synchronization jobs found`));
          recommendations.push('SCIM provisioning may not be properly configured');
        }
      } catch (scimError: any) {
        console.log(chalk.yellow(`⚠️  Error checking SCIM jobs: ${scimError.message}`));
        recommendations.push('Unable to verify SCIM configuration - this may indicate the service principal is in an invalid state');
      }
      
      // Check for common issues
      if (servicePrincipal.preferredSingleSignOnMode !== 'saml') {
        recommendations.push(`SSO mode is '${servicePrincipal.preferredSingleSignOnMode}' instead of 'saml'`);
      }
      
      // Check SAML configuration
      if (application) {
        const { web } = getBaseUrls(this.envType, enterpriseName);
        const expectedEntityId = `${web}/enterprises/${enterpriseName}`;
        const expectedReplyUrl = `${web}/enterprises/${enterpriseName}/saml/consume`;
        const hasCorrectEntityId = application.identifierUris?.includes(expectedEntityId);
        const hasCorrectReplyUrl = application.web?.redirectUris?.includes(expectedReplyUrl);
        if (!hasCorrectEntityId) {
          recommendations.push(`Entity ID configuration may be incorrect - expected: ${expectedEntityId}`);
        }
        if (!hasCorrectReplyUrl) {
          recommendations.push(`Reply URL configuration may be incorrect - expected: ${expectedReplyUrl}`);
        }
      }
      
      return {
        exists: true,
        details: {
          servicePrincipal,
          application,
          hasSCIMJobs: false // Will be updated if jobs are found
        },
        recommendations
      };
      
    } catch (error: any) {
      console.log(chalk.red(`❌ Service Principal not found: ${error.message}`));
      
      // Check if the application registration still exists
      try {
        const allApps = await this.graphClient
          .api('/applications')
          .filter(`displayName eq 'GitHub Enterprise SSO - ${enterpriseName}'`)
          .select('id,displayName,appId')
          .get();
        
        if (allApps.value && allApps.value.length > 0) {
          console.log(chalk.yellow(`⚠️  Found Application Registration but no Service Principal`));
          console.log(chalk.gray(`   App: ${allApps.value[0].displayName} (${allApps.value[0].appId})`));
          recommendations.push('Application Registration exists but Service Principal was deleted');
          recommendations.push('Try recreating the Service Principal for the existing Application');
          recommendations.push('Or delete the Application Registration and run setup again');
        } else {
          console.log(chalk.red(`❌ No matching Application Registration found either`));
          recommendations.push('Both Service Principal and Application Registration are missing');
          recommendations.push('Run the setup command again to recreate the application');
        }
      } catch (appSearchError: any) {
        recommendations.push('Unable to check for remaining Application Registrations');
      }
      
      return {
        exists: false,
        recommendations
      };
    }
  }
}
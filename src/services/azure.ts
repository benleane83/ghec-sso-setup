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
  }
}

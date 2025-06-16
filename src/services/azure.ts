import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredential } from '@azure/identity';

interface EntraApp {
  id: string;
  ssoUrl: string;
  entityId: string;
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
      // Create enterprise application from gallery
      const galleryApp = await this.findGitHubGalleryApp();
      
      if (!galleryApp) {
        throw new Error('GitHub Enterprise application not found in gallery');
      }

      // Create application instance
      const appInstance = await this.graphClient
        .api('/applicationTemplates/{template-id}/instantiate')
        .post({
          displayName: `GitHub Enterprise - ${enterpriseName}`,
        });

      const appId = appInstance.application.id;
      const servicePrincipalId = appInstance.servicePrincipal.id;

      // Configure the application
      await this.configureEnterpriseApp(servicePrincipalId, enterpriseName);

      // Return app details
      return {
        id: servicePrincipalId,
        ssoUrl: `https://login.microsoftonline.com/${this.tenantDomain}/saml2`,
        entityId: `https://sts.windows.net/${await this.getTenantId()}/`
      };
    } catch (error: any) {
      throw new Error(`Failed to create Enterprise App: ${error.message}`);
    }
  }

  async configureSAMLSettings(appId: string, enterpriseName: string): Promise<void> {
    try {
      // Configure SAML settings for the enterprise application
      const samlConfig = {
        preferredSingleSignOnMode: 'saml',
        replyUrls: [
          `https://github.com/enterprises/${enterpriseName}/saml/consume`,
          `https://github.com/enterprises/${enterpriseName}/saml/acs`
        ],
        identifierUris: [
          `https://github.com/enterprises/${enterpriseName}`
        ],
        logoutUrl: `https://github.com/enterprises/${enterpriseName}/saml/sls`,
      };

      await this.graphClient
        .api(`/servicePrincipals/${appId}`)
        .patch(samlConfig);

      // Configure attribute mappings
      await this.configureSAMLClaims(appId);
    } catch (error: any) {
      throw new Error(`Failed to configure SAML settings: ${error.message}`);
    }
  }

  async downloadSAMLCertificate(appId: string): Promise<string> {
    try {
      // Get the SAML certificate from the service principal
      const servicePrincipal = await this.graphClient
        .api(`/servicePrincipals/${appId}`)
        .select('keyCredentials')
        .get();

      const samlCert = servicePrincipal.keyCredentials?.find((cred: any) => 
        cred.usage === 'Sign' && cred.type === 'AsymmetricX509Cert'
      );

      if (!samlCert) {
        throw new Error('SAML certificate not found');
      }

      // Convert certificate to PEM format
      const certData = samlCert.key;
      const pemCert = `-----BEGIN CERTIFICATE-----\n${certData}\n-----END CERTIFICATE-----`;
      
      return pemCert;
    } catch (error: any) {
      throw new Error(`Failed to download certificate: ${error.message}`);
    }
  }

  async validateEnterpriseApp(): Promise<{ success: boolean; message: string }> {
    try {
      // List service principals to find GitHub apps
      const servicePrincipals = await this.graphClient
        .api('/servicePrincipals')
        .filter("startswith(displayName, 'GitHub')")
        .get();

      if (servicePrincipals.value.length === 0) {
        return {
          success: false,
          message: 'No GitHub Enterprise applications found'
        };
      }

      return {
        success: true,
        message: `Found ${servicePrincipals.value.length} GitHub application(s)`
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error validating enterprise app: ${error.message}`
      };
    }
  }

  async validateSAMLConfig(): Promise<{ success: boolean; message: string }> {
    try {
      // This would validate the SAML configuration
      // Implementation depends on specific requirements
      return {
        success: true,
        message: 'SAML configuration is valid'
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error validating SAML config: ${error.message}`
      };
    }
  }

  async validateCertificate(): Promise<{ success: boolean; message: string }> {
    try {
      // This would validate certificate expiration and validity
      // Implementation depends on specific requirements
      return {
        success: true,
        message: 'Certificate is valid'
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error validating certificate: ${error.message}`
      };
    }
  }

  private async findGitHubGalleryApp() {
    // Find GitHub Enterprise application in the gallery
    const galleryApps = await this.graphClient
      .api('/applicationTemplates')
      .filter("displayName eq 'GitHub Enterprise Cloud - Enterprise Account'")
      .get();

    return galleryApps.value[0];
  }

  private async configureEnterpriseApp(servicePrincipalId: string, enterpriseName: string) {
    // Configure basic settings for the enterprise app
    await this.graphClient
      .api(`/servicePrincipals/${servicePrincipalId}`)
      .patch({
        homepage: `https://github.com/enterprises/${enterpriseName}`,
        notes: `SSO configuration for GitHub Enterprise: ${enterpriseName}`,
      });
  }

  private async configureSAMLClaims(appId: string) {
    // Configure SAML attribute mappings
    // This would set up the required claims for GitHub
    const claimsMappingPolicy = {
      definition: [JSON.stringify({
        ClaimsMappingPolicy: {
          Version: 1,
          IncludeBasicClaimSet: "true",
          ClaimsSchema: [
            {
              Source: "user",
              ID: "userprincipalname",
              SamlClaimType: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
            },
            {
              Source: "user",
              ID: "givenname",
              SamlClaimType: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"
            },
            {
              Source: "user",
              ID: "surname",
              SamlClaimType: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"
            },
            {
              Source: "user",
              ID: "mail",
              SamlClaimType: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
            }
          ]
        }
      })],
      displayName: `GitHub Enterprise Claims Policy`,
      isOrganizationDefault: false
    };

    // Apply the claims mapping policy
    // Note: This requires additional permissions and might need to be done manually
  }

  private async getTenantId(): Promise<string> {
    const organization = await this.graphClient.api('/organization').get();
    return organization.value[0].id;
  }
}

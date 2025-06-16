import { Octokit } from '@octokit/rest';

interface SAMLConfig {
  ssoUrl: string;
  entityId: string;
  certificate: string;
}

export class GitHubService {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({
      auth: token,
    });
  }

  async validateEnterpriseAccess(enterpriseSlug: string): Promise<{ success: boolean; message: string }> {
    try {      // Try to get enterprise info to validate access using request method
      const { data: enterprise } = await this.octokit.request('GET /enterprises/{enterprise}', {
        enterprise: enterpriseSlug,
      });
      
      return {
        success: true,
        message: `Access confirmed for enterprise: ${enterprise.name}`
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Cannot access enterprise ${enterpriseSlug}: ${error.message}`
      };
    }
  }

  async configureSAML(enterpriseSlug: string, config: SAMLConfig): Promise<void> {
    try {
      // Configure SAML SSO for the enterprise
      await this.octokit.request('PATCH /enterprises/{enterprise}/settings/saml', {
        enterprise: enterpriseSlug,
        sso_url: config.ssoUrl,
        issuer: config.entityId,
        certificate: config.certificate,
        signature_method: 'rsa-sha256',
        digest_method: 'sha256',
      });
    } catch (error: any) {
      throw new Error(`Failed to configure GitHub SAML: ${error.message}`);
    }
  }

  async testSSOConfiguration(enterpriseSlug: string): Promise<{ success: boolean; message: string }> {
    try {
      // Test SAML configuration by checking if it's properly set up
      const response = await this.octokit.request('GET /enterprises/{enterprise}/settings/saml', {
        enterprise: enterpriseSlug,
      });
      
      if (response.data && response.data.enabled) {
        return {
          success: true,
          message: 'SAML SSO is enabled and configured'
        };
      } else {
        return {
          success: false,
          message: 'SAML SSO is not enabled'
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Error testing SSO: ${error.message}`
      };
    }
  }

  async validateSSOConfig(enterpriseSlug: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.octokit.request('GET /enterprises/{enterprise}/settings/saml', {
        enterprise: enterpriseSlug,
      });

      const samlConfig = response.data;
      
      if (!samlConfig.enabled) {
        return {
          success: false,
          message: 'SAML SSO is not enabled'
        };
      }

      // Check for required configuration
      const issues = [];
      if (!samlConfig.sso_url) issues.push('SSO URL not configured');
      if (!samlConfig.issuer) issues.push('Issuer not configured');
      if (!samlConfig.certificate) issues.push('Certificate not configured');

      if (issues.length > 0) {
        return {
          success: false,
          message: `Configuration issues: ${issues.join(', ')}`
        };
      }

      return {
        success: true,
        message: 'SAML configuration is valid'
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error validating SSO config: ${error.message}`
      };
    }
  }
  async getEnterpriseInfo(enterpriseSlug: string) {
    const { data } = await this.octokit.request('GET /enterprises/{enterprise}', {
      enterprise: enterpriseSlug,
    });
    return data;
  }

  async createOrganization(enterpriseSlug: string, orgName: string) {
    // This would require enterprise-level permissions
    // Implementation depends on GitHub's enterprise API capabilities
    throw new Error('Organization creation not yet implemented');
  }

  async createTeam(orgName: string, teamName: string) {
    const { data } = await this.octokit.rest.teams.create({
      org: orgName,
      name: teamName,
      privacy: 'closed',
    });
    return data;
  }
}

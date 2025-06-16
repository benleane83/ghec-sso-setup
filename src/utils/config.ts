const Conf = require('conf');

interface EnterpriseConfig {
  github: {
    enterpriseSlug: string;
    apiUrl?: string;
    authMethod?: 'token' | 'app' | 'device';
  };
  azure: {
    tenantId?: string;
    tenantDomain: string;
    subscriptionId?: string;
  };
  sso: {
    method?: 'saml' | 'oidc';
    status: 'not-configured' | 'in-progress' | 'configured' | 'error';
    lastConfigured?: string;
  };
}

interface CliConfig {
  currentEnterprise?: string;
  profiles: {
    [enterpriseName: string]: EnterpriseConfig;
  };
  auth: {
    githubToken?: string;
  };
}

export class ConfigManager {
  private config: any;

  constructor() {
    this.config = new Conf({
      projectName: 'ghec-sso-cli',
      defaults: {
        profiles: {},
        auth: {}
      }
    });
  }

  setCurrentEnterprise(enterpriseName: string, enterpriseConfig: EnterpriseConfig): void {
    this.config.set('currentEnterprise', enterpriseName);
    this.config.set(`profiles.${enterpriseName}`, enterpriseConfig);
  }

  getCurrentEnterprise(): string | undefined {
    return this.config.get('currentEnterprise');
  }

  getEnterpriseConfig(enterpriseName: string): EnterpriseConfig | undefined {
    return this.config.get(`profiles.${enterpriseName}`);
  }

  updateEnterpriseConfig(enterpriseName: string, updates: Partial<EnterpriseConfig>): void {
    const currentConfig = this.getEnterpriseConfig(enterpriseName);
    if (currentConfig) {
      const updatedConfig = { ...currentConfig, ...updates };
      this.config.set(`profiles.${enterpriseName}`, updatedConfig);
    }
  }

  setGitHubToken(token: string): void {
    this.config.set('auth.githubToken', token);
  }

  getGitHubToken(): string | undefined {
    return this.config.get('auth.githubToken');
  }

  clearAuth(): void {
    this.config.delete('auth');
  }

  getAllProfiles(): { [enterpriseName: string]: EnterpriseConfig } {
    return this.config.get('profiles');
  }
  deleteProfile(enterpriseName: string): void {
    const profiles = this.config.get('profiles');
    delete profiles[enterpriseName];
    this.config.set('profiles', profiles);
    
    // If this was the current enterprise, clear it
    if (this.getCurrentEnterprise() === enterpriseName) {
      this.config.delete('currentEnterprise');
    }
  }

  getConfigPath(): string {
    return this.config.path;
  }
}

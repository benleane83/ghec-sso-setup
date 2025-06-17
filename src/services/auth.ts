import { createOAuthDeviceAuth } from '@octokit/auth-oauth-device';
import { DeviceCodeCredential, AzureCliCredential } from '@azure/identity';
import open from 'open';
import chalk from 'chalk';
import { ConfigManager } from '../utils/config';

export class AuthService {
  private configManager: ConfigManager;

  constructor() {
    this.configManager = new ConfigManager();
  }

  async authenticateGitHub(): Promise<string> {
    try {
      // Check for existing token first
      const existingToken = this.configManager.getGitHubToken();
      if (existingToken && await this.validateGitHubToken(existingToken)) {
        console.log(chalk.green('✅ Using existing GitHub authentication'));
        return existingToken;
      }      console.log(chalk.cyan('🔐 Starting GitHub device flow authentication...'));
      
      const auth = createOAuthDeviceAuth({
        clientType: "oauth-app",
        clientId: "Iv1.b507a08c87ecfe98", // GitHub CLI client ID (public)
        scopes: [
          "admin:enterprise",     // Enterprise administration
          "read:enterprise",      // Read enterprise data
          "write:org",           // Organization management
          "read:org",            // Organization reading
          "repo",                // Repository access (might be needed)
          "user"                 // User information
        ],
        onVerification(verification: any) {
          console.log(chalk.yellow(`\n📱 Please visit: ${verification.verification_uri}`));
          console.log(chalk.yellow(`🔑 Enter code: ${verification.user_code}\n`));
          console.log(chalk.gray('Make sure to approve ALL requested permissions, especially enterprise scopes!'));
          
          // Auto-open browser
          open(verification.verification_uri).catch(() => {
            console.log(chalk.gray('(Could not auto-open browser)'));
          });
        },
      });

      console.log(chalk.gray('⏳ Waiting for authentication...'));
      console.log(chalk.gray('Requesting scopes: admin:enterprise, read:enterprise, write:org, read:org, repo, user'));
      console.log(chalk.yellow('Important: Make sure to approve enterprise permissions in the browser!'));
      
      const authResult = await auth({
        type: "oauth",
      });

      console.log(chalk.gray('✅ Device flow completed, validating token...'));
      console.log(chalk.gray(`Received token type: ${authResult.type}`));
      
      // Validate the token has the right permissions
      if (await this.validateGitHubToken(authResult.token)) {
        // Store token securely
        this.configManager.setGitHubToken(authResult.token);
        return authResult.token;
      } else {
        throw new Error('Token validation failed - insufficient permissions. Try using a Personal Access Token instead.');
      }
    } catch (error: any) {
      console.log(chalk.yellow('⚠️  Device flow failed, falling back to PAT...'));
      return await this.promptForGitHubPAT();
    }
  }
  async authenticateAzure(tenantDomain?: string): Promise<any> {
    try {
      // Try Azure CLI credential first
      const azureCliCredential = new AzureCliCredential();
      
      // Test the credential
      await azureCliCredential.getToken("https://graph.microsoft.com/.default");
      console.log(chalk.green('✅ Using existing Azure CLI authentication'));
      
      return azureCliCredential;
    } catch {
      console.log(chalk.cyan('🔐 No Azure CLI session found, starting device flow...'));
      return await this.azureDeviceFlow(tenantDomain);
    }
  }  private async azureDeviceFlow(tenantDomain?: string): Promise<DeviceCodeCredential> {
    // Normalize the tenant domain format
    let tenantId = "common";
    
    if (tenantDomain) {
      // Handle both formats: "company" or "company.onmicrosoft.com"
      if (tenantDomain.includes('.onmicrosoft.com')) {
        tenantId = tenantDomain; // Already in correct format
      } else {
        tenantId = `${tenantDomain}.onmicrosoft.com`; // Add suffix
      }
    }
    
    console.log(chalk.gray(tenantDomain ? 
      `   Authenticating to tenant: ${tenantId}` : 
      '   Authenticating to default tenant (common)'
    ));
    
    const credential = new DeviceCodeCredential({
      tenantId: tenantId,
      clientId: "04b07795-8ddb-461a-bbee-02f9e1bf7b46", // Azure CLI client ID (public)
      userPromptCallback: (info: any) => {
        console.log(chalk.yellow(`\n📱 Please visit: ${info.verificationUri}`));
        console.log(chalk.yellow(`🔑 Enter code: ${info.userCode}\n`));
        
        // Auto-open browser
        open(info.verificationUri).catch(() => {
          console.log(chalk.gray('(Could not auto-open browser)'));
        });
      },
    });

    console.log(chalk.gray('⏳ Waiting for authentication...'));
    
    // Test the credential to trigger the flow
    await credential.getToken("https://graph.microsoft.com/.default");
    
    return credential;
  }
  private async promptForGitHubPAT(): Promise<string> {
    const inquirer = await import('inquirer');
    
    console.log(chalk.cyan('\n🔑 GitHub Personal Access Token Required\n'));
    console.log(chalk.yellow('Device flow authentication failed to get enterprise permissions.'));
    console.log(chalk.yellow('Please create a Personal Access Token with enterprise scopes.\n'));
    console.log(chalk.gray('1. Go to: https://github.com/settings/tokens/new'));
    console.log(chalk.gray('2. Select these scopes:'));
    console.log(chalk.gray('   ✅ admin:enterprise (Enterprise administration)'));
    console.log(chalk.gray('   ✅ read:enterprise (Read enterprise data)'));
    console.log(chalk.gray('   ✅ write:org (Organization management)'));
    console.log(chalk.gray('   ✅ read:org (Read organization data)'));
    console.log(chalk.gray('   ✅ repo (Repository access)'));
    console.log(chalk.gray('3. Generate token and copy it\n'));
    
    const { token } = await inquirer.default.prompt([{
      type: 'password',
      name: 'token',
      message: 'Enter your GitHub Personal Access Token:',
      validate: (input: string) => input.length > 0 || 'Token is required'
    }]);

    // Validate and store token
    console.log(chalk.gray('Validating token...'));
    if (await this.validateGitHubToken(token)) {
      this.configManager.setGitHubToken(token);
      console.log(chalk.green('✅ Token validated and stored'));
      return token;
    } else {
      throw new Error('Invalid GitHub token or insufficient permissions. Please check the token has enterprise scopes.');
    }
  }
  async validateGitHubToken(token: string): Promise<boolean> {
    try {
      const { Octokit } = await import('@octokit/rest');
      const octokit = new Octokit({ 
        auth: token,
        baseUrl: 'https://api.github.com'
      });
      
      // Test 1: Get user info
      const { data: user } = await octokit.rest.users.getAuthenticated();
      console.log(chalk.gray(`   Authenticated as: ${user.login} (${user.email || 'no email'})`));
      
      // Test 2: Check token scopes
      const response = await octokit.request('GET /user');
      const scopes = response.headers['x-oauth-scopes'];
      console.log(chalk.gray(`   Token scopes: ${scopes || 'none'}`));
      
      // Test 3: Check if we can access organizations
      try {
        const { data: orgs } = await octokit.rest.orgs.listForAuthenticatedUser();
        console.log(chalk.gray(`   Organization access: ${orgs.length} organizations`));
      } catch (orgError: any) {
        console.log(chalk.yellow(`   ⚠️  Limited organization access: ${orgError.message}`));
      }
      
      // Test 4: Test a simple enterprise-related endpoint
      try {
        const enterpriseTest = await octokit.request('GET /user/enterprises');
        console.log(chalk.gray(`   Enterprise access test: ${enterpriseTest.data.length} enterprises`));
      } catch (enterpriseError: any) {
        console.log(chalk.yellow(`   ⚠️  Enterprise access test failed: ${enterpriseError.status} - ${enterpriseError.message}`));
        // Don't fail validation just because of this - the error might be informative
      }
      
      return !!user;
    } catch (error: any) {
      console.log(chalk.red(`   ❌ Token validation failed: ${error.message}`));
      return false;
    }
  }

  async checkGitHubAuth(): Promise<boolean> {
    const token = this.configManager.getGitHubToken();
    return token ? await this.validateGitHubToken(token) : false;
  }

  async checkAzureAuth(): Promise<boolean> {
    try {
      const credential = new AzureCliCredential();
      await credential.getToken("https://graph.microsoft.com/.default");
      return true;
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    this.configManager.clearAuth();
    console.log(chalk.green('🗑️  Authentication tokens cleared'));
  }

  getStoredGitHubToken(): string | undefined {
    return this.configManager.getGitHubToken();
  }

  async authenticateWithPAT(): Promise<string> {
    console.log(chalk.cyan('🔑 GitHub Enterprise requires a Personal Access Token\n'));
    console.log(chalk.yellow('Device flow OAuth cannot access enterprise scopes.'));
    console.log(chalk.yellow('Please create a Personal Access Token instead.\n'));
    
    return await this.promptForGitHubPAT();
  }
}

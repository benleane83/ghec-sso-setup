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
        scopes: ["admin:enterprise", "read:org", "write:org"],
        onVerification(verification: any) {
          console.log(chalk.yellow(`\n📱 Please visit: ${verification.verification_uri}`));
          console.log(chalk.yellow(`🔑 Enter code: ${verification.user_code}\n`));
          
          // Auto-open browser
          open(verification.verification_uri).catch(() => {
            console.log(chalk.gray('(Could not auto-open browser)'));
          });
        },
      });

      console.log(chalk.gray('⏳ Waiting for authentication...'));
      const { token } = await auth({
        type: "oauth",
      });

      // Store token securely
      this.configManager.setGitHubToken(token);
      
      return token;
    } catch (error: any) {
      console.log(chalk.yellow('⚠️  Device flow failed, falling back to PAT...'));
      return await this.promptForGitHubPAT();
    }
  }

  async authenticateAzure(): Promise<any> {
    try {
      // Try Azure CLI credential first
      const azureCliCredential = new AzureCliCredential();
      
      // Test the credential
      await azureCliCredential.getToken("https://graph.microsoft.com/.default");
      console.log(chalk.green('✅ Using existing Azure CLI authentication'));
      
      return azureCliCredential;
    } catch {
      console.log(chalk.cyan('🔐 No Azure CLI session found, starting device flow...'));
      return await this.azureDeviceFlow();
    }
  }
  private async azureDeviceFlow(): Promise<DeviceCodeCredential> {
    const credential = new DeviceCodeCredential({
      tenantId: "common", // Allow any tenant
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
    console.log(chalk.gray('Please create a token at: https://github.com/settings/tokens/new'));
    console.log(chalk.gray('Required scopes: admin:enterprise, read:org, write:org\n'));
    
    const { token } = await inquirer.default.prompt([{
      type: 'password',
      name: 'token',
      message: 'Enter your GitHub Personal Access Token:',
      validate: (input: string) => input.length > 0 || 'Token is required'
    }]);

    // Validate and store token
    if (await this.validateGitHubToken(token)) {
      this.configManager.setGitHubToken(token);
      return token;
    } else {
      throw new Error('Invalid GitHub token or insufficient permissions');
    }
  }

  private async validateGitHubToken(token: string): Promise<boolean> {
    try {
      const { Octokit } = await import('@octokit/rest');
      const octokit = new Octokit({ auth: token });
      
      // Test token by getting user info
      const { data: user } = await octokit.rest.users.getAuthenticated();
      
      // Check if user has enterprise access (simplified check)
      return !!user;
    } catch {
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
}

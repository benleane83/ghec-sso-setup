import { Command } from 'commander';
import chalk from 'chalk';
import { AuthService } from '../services/auth';
import { GitHubService } from '../services/github';
import { AzureService } from '../services/azure';
import { ConfigManager } from '../utils/config';
import open from 'open';

interface EntraAppConfig {
  displayName: string;
  signOnUrl: string;
  entityId: string;
  replyUrl: string;
}

export const setupCommand = new Command('setup')
  .description('Setup GitHub Enterprise Cloud SSO with Entra ID')
  .option('-e, --enterprise <name>', 'GitHub Enterprise name')
  .option('-d, --domain <domain>', 'Your organization domain (e.g., company.com)')
  .option('--dry-run', 'Show what would be done without making changes')
  .option('--force', 'Force setup even if validation fails (for trial enterprises)')
  .action(async (options) => {
    console.log(chalk.blue.bold('🚀 GitHub Enterprise Cloud SSO Setup\n'));

    try {
      // Validate authentication
      const authService = new AuthService();
      const githubToken = authService.getStoredGitHubToken();
      
      if (!githubToken) {
        console.log(chalk.red('❌ Not authenticated with GitHub. Run: ghec-sso auth login-pat'));
        return;
      }      // Get configuration
      const configManager = new ConfigManager();
      let config = {
        enterprise: options.enterprise,
        domain: options.domain
      };

      // Prompt for missing configuration
      if (!config.enterprise || !config.domain) {
        const inquirer = await import('inquirer');
        
        const missing = await inquirer.default.prompt([
          {
            type: 'input',
            name: 'enterprise',
            message: 'Enter your GitHub Enterprise name:',
            when: !config.enterprise,
            validate: (input: string) => input.length > 0 || 'Enterprise name is required'
          },
          {
            type: 'input',
            name: 'domain',
            message: 'Enter your organization domain (e.g., company.com):',
            when: !config.domain,
            validate: (input: string) => input.length > 0 || 'Domain is required'
          }
        ]);

        config = { ...config, ...missing };
      }

      console.log(chalk.cyan(`📋 Configuration:`));
      console.log(chalk.gray(`   Enterprise: ${config.enterprise}`));
      console.log(chalk.gray(`   Domain: ${config.domain}`));
      console.log(chalk.gray(`   Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}\n`));      // Initialize services
      const githubService = new GitHubService(githubToken);
      
      // We'll initialize Azure service after we get Azure credentials
      let azureService: AzureService | null = null;

      // Step 2: Get Azure credentials
      console.log(chalk.cyan('� Step 2: Getting Azure credentials...'));
      try {
        const authService = new AuthService();
        const azureCredential = await authService.authenticateAzure();
        azureService = new AzureService(azureCredential, config.domain);
        console.log(chalk.green('✅ Azure authentication validated\n'));
      } catch (error: any) {
        console.log(chalk.red(`❌ Azure authentication failed: ${error.message}`));
        console.log(chalk.yellow('Run: ghec-sso auth login'));
        return;
      }      // Step 3: Create/Configure Entra ID Enterprise Application
      console.log(chalk.cyan('🏢 Step 3: Setting up Entra ID Enterprise Application...'));
      
      const appConfig = {
        displayName: `GitHub Enterprise SSO - ${config.enterprise}`,
        signOnUrl: `https://github.com/enterprises/${config.enterprise}/sso`,
        entityId: `https://github.com/enterprises/${config.enterprise}`,
        replyUrl: `https://github.com/enterprises/${config.enterprise}/saml/consume`
      };

      if (options.dryRun) {
        console.log(chalk.yellow('🧪 DRY RUN: Would create Entra ID app with:'));
        console.log(chalk.gray(`   Display Name: ${appConfig.displayName}`));
        console.log(chalk.gray(`   Sign-On URL: ${appConfig.signOnUrl}`));
        console.log(chalk.gray(`   Entity ID: ${appConfig.entityId}`));
        console.log(chalk.gray(`   Reply URL: ${appConfig.replyUrl}\n`));
      } else {
        try {
          const entraApp = await azureService!.createGitHubEnterpriseApp(config.enterprise);
          await azureService!.configureSAMLSettings(entraApp.id, config.enterprise);
          
          console.log(chalk.green('✅ Entra ID Enterprise Application created\n'));
          
          // Step 4: Get SAML configuration details
          console.log(chalk.cyan('⚙️  Step 4: Getting SAML configuration details...'));
          const certificate = await azureService!.downloadSAMLCertificate(entraApp.id);
          
          console.log(chalk.green('✅ SAML configuration completed\n'));
          
          // Step 5: Output manual configuration details
          console.log(chalk.green.bold('🎉 Setup Complete! Manual Configuration Required:\n'));
          
          console.log(chalk.blue('📋 GitHub Enterprise SAML Configuration:'));
          console.log(chalk.gray('   Copy these values to GitHub Enterprise SAML settings:\n'));
          
          console.log(chalk.yellow('   Sign-On URL:'));
          console.log(chalk.white(`   ${entraApp.ssoUrl}\n`));
          
          console.log(chalk.yellow('   Issuer (Entity ID):'));
          console.log(chalk.white(`   ${entraApp.entityId}\n`));
          
          console.log(chalk.yellow('   Certificate:'));
          console.log(chalk.white(`   ${certificate}\n`));
          
          // Open GitHub SAML configuration page
          const githubSamlUrl = `https://github.com/enterprises/${config.enterprise}/settings/saml_provider/edit`;
          console.log(chalk.cyan('🌐 Opening GitHub Enterprise SAML configuration page...'));
          
          try {
            await open(githubSamlUrl);
            console.log(chalk.green('✅ Browser opened to GitHub SAML settings'));
          } catch (openError) {
            console.log(chalk.yellow('⚠️  Could not auto-open browser'));
            console.log(chalk.gray(`   Please manually visit: ${githubSamlUrl}`));
          }
          
          console.log(chalk.cyan('\n📝 Next Steps:'));
          console.log(chalk.gray('1. In the opened GitHub page, click "Enable SAML authentication"'));
          console.log(chalk.gray('2. Enter the Sign-On URL, Issuer, and Certificate from above'));
          console.log(chalk.gray('3. Test the SAML connection'));
          console.log(chalk.gray('4. Enable "Require SAML SSO authentication" when ready'));
          console.log(chalk.gray('5. Configure user provisioning in Entra ID if needed\n'));
          
        } catch (error: any) {
          console.log(chalk.red(`❌ Setup failed: ${error.message}`));
          console.log(chalk.yellow('\n💡 Manual Setup Instructions:'));
          console.log(chalk.gray('1. Go to Azure Portal > Enterprise Applications'));
          console.log(chalk.gray('2. Click "New application" > "Create your own application"'));
          console.log(chalk.gray(`3. Name it "${appConfig.displayName}"`));
          console.log(chalk.gray('4. Select "Integrate any other application you don\'t find in the gallery"'));
          console.log(chalk.gray('5. Go to "Single sign-on" > "SAML"'));
          console.log(chalk.gray('6. Configure:'));
          console.log(chalk.gray(`   - Identifier (Entity ID): ${appConfig.entityId}`));
          console.log(chalk.gray(`   - Reply URL: ${appConfig.replyUrl}`));
          console.log(chalk.gray(`   - Sign on URL: ${appConfig.signOnUrl}`));
          console.log(chalk.gray('7. Download the certificate and copy the Login URL'));
          console.log(chalk.gray('8. Configure in GitHub Enterprise SAML settings'));
        }
      }

    } catch (error: any) {
      console.error(chalk.red(`❌ Setup failed: ${error.message}`));
      console.log(chalk.yellow('💡 Run: ghec-sso auth debug -e <enterprise> for troubleshooting'));
      process.exit(1);
    }
  });

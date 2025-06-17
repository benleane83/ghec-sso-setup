import { Command } from 'commander';
import chalk from 'chalk';
import { AuthService } from '../services/auth';
// import { GitHubService } from '../services/github';
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
  .option('-e, --enterprise <name>', 'GitHub Enterprise slug (e.g. for github.com/enterprises/my-company, use my-company)')
  .option('-d, --domain [domain]', 'Your organizations Entra domain (optional - e.g. company.onmicrosoft.com)')
  .option('--dry-run', 'Show what would be done without making changes')
  .option('--force', 'Force setup even if validation fails')
  .action(async (options) => {
    console.log(chalk.blue.bold('🚀 GitHub Enterprise Cloud SSO Setup\n'));

    try {
      // Validate authentication
      const authService = new AuthService();
    //   const githubToken = authService.getStoredGitHubToken();
      
    //   if (!githubToken) {
    //     console.log(chalk.red('❌ Not authenticated with GitHub. Run: ghec-sso auth login-pat'));
    //     return;
    //   }

      // Get configuration
      const configManager = new ConfigManager();
      let config = {
        enterprise: options.enterprise,
        domain: options.domain
      };      // Prompt for missing configuration
      if (!config.enterprise) {
        const inquirer = await import('inquirer');
        
        const missing = await inquirer.default.prompt([
          {
            type: 'input',
            name: 'enterprise',
            message: 'Enter your GitHub Enterprise name (e.g. for /enterprises/my-company, use my-company):',
            when: !config.enterprise,
            validate: (input: string) => input.length > 0 || 'Enterprise name is required'
          }
        ]);

        config = { ...config, ...missing };
      }

      console.log(chalk.cyan(`📋 Configuration:`));
      console.log(chalk.gray(`   Enterprise: ${config.enterprise}`));
      console.log(chalk.gray(`   Domain: ${config.domain || 'common (any tenant)'}`));
      console.log(chalk.gray(`   Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}\n`));

    //   // Initialize services
    //   const githubService = new GitHubService(githubToken);
      
    //   // Step 1: Validate GitHub Enterprise access
    //   console.log(chalk.cyan('🔍 Step 1: Validating GitHub Enterprise access...'));
    //   const enterpriseValidation = await githubService.validateEnterpriseAccessWithFallback(
    //     config.enterprise,
    //     options.force
    //   );
      
    //   if (!enterpriseValidation.success && !options.force) {
    //     console.log(chalk.red(`❌ ${enterpriseValidation.message}`));
    //     return;
    //   }
    //   console.log(chalk.green(`✅ ${enterpriseValidation.message}\n`));
      
      // We'll initialize Azure service after we get Azure credentials
      let azureService: AzureService | null = null;      // Step 2: Get Azure credentials
      console.log(chalk.cyan('🔍 Step 2: Getting Azure credentials...'));
      try {
        const azureCredential = await authService.authenticateAzure(config.domain);
        azureService = new AzureService(azureCredential, config.domain);
        console.log(chalk.green('✅ Azure authentication validated\n'));
      } catch (error: any) {
        console.log(chalk.red(`❌ Azure authentication failed: ${error.message}`));
        console.log(chalk.yellow('Run: ghec-sso auth login'));
        return;
      }

      // Step 3: Create/Configure Entra ID Enterprise Application
      console.log(chalk.cyan('🏢 Step 3: Setting up Entra ID Enterprise Application...'));
      
      const appConfig = {
        displayName: `GitHub Enterprise SSO - ${config.enterprise}`,
        signOnUrl: `https://github.com/enterprises/${config.enterprise}/sso`,
        entityId: `https://github.com/enterprises/${config.enterprise}`,
        replyUrl: `https://github.com/enterprises/${config.enterprise}/saml/consume`
      };

      if (options.dryRun) {        console.log(chalk.yellow('🧪 DRY RUN: Would create Entra ID app with:'));
        console.log(chalk.gray(`   Display Name: ${appConfig.displayName}`));
        console.log(chalk.gray(`   Sign-On URL: ${appConfig.signOnUrl}`));
        console.log(chalk.gray(`   Entity ID: ${appConfig.entityId}`));
        console.log(chalk.gray(`   Reply URL: ${appConfig.replyUrl}`));
        console.log(chalk.gray(`   User Assignment: Current user would be assigned`));
        console.log(chalk.gray(`   SCIM Endpoint: https://api.github.com/scim/v2/enterprises/${config.enterprise}/`));
        console.log(chalk.gray(`   Interactive SCIM setup: Would prompt for GitHub SCIM token after SAML setup`));
        console.log(chalk.gray(`   Auto-provisioning: Would offer to start provisioning with confirmation prompt\n`));
      } else {
        try {
          const entraApp = await azureService!.createGitHubEnterpriseApp(config.enterprise);
          await azureService!.configureSAMLSettings(entraApp.id, config.enterprise);
          
          console.log(chalk.green('✅ Entra ID Enterprise Application created\n'));
          
          // Step 4: Assign current user to the application
          console.log(chalk.cyan('👤 Step 4: Assigning current user to application...'));
          await azureService!.assignCurrentUserToApp(entraApp.id);
          console.log(chalk.green('✅ Current user assigned to application\n'));
          
          // Step 5: Get SAML configuration details
          console.log(chalk.cyan('⚙️  Step 5: Getting SAML configuration details...'));
          const certificate = await azureService!.downloadSAMLCertificate(entraApp.id);
          
          console.log(chalk.green('✅ SAML configuration completed\n'));
          
          // Step 6: Output manual configuration details
          console.log(chalk.green.bold('🎉 Entra ID Setup Complete! Manual GitHub Configuration Required:\n'));
          
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
          console.log(chalk.gray('4. Enable "Require SAML SSO authentication"'));
          
          // Interactive SCIM setup
          console.log(chalk.cyan('\n🔄 SCIM Provisioning Setup:'));
          console.log(chalk.yellow('After configuring SAML SSO in GitHub, you can set up automatic user provisioning.'));
          
          const inquirer = await import('inquirer');
          const { setupScim } = await inquirer.default.prompt([{
            type: 'confirm',
            name: 'setupScim',
            message: 'Would you like to configure SCIM user provisioning now?',
            default: false
          }]);

          if (setupScim) {
            console.log(chalk.cyan('\n⏳ Waiting for GitHub SAML SSO configuration...'));
            console.log(chalk.gray('Please complete the GitHub SAML SSO setup first, then return here.'));
            console.log(chalk.gray('In GitHub Enterprise, go to Settings > Security > SCIM provisioning'));
            console.log(chalk.gray('Generate a SCIM token and record the value.'));
            
            const { continueScim } = await inquirer.default.prompt([{
              type: 'confirm',
              name: 'continueScim',
              message: 'Have you completed GitHub SAML SSO setup and are ready to configure SCIM?',
              default: false
            }]);            if (continueScim) {
              // Auto-generate the SCIM endpoint URL
              const scimEndpoint = `https://api.github.com/scim/v2/enterprises/${config.enterprise}/`;
              console.log(chalk.cyan(`\n📋 GitHub SCIM Configuration:`));
              console.log(chalk.gray(`   SCIM Endpoint: ${scimEndpoint}`));
              console.log(chalk.gray('   (This endpoint will be automatically configured in Azure AD)\n'));
              
              const scimConfig = await inquirer.default.prompt([
                {
                  type: 'password',
                  name: 'scimToken',
                  message: 'Enter the GitHub SCIM token:',
                  validate: (input: string) => input.length > 0 || 'SCIM token is required'
                }
              ]);

              try {
                console.log(chalk.cyan('\n🔧 Configuring SCIM provisioning in Entra ID...'));
                
                await azureService!.configureSCIMProvisioning(
                  entraApp.id, 
                  scimEndpoint,  // Use auto-generated endpoint
                  scimConfig.scimToken
                );
                
                console.log(chalk.green('✅ SCIM provisioning configured successfully'));
                
                // Test the SCIM connection
                const connectionTest = await azureService!.testSCIMConnection(entraApp.id);
                  if (connectionTest) {
                  console.log(chalk.green('✅ SCIM connection test passed'));
                  
                  // Enable on-demand provisioning
                  await azureService!.enableProvisioningOnDemand(entraApp.id);
                  
                  console.log(chalk.green('✅ SCIM provisioning configured successfully!'));
                  
                  // Ask if user wants to start automatic provisioning
                  const { startProvisioning } = await inquirer.default.prompt([{
                    type: 'confirm',
                    name: 'startProvisioning',
                    message: 'Do you want to start automatic provisioning now?',
                    default: false
                  }]);
                  
                  if (startProvisioning) {
                    console.log(chalk.yellow('⚠️  Warning: This will begin syncing users immediately.'));
                    console.log(chalk.yellow('   Ensure GitHub SAML SSO is working correctly first.'));
                    
                    const { confirmStart } = await inquirer.default.prompt([{
                      type: 'confirm',
                      name: 'confirmStart',
                      message: 'Are you sure you want to start provisioning now?',
                      default: false
                    }]);
                    
                    if (confirmStart) {
                      try {
                        await azureService!.startProvisioning(entraApp.id);
                        console.log(chalk.green('✅ Automatic provisioning started!'));
                        
                        // Show provisioning status
                        const status = await azureService!.getProvisioningStatus(entraApp.id);
                        console.log(chalk.gray(`   Status: ${status.status}`));
                        console.log(chalk.gray('   Initial synchronization may take several minutes'));
                        
                      } catch (provError: any) {
                        console.log(chalk.red(`❌ Failed to start provisioning: ${provError.message}`));
                        console.log(chalk.yellow('You can start it manually in Azure Portal > Enterprise Applications > Provisioning'));
                      }
                    } else {
                      console.log(chalk.yellow('⏭️  Provisioning not started. You can start it manually later.'));
                    }
                  } else {
                    console.log(chalk.yellow('⏭️  Provisioning not started. You can start it manually later.'));
                  }
                  
                  console.log(chalk.cyan('\n🎉 SCIM Provisioning Setup Complete!'));
                  console.log(chalk.gray('Users assigned to this application will be automatically provisioned to GitHub Enterprise.'));
                  console.log(chalk.gray('You can manage provisioning by:'));
                  console.log(chalk.gray('1. Assigning users to the application in Azure AD'));
                  console.log(chalk.gray('2. Using "Provision on demand" in the Azure portal'));
                  console.log(chalk.gray('3. Monitoring synchronization cycles in Azure portal'));
                } else {
                  console.log(chalk.yellow('⚠️  SCIM connection test failed. Please verify the endpoint and token.'));
                }
                
              } catch (scimError: any) {
                console.log(chalk.red(`❌ SCIM configuration failed: ${scimError.message}`));
                console.log(chalk.yellow('You can configure SCIM provisioning manually in the Azure portal later.'));
              }
            } else {
              console.log(chalk.yellow('⏭️  Skipping SCIM setup. You can configure it later in the Azure portal.'));
            }
          } else {
            console.log(chalk.yellow('⏭️  Skipping SCIM setup. You can configure it later in the Azure portal.'));
          }
          
          console.log(chalk.green.bold('\n🎉 Setup Complete!'));
          console.log(chalk.gray('Your GitHub Enterprise SAML SSO with Entra ID is now configured.'));
          console.log(chalk.gray('Users can sign in using their organizational credentials.\n'));
          console.log(chalk.gray('Please add additional Entra users or groups to your app as required.\n'));
            } catch (error: any) {
          // Check if this is a user cancellation - don't show fallback instructions
          if (error.userCancelled) {
            console.log(chalk.gray('\n⏸️  Setup cancelled by user.'));
            console.log(chalk.gray('Run the command again when ready to proceed.'));
            process.exit(0);
          }
          
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

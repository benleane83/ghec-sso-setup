import { Command } from 'commander';
import chalk from 'chalk';
import { AuthService } from '../services/auth';
import { AzureService } from '../services/azure';
import { ConfigManager } from '../utils/config';
import { TemplateProcessor } from '../utils/template';
import open from 'open';

interface EntraAppConfig {
  displayName: string;
  signOnUrl: string;
  entityId: string;  replyUrl: string;
}

interface SetupConfig {
  enterprise: string;
  domain?: string;
  ssoType: 'saml' | 'oidc';
}

class SetupCommandHandler {
  public async generateSetupPlan(config: SetupConfig, options: any): Promise<void> {
    console.log(chalk.blue.bold('📋 Generating Comprehensive Setup Plan...\n'));
    
    const templateProcessor = new TemplateProcessor();
    try {
      let planPath: string;
      
      if (options.planOutput) {
        // Use custom output path
        planPath = await templateProcessor.generateHtmlSetupPlan(
          config.enterprise, 
          config.domain || 'common',
          config.ssoType,
          options.planOutput
        );
      } else {
        // Generate to desktop with default filename
        planPath = await templateProcessor.generateHtmlSetupPlanToDesktop(
          config.enterprise, 
          config.domain || 'common',
          config.ssoType
        );
      }
      
      console.log(chalk.green.bold('🎉 Setup Plan Generated Successfully!\n'));
      console.log(chalk.cyan('📄 Plan Details:'));
      console.log(chalk.gray(`   Enterprise: ${config.enterprise}`));
      console.log(chalk.gray(`   Domain: ${config.domain || 'common (default tenant)'}`));
      console.log(chalk.gray(`   SSO Type: ${config.ssoType.toUpperCase()}`));
      console.log(chalk.gray(`   Format: HTML`));
      console.log(chalk.gray(`   File: ${planPath}\n`));
      
      console.log(chalk.yellow(`📋 The ${config.ssoType} plan includes:`));
      console.log(chalk.gray('   • Step-by-step Entra ID application setup'));
      console.log(chalk.gray('   • SCIM provisioning configuration'));
      console.log(chalk.gray('   • GitHub Enterprise setup reference'));
      console.log(chalk.gray('   • Verification and testing checklist'));
      console.log(chalk.gray('   • Troubleshooting guide\n'));

      // Ask if user wants to open the file
      const inquirer = await import('inquirer');
      const { openFile } = await inquirer.default.prompt([{
        type: 'confirm',
        name: 'openFile',
        message: 'Would you like to open the setup plan now?',
        default: true
      }]);
      
      if (openFile) {
        try {
          await open(planPath);
          console.log(chalk.green('✅ Setup plan opened in your default application'));
        } catch (openError) {
          console.log(chalk.yellow('⚠️  Could not auto-open file'));
          console.log(chalk.gray(`   Please manually open: ${planPath}`));
        }
      }
      
      console.log(chalk.cyan('\n💡 Next Steps:'));
      console.log(chalk.gray(`1. Follow the generated ${config.ssoType} plan step-by-step`));
      console.log(chalk.gray('2. Test your SSO configuration thoroughly'));
      console.log(chalk.gray('3. Run this command without --plan for automated setup'));
      console.log(chalk.gray('4. Save the plan for future reference or team sharing'));
      console.log('');
      
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to generate setup plan: ${error.message}`));
      console.log(chalk.yellow('\n📋 Fallback: Basic Configuration Summary'));
      
      const appConfig = {
        displayName: `GitHub Enterprise SSO - ${config.enterprise}`,
        signOnUrl: `https://github.com/enterprises/${config.enterprise}/sso`,
        entityId: `https://github.com/enterprises/${config.enterprise}`,
        replyUrl: `https://github.com/enterprises/${config.enterprise}/saml/consume`
      };
      
      console.log(chalk.gray(`   Display Name: ${appConfig.displayName}`));
      console.log(chalk.gray(`   Sign-On URL: ${appConfig.signOnUrl}`));
      console.log(chalk.gray(`   Entity ID: ${appConfig.entityId}`));
      console.log(chalk.gray(`   Reply URL: ${appConfig.replyUrl}`));
      console.log(chalk.gray(`   SCIM Endpoint: https://api.github.com/scim/v2/enterprises/${config.enterprise}/\n`));
    }
  }
}

const setupHandler = new SetupCommandHandler();

interface SetupConfig {
  enterprise: string;
  domain?: string;
  ssoType: 'saml' | 'oidc';
}

export const setupCommand = new Command('setup')
  .description('Setup GitHub Enterprise Cloud SSO with Entra ID')  
  .option('-e, --enterprise <n>', 'GitHub Enterprise slug (e.g. for github.com/enterprises/my-company, use my-company)')
  .option('-d, --domain [domain]', 'Your organizations Entra domain (optional - e.g. company.onmicrosoft.com)')
  .option('--ssoType <type>', 'SSO protocol type: saml (default) or oidc', 'saml')
  .option('--plan', 'Generate a comprehensive HTML setup plan without making changes')
  .option('--plan-output [path]', 'Custom output path for the setup plan (only with --plan)')
  .action(async (options) => {    console.log(chalk.blue.bold('🚀 GitHub Enterprise Cloud SSO Setup\n'));

    try {
      // Validate ssoType option
      if (options.ssoType && !['saml', 'oidc'].includes(options.ssoType.toLowerCase())) {
        console.log(chalk.red('❌ Invalid SSO type. Must be either "saml" or "oidc"'));
        return;
      }      const ssoType = (options.ssoType || 'saml').toLowerCase();

      // Validate authentication
      const authService = new AuthService();

      // Get configuration
      const configManager = new ConfigManager();
      let config: SetupConfig = {
        enterprise: options.enterprise,
        domain: options.domain,
        ssoType: ssoType as 'saml' | 'oidc'
      };
      
      // Prompt for missing configuration
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
      console.log(chalk.gray(`   Domain: ${config.domain || 'common (default tenant)'}`));
      console.log(chalk.gray(`   SSO Type: ${config.ssoType.toUpperCase()}`));
      console.log(chalk.gray(`   Mode: ${options.plan ? 'PLAN' : 'LIVE'}\n`));      // We'll initialize Azure service after we get Azure credentials
      let azureService: AzureService | null = null;     
      
      const appConfig = {
        displayName: config.ssoType === 'oidc' 
          ? `GitHub Enterprise Managed User (OIDC)`
          : `GitHub Enterprise SAML SSO - ${config.enterprise}`,
        signOnUrl: `https://github.com/enterprises/${config.enterprise}/sso`,
        entityId: `https://github.com/enterprises/${config.enterprise}`,
        replyUrl: config.ssoType === 'oidc' 
          ? `https://github.com/enterprises/${config.enterprise}/oauth/callback`
          : `https://github.com/enterprises/${config.enterprise}/saml/consume`
      };      
      
      if (options.plan) {
        await setupHandler.generateSetupPlan(config, options);
      } 
      else {
        if (config.ssoType === 'oidc') {
          // OIDC: GitHub-first approach - no Azure app creation needed
          console.log(chalk.green.bold('🎯 GitHub Enterprise OIDC Setup\n'));
          
          console.log(chalk.blue('📋 OIDC Setup Process:'));
          console.log(chalk.gray('   OIDC uses a GitHub-first setup where the Entra ID application'));
          console.log(chalk.gray('   is created automatically during the GitHub configuration process.\n'));
          
          console.log(chalk.yellow('⚠️  Prerequisites:'));
          console.log(chalk.gray('   • You must be signed in as the setup user (ends with _admin)'));
          console.log(chalk.gray('   • Your setup user must have Global Administrator rights in Entra ID'));
          console.log(chalk.gray('   • This is required to consent to the automatic app installation\n'));
          
          // Open GitHub OIDC configuration page
          const githubOidcUrl = `https://github.com/enterprises/${config.enterprise}/settings/single_sign_on_configuration`;
          console.log(chalk.cyan('🌐 Opening GitHub Enterprise OIDC configuration page...'));
          try {
            await open(githubOidcUrl);
            console.log(chalk.green('✅ Browser opened to GitHub OIDC settings'));
          } catch (openError) {
            console.log(chalk.yellow('⚠️  Could not auto-open browser'));
            console.log(chalk.gray(`   Please manually visit: ${githubOidcUrl}`));
          }
            
          console.log(chalk.cyan('\n📝 Step-by-Step Instructions:'));
          console.log(chalk.gray('1. In the opened GitHub page:'));
          console.log(chalk.gray('   • Under "OIDC single sign-on", select "Enable OIDC configuration"'));
          console.log(chalk.gray('   • Click "Save" to continue setup'));
          console.log(chalk.gray(''));
          console.log(chalk.gray('2. GitHub will redirect you to Entra ID:'));
          console.log(chalk.gray('   • Sign in with your Global Administrator account'));
          console.log(chalk.gray('   • Review the permissions for "GitHub Enterprise Managed User (OIDC)"'));
          console.log(chalk.gray('   • Enable "Consent on behalf of your organization"'));
          console.log(chalk.gray('   • Click "Accept"'));
          console.log(chalk.gray(''));
          console.log(chalk.gray('3. Back in GitHub:'));
          console.log(chalk.gray('   • Download, print, or copy your recovery codes'));
          console.log(chalk.gray('   • Store these codes in a secure location'));
          console.log(chalk.gray('   • Click "Enable OIDC Authentication" to complete setup'));
          console.log(chalk.gray(''));
          console.log(chalk.yellow('4. After OIDC is enabled, you can:'));
          console.log(chalk.gray('   • Assign users to the automatically created Entra ID application'));
          console.log(chalk.gray('   • Configure SCIM provisioning'));
          console.log(chalk.gray(''));
          
          await setupScimProvisioning(config, appConfig);
          
        } else {
          // SAML Setup
          try {
            // Step 1: Get Azure credentials (skip if in plan mode)
            console.log(chalk.cyan('🔍 Step 1: Getting Azure credentials...'));
            try {
              const azureCredential = await authService.authenticateAzure(config.domain);
              azureService = new AzureService(azureCredential, config.domain);
              console.log(chalk.green('✅ Azure authentication validated\n'));
            } 
            catch (error: any) {
              console.log(chalk.red(`❌ Azure authentication failed: ${error.message}`));
              console.log(chalk.yellow('Run: ghec-sso auth login'));
              return;
            }

            // Step 2: Create/Configure Entra ID Enterprise Application
            console.log(chalk.cyan(`🏢 Step 2: Setting up Entra ID Enterprise ${config.ssoType.toUpperCase()} Application...`));

            const entraApp = await azureService!.createGitHubEnterpriseApp(config.enterprise, config.ssoType);
            await azureService!.configureSAMLSettings(entraApp.id, config.enterprise);
            
            console.log(chalk.green(`✅ Entra ID Enterprise ${config.ssoType.toUpperCase()} Application created\n`));
            
            // Step 3: Assign current user to the application
            console.log(chalk.cyan('👤 Step 3: Assigning current user to application...'));
            await azureService!.assignCurrentUserToApp(entraApp.id);
            console.log(chalk.green('✅ Current user assigned to application\n'));
            
            // Step 4: Get SAML configuration details
            console.log(chalk.cyan('⚙️  Step 4: Getting SAML configuration details...'));
            const certificate = await azureService!.downloadSAMLCertificate(entraApp.id);
            
            console.log(chalk.green('✅ SAML configuration completed\n'));
            
            // Step 5: Output manual configuration details
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
            console.log(chalk.gray('5. Save the SAML configuration\n'));

            await setupScimProvisioning(config, appConfig);
          } 
          catch (error: any) {
            // Check if this is a user cancellation - don't show fallback instructions
            if (error.userCancelled) {
              console.log(chalk.gray('\n⏸️  Setup cancelled by user.'));
              console.log(chalk.gray('Run the command again when ready to proceed.'));
              process.exit(0);
            }
            
            console.log(chalk.red(`❌ Setup failed: ${error.message}`));
            console.log(chalk.yellow('\n💡 Manual Setup Instructions:'));
            console.log(chalk.gray('1. Go to Azure Portal > Enterprise Applications'));
            console.log(chalk.gray('2. Search for the "GitHub Enterprise Managed User" application in the gallery'));
            console.log(chalk.gray(`3. Name your application "${appConfig.displayName}", and click "Create"`));
            console.log(chalk.gray('4. Go to "Single sign-on" > "SAML"'));
            console.log(chalk.gray('5. Configure:'));
            console.log(chalk.gray(`   - Identifier (Entity ID): ${appConfig.entityId}`));
            console.log(chalk.gray(`   - Reply URL: ${appConfig.replyUrl}`));
            console.log(chalk.gray(`   - Sign on URL: ${appConfig.signOnUrl}`));
            console.log(chalk.gray('6. Download the certificate and copy the Login URL'));
            console.log(chalk.gray('7. Configure in GitHub Enterprise SAML settings'));
          }
        }
      }

    } catch (error: any) {
      console.error(chalk.red(`❌ Setup failed: ${error.message}`));
      process.exit(1);
    }
  });

async function setupScimProvisioning(config: SetupConfig, appConfig: { displayName: string; signOnUrl: string; entityId: string; replyUrl: string; }) {
  const inquirer = await import('inquirer');

  const { proceedWithScim } = await inquirer.default.prompt([{
    type: 'confirm',
    name: 'proceedWithScim',
    message: 'Have you completed the SSO configuration and want to proceed with SCIM provisioning setup?',
    default: false
  }]);

  if (proceedWithScim) {
    console.log(chalk.cyan('\n🔧 Setting up SCIM Provisioning...\n'));

    // Open GitHub SCIM token creation page
    const tokenUrl = `https://github.com/settings/tokens/new?scopes=scim:enterprise&description=SCIM%20Token%20for%20${config.enterprise}`;
    console.log(chalk.cyan('🌐 Opening GitHub SCIM Token creation page...'));

    try {
      await open(tokenUrl);
      console.log(chalk.green('✅ Browser opened to GitHub token creation page'));
    } catch (openError) {
      console.log(chalk.yellow('⚠️  Could not auto-open browser'));
      console.log(chalk.gray(`   Please manually visit: ${tokenUrl}`));
    }

    console.log(chalk.yellow('📋 SCIM Token Generation:\n'));
    console.log(chalk.gray('1. In the opened GitHub page:'));
    console.log(chalk.gray('   • The token description and scopes are pre-filled'));
    console.log(chalk.gray('   • Click "Generate token"'));
    console.log(chalk.gray('   • Copy the generated token (you won\'t see it again)\n'));

    console.log(chalk.yellow('📋 Manual SCIM Configuration Instructions:\n'));

    // Display the SCIM endpoint for the user
    const scimEndpoint = `https://api.github.com/scim/v2/enterprises/${config.enterprise}`;

    console.log(chalk.yellow('� Step-by-Step SCIM Setup:'));
    console.log(chalk.gray('2. Now configure SCIM in Entra ID:'));
    console.log(chalk.yellow('🏢 Configure in Entra ID:'));
    console.log(chalk.gray('   • Go to Azure Portal > Enterprise Applications'));
    console.log(chalk.gray(`   • Find and open "${appConfig.displayName}"`));
    console.log(chalk.gray('   • Click "Provisioning" in the left menu'));
    console.log(chalk.gray('   • Click "Get started"'));
    console.log(chalk.gray('   • Set Provisioning Mode to "Automatic"'));
    console.log(chalk.gray('   • In Admin Credentials section:'));
    console.log(chalk.gray(`     ○ Tenant URL: ${scimEndpoint}`));
    console.log(chalk.gray('     ○ Secret Token: [Paste your GitHub SCIM token from above]'));
    console.log(chalk.gray('   • Click "Test Connection" to verify'));
    console.log(chalk.gray('   • Configure Settings as needed'));
    console.log(chalk.gray('   • Click "Save" and then "Start provisioning"\n'));

    console.log(chalk.yellow('⚠️  Important Notes:'));
    console.log(chalk.gray('• Only configure SCIM after SSO is fully working'));
    console.log(chalk.gray('• Test with a small group of users first'));
    console.log(chalk.gray('• Monitor the first synchronization cycle for any issues\n'));
  }
  else {
    console.log(chalk.yellow('\n📋 Setup instructions provided.'));
    console.log(chalk.gray('Configure SCIM manually using the Azure Portal\n'));
  }
}

// SCIM Provisioning Setup Method (currently disabled but preserved for future use)
// This method contains the original interactive SCIM setup that was temporarily disabled
// due to template selection issues. Can be re-enabled by calling this method instead of
// showing manual instructions.
async function setupScimProvisioningAutomated(azureService: AzureService, entraApp: any, config: any, appConfig: any) {
  const inquirer = await import('inquirer');
  
  console.log(chalk.cyan('\n🔄 SCIM Provisioning Setup:'));
  console.log(chalk.yellow('After configuring SSO in GitHub, you can set up automatic user provisioning.'));
  
  const { setupScim } = await inquirer.default.prompt([{
    type: 'confirm',
    name: 'setupScim',
    message: 'Would you like to configure SCIM user provisioning now?',
    default: false
  }]);

  if (setupScim) {
    console.log(chalk.cyan('\n⏳ Waiting for GitHub SSO configuration...'));
    console.log(chalk.gray('Please complete the GitHub SSO setup first, then return here.'));
    console.log(chalk.gray('In GitHub Enterprise, go to Settings > Security > SCIM provisioning'));
    console.log(chalk.gray('Generate a SCIM token and record the value.'));
    
    const { continueScim } = await inquirer.default.prompt([{
      type: 'confirm',
      name: 'continueScim',
      message: 'Have you completed GitHub SSO setup and are ready to configure SCIM?',
      default: false
    }]);            
    
    if (continueScim) {
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
        await azureService.configureSCIMProvisioning(
          entraApp.id, 
          scimEndpoint,  // Use auto-generated endpoint
          scimConfig.scimToken
        );
        
        console.log(chalk.green('✅ SCIM provisioning configured successfully'));
        
        // Verify the service principal still exists after SCIM configuration
        try {
          console.log(chalk.gray('   Verifying service principal after SCIM setup...'));
          const diagnostic = await azureService.diagnoseSCIMIssues(entraApp.id, config.enterprise);
          if (!diagnostic.exists) {
            console.log(chalk.red('\n❌ Service Principal was deleted during SCIM setup!'));
            console.log(chalk.yellow('Diagnostic recommendations:'));
            diagnostic.recommendations.forEach(rec => {
              console.log(chalk.gray(`• ${rec}`));
            });
            console.log(chalk.cyan('\n💡 This indicates an issue with the SCIM configuration that caused Azure to remove the Enterprise Application.'));
            console.log(chalk.gray('You may need to:'));
            console.log(chalk.gray('1. Verify your GitHub SCIM token is valid and has correct permissions'));
            console.log(chalk.gray('2. Check that your GitHub Enterprise supports SCIM provisioning'));
            console.log(chalk.gray('3. Try running the setup again without SCIM provisioning'));
            throw new Error('Service Principal was deleted during SCIM configuration');
          }
        } catch (diagnosticError: any) {
          console.log(chalk.yellow(`⚠️  Could not verify service principal: ${diagnosticError.message}`));
        }
        
        // Test the SCIM connection
        const connectionTest = await azureService.testSCIMConnection(entraApp.id);
        if (connectionTest) {
          console.log(chalk.green('✅ SCIM connection test passed'));
          
          // Enable on-demand provisioning
          await azureService.enableProvisioningOnDemand(entraApp.id);
          
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
            console.log(chalk.yellow('   Ensure GitHub SSO is working correctly first.'));
            
            const { confirmStart } = await inquirer.default.prompt([{
              type: 'confirm',
              name: 'confirmStart',
              message: 'Are you sure you want to start provisioning now?',
              default: false
            }]);
            
            if (confirmStart) {
              try {
                await azureService.startProvisioning(entraApp.id);
                console.log(chalk.green('✅ Automatic provisioning started!'));
                
                // Show provisioning status
                const status = await azureService.getProvisioningStatus(entraApp.id);
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
}

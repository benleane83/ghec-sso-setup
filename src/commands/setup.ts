import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { AuthService } from '../services/auth';
import { GitHubService } from '../services/github';
import { AzureService } from '../services/azure';
import { ConfigManager } from '../utils/config';
import { validatePrerequisites } from '../utils/validation';

export const setupCommand = new Command('setup')
  .description('Configure SAML SSO between GitHub Enterprise Cloud and Entra ID')
  .option('-e, --enterprise <name>', 'GitHub Enterprise name')
  .option('-t, --tenant <domain>', 'Entra ID tenant domain')
  .option('--dry-run', 'Show what would be done without making changes')
  .action(async (options) => {
    console.log(chalk.blue.bold('🚀 GitHub Enterprise Cloud SSO Setup\n'));

    try {
      // Get configuration either from options or prompts
      const config = await getSetupConfig(options);
      
      // Show warnings
      showWarnings();
      
      if (!options.dryRun) {
        const { confirm } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirm',
          message: 'Do you want to proceed with SSO setup?',
          default: false
        }]);

        if (!confirm) {
          console.log(chalk.yellow('Setup cancelled.'));
          return;
        }
      }

      // Run setup process
      await runSetupProcess(config, options.dryRun);

    } catch (error: any) {
      console.error(chalk.red(`\n❌ Setup failed: ${error.message}`));
      process.exit(1);
    }
  });

async function getSetupConfig(options: any) {
  let enterprise = options.enterprise;
  let tenant = options.tenant;

  if (!enterprise || !tenant) {
    console.log(chalk.cyan('📋 Setup Configuration\n'));
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'enterprise',
        message: 'GitHub Enterprise name:',
        when: !enterprise,
        validate: (input) => input.length > 0 || 'Enterprise name is required'
      },
      {
        type: 'input',
        name: 'tenant',
        message: 'Entra ID tenant domain (e.g., company.onmicrosoft.com):',
        when: !tenant,
        validate: (input) => {
          if (!input) return 'Tenant domain is required';
          if (!input.includes('.')) return 'Please enter a valid domain';
          return true;
        }
      }
    ]);

    enterprise = enterprise || answers.enterprise;
    tenant = tenant || answers.tenant;
  }

  return { enterprise, tenant };
}

function showWarnings() {
  console.log(chalk.yellow.bold('⚠️  Important Warnings:\n'));
  console.log(chalk.yellow('• This will configure SSO for your entire GitHub Enterprise'));
  console.log(chalk.yellow('• Ensure you have admin access to both GitHub and Entra ID'));
  console.log(chalk.yellow('• Users will need to be provisioned through Entra ID after setup'));
  console.log(chalk.yellow('• Make sure you have recovery access to your GitHub Enterprise\n'));
}

async function runSetupProcess(config: any, dryRun: boolean) {
  const authService = new AuthService();
  const configManager = new ConfigManager();
  
  // Save configuration
  configManager.setCurrentEnterprise(config.enterprise, {
    github: { enterpriseSlug: config.enterprise },
    azure: { tenantDomain: config.tenant },
    sso: { status: 'in-progress' }
  });

  console.log(chalk.cyan('\n🔐 Authentication\n'));
  
  // Authenticate with both services
  const spinner = ora('Authenticating with GitHub...').start();
  const githubToken = await authService.authenticateGitHub();
  spinner.succeed('GitHub authentication successful');
  
  spinner.start('Authenticating with Azure...');
  const azureCredential = await authService.authenticateAzure();
  spinner.succeed('Azure authentication successful');

  // Initialize services
  const githubService = new GitHubService(githubToken);
  const azureService = new AzureService(azureCredential, config.tenant);

  console.log(chalk.cyan('\n✅ Validation\n'));
  
  // Validate prerequisites
  spinner.start('Validating prerequisites...');
  await validatePrerequisites(githubService, azureService, config);
  spinner.succeed('Prerequisites validated');

  if (dryRun) {
    console.log(chalk.blue('\n🔍 Dry Run - Changes that would be made:\n'));
    console.log('1. Create GitHub Enterprise Application in Entra ID');
    console.log('2. Configure SAML settings in the Entra ID app');
    console.log('3. Download SAML certificate from Entra ID');
    console.log('4. Configure SAML SSO in GitHub Enterprise');
    console.log('5. Test SSO configuration');
    console.log(chalk.blue('\nNo changes were made (dry run mode)'));
    return;
  }

  console.log(chalk.cyan('\n🔧 Configuration\n'));

  // Step 1: Create Entra ID Enterprise App
  spinner.start('Creating GitHub Enterprise Application in Entra ID...');
  const entraApp = await azureService.createGitHubEnterpriseApp(config.enterprise);
  spinner.succeed('Enterprise Application created');

  // Step 2: Configure SAML
  spinner.start('Configuring SAML settings...');
  await azureService.configureSAMLSettings(entraApp.id, config.enterprise);
  const certificate = await azureService.downloadSAMLCertificate(entraApp.id);
  spinner.succeed('SAML settings configured');

  // Step 3: Configure GitHub Enterprise
  spinner.start('Configuring GitHub Enterprise SSO...');
  await githubService.configureSAML(config.enterprise, {
    ssoUrl: entraApp.ssoUrl,
    entityId: entraApp.entityId,
    certificate: certificate
  });
  spinner.succeed('GitHub Enterprise SSO configured');

  // Step 4: Test SSO
  spinner.start('Testing SSO configuration...');
  const testResult = await githubService.testSSOConfiguration(config.enterprise);
  if (testResult.success) {
    spinner.succeed('SSO configuration test passed');
  } else {
    spinner.warn('SSO test had warnings - please verify manually');
    console.log(chalk.yellow(`Test details: ${testResult.message}`));
  }

  // Update configuration status
  configManager.updateEnterpriseConfig(config.enterprise, {
    sso: { 
      status: 'configured',
      method: 'saml',
      lastConfigured: new Date().toISOString()
    }
  });

  console.log(chalk.green.bold('\n🎉 SSO Setup Complete!\n'));
  console.log(chalk.green('Next steps:'));
  console.log(chalk.green('1. Add users/groups to the Entra ID Enterprise Application'));
  console.log(chalk.green('2. Configure SCIM provisioning (run: ghec-sso configure scim)'));
  console.log(chalk.green('3. Set up teams and Copilot licensing'));
  console.log(chalk.green('\nFor troubleshooting, run: ghec-sso validate\n'));
}

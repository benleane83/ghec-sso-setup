import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { AuthService } from '../services/auth';
import { AzureService } from '../services/azure';
import { ConfigManager } from '../utils/config';

export const validateCommand = new Command('validate')
  .description('Validate current SSO setup and configuration')
  .option('-e, --enterprise <name>', 'GitHub Enterprise name to validate')
  .option('-d, --domain [domain]', 'Your organizations Entra domain (optional - e.g. company.onmicrosoft.com)')
  .action(async (options) => {
    console.log(chalk.blue.bold('🔍 SSO Configuration Validation\n'));

    try {
      const configManager = new ConfigManager();
      const enterpriseName = options.enterprise || configManager.getCurrentEnterprise();
      
      if (!enterpriseName) {
        console.log(chalk.red('❌ No enterprise specified. Use --enterprise or run setup first.'));
        return;
      }

      const config = configManager.getEnterpriseConfig(enterpriseName);
      if (!config) {
        console.log(chalk.red(`❌ No configuration found for enterprise: ${enterpriseName}`));
        console.log(chalk.yellow('Run: ghec-sso setup'));
        return;
      }      
      
      // Initialize services
      const authService = new AuthService();
      const spinner = ora('Authenticating...').start();
      
      // Use domain from options if provided, otherwise fall back to config, or use common
      const tenantDomain = options.domain || config.azure?.tenantDomain;
      
      const azureCredential = await authService.authenticateAzure(tenantDomain);
      
      const azureService = new AzureService(azureCredential, tenantDomain || 'common');
      
      spinner.succeed('Authentication successful');

      // Validation checks
      console.log(chalk.cyan('\n🔧 Running Validation Checks\n'));

      const results = await runValidationChecks(azureService, config);
      
      // Display results
      displayValidationResults(results);
      
      if (results.every(r => r.status === 'pass')) {
        console.log(chalk.green.bold('\n🎉 All validation checks passed!'));
      } else {
        console.log(chalk.yellow.bold('\n⚠️  Some validation checks failed. See details above.'));
      }

    } catch (error: any) {
      console.error(chalk.red(`\n❌ Validation failed: ${error.message}`));
      process.exit(1);
    }
  });

async function runValidationChecks(azureService: any, config: any) {
  const checks = [
    {
      name: 'Entra ID Application',
      test: () => azureService.validateEnterpriseApp()
    },
    {
      name: 'SAML Configuration',
      test: () => azureService.validateSAMLConfig()
    },
    {
      name: 'Certificate Validity',
      test: () => azureService.validateCertificate()
    }
  ];

  const results = [];
  
  for (const check of checks) {
    const spinner = ora(check.name).start();
    try {
      const result = await check.test();
      if (result.success) {
        spinner.succeed(check.name);
        results.push({ name: check.name, status: 'pass', message: result.message });
      } else {
        spinner.fail(check.name);
        results.push({ name: check.name, status: 'fail', message: result.message });
      }
    } catch (error: any) {
      spinner.fail(check.name);
      results.push({ name: check.name, status: 'error', message: error.message });
    }
  }

  return results;
}

function displayValidationResults(results: any[]) {
  console.log(chalk.cyan('\n📋 Validation Summary\n'));
  
  results.forEach(result => {
    const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
    const color = result.status === 'pass' ? 'green' : result.status === 'fail' ? 'red' : 'yellow';
    
    console.log(chalk[color](`${icon} ${result.name}`));
    if (result.message) {
      console.log(chalk.gray(`   ${result.message}`));
    }
  });
}

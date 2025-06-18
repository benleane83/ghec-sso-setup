import { Command } from 'commander';
import chalk from 'chalk';
import { AuthService } from '../services/auth';

export const authCommand = new Command('auth')
  .description('Manage authentication with GitHub and Azure');

authCommand
  .command('login')
  .description('Authenticate with Azure')
  .action(async () => {
    console.log(chalk.blue.bold('🔐 Authentication Setup\n'));

    try {
      const authService = new AuthService();
      
      console.log(chalk.cyan('Authenticating with Azure...'));
      await authService.authenticateAzure();
      console.log(chalk.green('✅ Azure authentication successful\n'));
      
      console.log(chalk.green.bold('🎉 Authentication complete!'));
      console.log(chalk.green('You can now run: ghec-sso setup'));
      
    } catch (error: any) {
      console.error(chalk.red(`❌ Authentication failed: ${error.message}`));
      process.exit(1);
    }
  });

authCommand
  .command('status')
  .description('Check authentication status')
  .action(async () => {
    console.log(chalk.blue.bold('🔍 Authentication Status\n'));
    
    try {
      const authService = new AuthService();
      
      const azureStatus = await authService.checkAzureAuth();
      
      console.log(`Azure: ${azureStatus ? chalk.green('✅ Authenticated') : chalk.red('❌ Not authenticated')}`);
      
    } catch (error: any) {
      console.error(chalk.red(`❌ Status check failed: ${error.message}`));
    }
  });

authCommand
  .command('logout')
  .description('Clear stored authentication')
  .action(async () => {
    try {
      const authService = new AuthService();
      await authService.logout();
      console.log(chalk.green('✅ Authentication cleared'));
    } catch (error: any) {
      console.error(chalk.red(`❌ Logout failed: ${error.message}`));
    }
  });
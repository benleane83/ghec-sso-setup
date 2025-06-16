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
      
    //   console.log(chalk.cyan('Authenticating with GitHub...'));
    //   await authService.authenticateGitHub();
    //   console.log(chalk.green('✅ GitHub authentication successful\n'));
      
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

// authCommand
//   .command('login-pat')
//   .description('Authenticate using Personal Access Token (recommended for enterprises)')
//   .action(async () => {
//     console.log(chalk.blue.bold('🔐 GitHub Enterprise Authentication (PAT)\n'));
    
//     try {
//       const authService = new AuthService();
//       await authService.authenticateWithPAT();
//       console.log(chalk.green.bold('\n🎉 Authentication complete!'));
//       console.log(chalk.green('You can now run: ghec-sso setup'));
      
//     } catch (error: any) {
//       console.error(chalk.red(`❌ Authentication failed: ${error.message}`));
//       process.exit(1);
//     }
//   });

authCommand
  .command('status')
  .description('Check authentication status')
  .action(async () => {
    console.log(chalk.blue.bold('🔍 Authentication Status\n'));
    
    try {
      const authService = new AuthService();
      
    //   const githubStatus = await authService.checkGitHubAuth();
      const azureStatus = await authService.checkAzureAuth();
      
    //   console.log(`GitHub: ${githubStatus ? chalk.green('✅ Authenticated') : chalk.red('❌ Not authenticated')}`);
      console.log(`Azure: ${azureStatus ? chalk.green('✅ Authenticated') : chalk.red('❌ Not authenticated')}`);
      
      // If GitHub is authenticated, show user details
    //   if (githubStatus) {
    //     try {
    //       const { GitHubService } = await import('../services/github');            const token = authService.getStoredGitHubToken();
    //       if (token) {
    //         const githubService = new GitHubService(token);
    //         const user = await githubService.getCurrentUser();
    //         const enterprises = await githubService.listUserEnterprises();
            
    //         console.log(chalk.cyan('\n📋 GitHub Account Details:'));
    //         console.log(`   User: ${user.login} (${user.name || 'No name set'})`);
    //         console.log(`   Email: ${user.email || 'Not public'}`);
    //         console.log(`   Account Type: ${user.type}`);
    //         console.log(`   Company: ${user.company || 'Not set'}`);
            
    //         console.log(chalk.cyan('\n🏢 Accessible Enterprises:'));
    //         if (enterprises.length > 0) {
    //           enterprises.forEach(enterprise => {
    //             console.log(`   • ${enterprise.slug} (${enterprise.name})`);
    //           });
    //         } else {
    //           console.log(chalk.yellow('   No enterprises found. This might mean:'));
    //           console.log(chalk.yellow('   - You don\'t have enterprise access'));
    //           console.log(chalk.yellow('   - You\'re using a personal/organization account'));
    //           console.log(chalk.yellow('   - The API doesn\'t support listing enterprises'));
    //         }
    //       }
    //     } catch (detailError: any) {
    //       console.log(chalk.yellow(`\n⚠️  Could not fetch account details: ${detailError.message}`));
    //     }
    //   }
      
    //   if (!githubStatus || !azureStatus) {
    //     console.log(chalk.yellow('\nRun: ghec-sso auth login'));
    //   }
      
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
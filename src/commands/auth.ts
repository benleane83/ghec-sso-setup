import { Command } from 'commander';
import chalk from 'chalk';
import { AuthService } from '../services/auth';

export const authCommand = new Command('auth')
  .description('Manage authentication with GitHub and Azure');

authCommand
  .command('login')
  .description('Authenticate with GitHub and Azure (tries device flow first)')
  .action(async () => {
    console.log(chalk.blue.bold('🔐 Authentication Setup\n'));
    console.log(chalk.yellow('💡 For GitHub Enterprise, consider using: ghec-sso auth login-pat'));
    console.log(chalk.yellow('   Device flow may not have enterprise permissions\n'));
    
    try {
      const authService = new AuthService();
      
      console.log(chalk.cyan('Authenticating with GitHub...'));
      await authService.authenticateGitHub();
      console.log(chalk.green('✅ GitHub authentication successful\n'));
      
      console.log(chalk.cyan('Authenticating with Azure...'));
      await authService.authenticateAzure();
      console.log(chalk.green('✅ Azure authentication successful\n'));
      
      console.log(chalk.green.bold('🎉 Authentication complete!'));
      console.log(chalk.green('You can now run: ghec-sso setup'));
      
    } catch (error: any) {
      console.error(chalk.red(`❌ Authentication failed: ${error.message}`));
      console.log(chalk.yellow('\n💡 Try: ghec-sso auth login-pat'));
      process.exit(1);
    }
  });

authCommand
  .command('login-pat')
  .description('Authenticate using Personal Access Token (recommended for enterprises)')
  .action(async () => {
    console.log(chalk.blue.bold('🔐 GitHub Enterprise Authentication (PAT)\n'));
    
    try {
      const authService = new AuthService();
      await authService.authenticateWithPAT();
      console.log(chalk.green.bold('\n🎉 Authentication complete!'));
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
      
      const githubStatus = await authService.checkGitHubAuth();
      const azureStatus = await authService.checkAzureAuth();
      
      console.log(`GitHub: ${githubStatus ? chalk.green('✅ Authenticated') : chalk.red('❌ Not authenticated')}`);
      console.log(`Azure: ${azureStatus ? chalk.green('✅ Authenticated') : chalk.red('❌ Not authenticated')}`);
      
      // If GitHub is authenticated, show user details
      if (githubStatus) {
        try {
          const { GitHubService } = await import('../services/github');            const token = authService.getStoredGitHubToken();
          if (token) {
            const githubService = new GitHubService(token);
            const user = await githubService.getCurrentUser();
            const enterprises = await githubService.listUserEnterprises();
            
            console.log(chalk.cyan('\n📋 GitHub Account Details:'));
            console.log(`   User: ${user.login} (${user.name || 'No name set'})`);
            console.log(`   Email: ${user.email || 'Not public'}`);
            console.log(`   Account Type: ${user.type}`);
            console.log(`   Company: ${user.company || 'Not set'}`);
            
            console.log(chalk.cyan('\n🏢 Accessible Enterprises:'));
            if (enterprises.length > 0) {
              enterprises.forEach(enterprise => {
                console.log(`   • ${enterprise.slug} (${enterprise.name})`);
              });
            } else {
              console.log(chalk.yellow('   No enterprises found. This might mean:'));
              console.log(chalk.yellow('   - You don\'t have enterprise access'));
              console.log(chalk.yellow('   - You\'re using a personal/organization account'));
              console.log(chalk.yellow('   - The API doesn\'t support listing enterprises'));
            }
          }
        } catch (detailError: any) {
          console.log(chalk.yellow(`\n⚠️  Could not fetch account details: ${detailError.message}`));
        }
      }
      
      if (!githubStatus || !azureStatus) {
        console.log(chalk.yellow('\nRun: ghec-sso auth login'));
      }
      
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

authCommand
  .command('debug')
  .description('Debug enterprise access issues')
  .option('-e, --enterprise <name>', 'Enterprise name to debug')
  .action(async (options) => {
    if (!options.enterprise) {
      console.log(chalk.red('❌ Please specify enterprise name: ghec-sso auth debug -e your-enterprise'));
      return;
    }

    console.log(chalk.blue.bold('🐛 Debug Enterprise Access\n'));
    
    try {
      const authService = new AuthService();
      const token = authService.getStoredGitHubToken();
      
      if (!token) {
        console.log(chalk.red('❌ Not authenticated. Run: ghec-sso auth login'));
        return;
      }

      const { GitHubService } = await import('../services/github');
      const githubService = new GitHubService(token);
      
      await githubService.debugEnterpriseAccess(options.enterprise);
      
    } catch (error: any) {
      console.error(chalk.red(`❌ Debug failed: ${error.message}`));
    }
  });

authCommand
  .command('test-token')
  .description('Test current GitHub token and show detailed permissions')
  .action(async () => {
    console.log(chalk.blue.bold('🧪 GitHub Token Test\n'));
    
    try {
      const authService = new AuthService();
      const token = authService.getStoredGitHubToken();
      
      if (!token) {
        console.log(chalk.red('❌ No token found. Run: ghec-sso auth login'));
        return;
      }

      console.log(chalk.cyan('Testing current GitHub token...'));
      const isValid = await authService.validateGitHubToken(token);
      
      if (isValid) {
        console.log(chalk.green('\n✅ Token validation passed'));
      } else {
        console.log(chalk.red('\n❌ Token validation failed'));
      }
      
    } catch (error: any) {
      console.error(chalk.red(`❌ Token test failed: ${error.message}`));
    }
  });

authCommand
  .command('test-saml')
  .description('Test SAML-specific enterprise endpoints')
  .option('-e, --enterprise <name>', 'Enterprise name to test')
  .action(async (options) => {
    if (!options.enterprise) {
      console.log(chalk.red('❌ Please specify enterprise name: ghec-sso auth test-saml -e your-enterprise'));
      return;
    }

    console.log(chalk.blue.bold('🔧 Testing SAML Enterprise Endpoints\n'));
    
    try {
      const authService = new AuthService();
      const token = authService.getStoredGitHubToken();
      
      if (!token) {
        console.log(chalk.red('❌ Not authenticated. Run: ghec-sso auth login-pat'));
        return;
      }

      const { GitHubService } = await import('../services/github');
      const githubService = new GitHubService(token);
      
      await githubService.debugSAMLEndpoints(options.enterprise);
      
    } catch (error: any) {
      console.error(chalk.red(`❌ SAML endpoint test failed: ${error.message}`));
    }
  });

authCommand
  .command('test-direct-api')
  .description('Test enterprise endpoints with direct REST API calls')
  .option('-e, --enterprise <name>', 'Enterprise name to test')
  .action(async (options) => {
    if (!options.enterprise) {
      console.log(chalk.red('❌ Please specify enterprise name: ghec-sso auth test-direct-api -e your-enterprise'));
      return;
    }

    console.log(chalk.blue.bold('🌐 Testing Enterprise Endpoints with Direct API\n'));
    
    try {
      const authService = new AuthService();
      const token = authService.getStoredGitHubToken();
      
      if (!token) {
        console.log(chalk.red('❌ Not authenticated. Run: ghec-sso auth login-pat'));
        return;
      }

      const { GitHubService } = await import('../services/github');
      const githubService = new GitHubService(token);
      
      await githubService.debugSAMLEndpointsWithDirectAPI(options.enterprise);
      
    } catch (error: any) {
      console.error(chalk.red(`❌ Direct API test failed: ${error.message}`));
    }
  });

authCommand
  .command('investigate')
  .description('Investigate enterprise/organization type and capabilities')
  .option('-e, --enterprise <name>', 'Enterprise/organization name to investigate')
  .action(async (options) => {
    if (!options.enterprise) {
      console.log(chalk.red('❌ Please specify enterprise name: ghec-sso auth investigate -e your-enterprise'));
      return;
    }

    console.log(chalk.blue.bold('🔍 Investigating Enterprise/Organization Type\n'));
    
    try {
      const authService = new AuthService();
      const token = authService.getStoredGitHubToken();
      
      if (!token) {
        console.log(chalk.red('❌ Not authenticated. Run: ghec-sso auth login-pat'));
        return;
      }

      const { GitHubService } = await import('../services/github');
      const githubService = new GitHubService(token);
      
      await githubService.investigateEnterpriseType(options.enterprise);
      
    } catch (error: any) {
      console.error(chalk.red(`❌ Investigation failed: ${error.message}`));
    }
  });

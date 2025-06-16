import { Octokit } from '@octokit/rest';
import chalk from 'chalk';
// Use node-fetch for Node.js compatibility if built-in fetch is not available
let fetch: any;
try {
  fetch = globalThis.fetch;
} catch {
  fetch = require('node-fetch');
}

export class GitHubService {
  private octokit: Octokit;
  private token: string;
  
  constructor(token: string) {
    this.token = token;
    this.octokit = new Octokit({
      auth: token,
      baseUrl: 'https://api.github.com',
    });
  }
  async validateEnterpriseAccess(enterpriseSlug: string): Promise<{ success: boolean; message: string }> {
    try {
      // Try multiple approaches for enterprise access validation
      
      // Approach 1: Direct enterprise access
      try {
        const { data: enterprise } = await this.octokit.request('GET /enterprises/{enterprise}', {
          enterprise: enterpriseSlug,
        });
        return {
          success: true,
          message: `Access confirmed for enterprise: ${enterprise.name}`
        };
      } catch (directError: any) {
        // Continue to other approaches if direct access fails
      }

      // Approach 2: Try enterprise organizations
      try {
        const { data: orgs } = await this.octokit.request('GET /enterprises/{enterprise}/organizations', {
          enterprise: enterpriseSlug,
        });
        return {
          success: true,
          message: `Enterprise access confirmed via organizations endpoint (${orgs.length} organizations found)`
        };
      } catch (orgsError: any) {
        // Continue to other approaches
      }

      // Approach 3: Check if it might be an organization instead
      try {
        const { data: org } = await this.octokit.rest.orgs.get({
          org: enterpriseSlug,
        });
        
        return {
          success: false,
          message: `Found organization "${org.login}" but this tool requires a GitHub Enterprise. Organizations cannot use enterprise-level SSO. Please check if you have a GitHub Enterprise Cloud account.`
        };
      } catch (orgError: any) {
        // Final fallback
      }

      return {
        success: false,
        message: `Cannot access enterprise "${enterpriseSlug}". This could be because:
        1. The enterprise name is incorrect
        2. You don't have Enterprise Owner permissions
        3. You're authenticated with the wrong account
        
        Try running: ghec-sso auth debug -e ${enterpriseSlug}`
      };
      
    } catch (error: any) {
      return {
        success: false,
        message: `Cannot access enterprise ${enterpriseSlug}: ${error.message}`
      };
    }
  }
  async validateEnterpriseAccessWithFallback(enterpriseSlug: string, force: boolean = false): Promise<{ success: boolean; message: string }> {
    if (force) {
      console.log(chalk.yellow('⚠️  Forcing enterprise validation bypass'));
      return {
        success: true,
        message: `Enterprise validation bypassed for enterprise: ${enterpriseSlug}`
      };
    }
    
    return await this.validateEnterpriseAccess(enterpriseSlug);
  }

  async getEnterpriseInfo(enterpriseSlug: string) {
    const { data } = await this.octokit.request('GET /enterprises/{enterprise}', {
      enterprise: enterpriseSlug,
    });
    return data;
  }

  async createOrganization(enterpriseSlug: string, orgName: string) {
    // This would require enterprise-level permissions
    // Implementation depends on GitHub's enterprise API capabilities
    throw new Error('Organization creation not yet implemented');
  }

  async createTeam(orgName: string, teamName: string) {
    const { data } = await this.octokit.rest.teams.create({
      org: orgName,
      name: teamName,
      privacy: 'closed',
    });
    return data;
  }

  async getCurrentUser(): Promise<any> {
    try {
      const { data: user } = await this.octokit.rest.users.getAuthenticated();
      return user;
    } catch (error: any) {
      throw new Error(`Failed to get current user: ${error.message}`);
    }
  }

  async listUserEnterprises(): Promise<any[]> {
    try {
      // Try to list enterprises the user has access to
      const { data: enterprises } = await this.octokit.request('GET /user/enterprises');
      return enterprises;
    } catch (error: any) {
      // If the enterprises endpoint fails, return empty array
      return [];
    }
  }

  async debugEnterpriseAccess(enterpriseSlug: string): Promise<void> {
    try {
      console.log(chalk.cyan(`\n🔍 Debug: Testing enterprise access for "${enterpriseSlug}"`));
        // Test 1: Try direct enterprise access
      console.log(chalk.gray('   Testing direct enterprise API access...'));
      try {
        console.log(chalk.gray(`   Making request to: GET /enterprises/${enterpriseSlug}`));
        const { data: enterprise } = await this.octokit.request('GET /enterprises/{enterprise}', {
          enterprise: enterpriseSlug,
        });
        console.log(chalk.green(`   ✅ Direct access successful: ${enterprise.name}`));
        return;
      } catch (error: any) {
        console.log(chalk.red(`   ❌ Direct access failed: ${error.status} - ${error.message}`));
        if (error.request) {
          console.log(chalk.gray(`   Request URL: ${error.request.url}`));
        }
      }

      // Test 2: Try enterprise settings access
      console.log(chalk.gray('   Testing enterprise settings access...'));
      try {
        const response = await this.octokit.request('GET /enterprises/{enterprise}/settings/billing/actions', {
          enterprise: enterpriseSlug,
        });
        console.log(chalk.green(`   ✅ Settings access successful (billing endpoint)`));
        return;
      } catch (error: any) {
        console.log(chalk.red(`   ❌ Settings access failed: ${error.status} - ${error.message}`));
      }

      // Test 3: Try enterprise organizations
      console.log(chalk.gray('   Testing enterprise organizations access...'));
      try {
        const { data: orgs } = await this.octokit.request('GET /enterprises/{enterprise}/organizations', {
          enterprise: enterpriseSlug,
        });
        console.log(chalk.green(`   ✅ Organizations access successful: ${orgs.length} orgs found`));        orgs.forEach((org: any) => {
          console.log(chalk.gray(`      - ${org.login}`));
        });
        return;
      } catch (error: any) {
        console.log(chalk.red(`   ❌ Organizations access failed: ${error.status} - ${error.message}`));
      }

      // Test 4: Check user's organizations for enterprise membership
      console.log(chalk.gray('   Checking user organizations for enterprise clues...'));
      try {
        const { data: userOrgs } = await this.octokit.rest.orgs.listForAuthenticatedUser();
        console.log(chalk.gray(`   Found ${userOrgs.length} organizations:`));        userOrgs.forEach((org: any) => {
          console.log(chalk.gray(`      - ${org.login} (${org.url})`));
        });
      } catch (error: any) {
        console.log(chalk.red(`   ❌ Could not list user organizations: ${error.message}`));
      }

      // Test 5: Check user's enterprise memberships via different endpoint
      console.log(chalk.gray('   Testing user enterprise memberships...'));
      try {
        const { data: user } = await this.octokit.rest.users.getAuthenticated();
        console.log(chalk.gray(`   Current user: ${user.login} (ID: ${user.id})`));
        
        // Try to get user's organizations with admin privileges
        const { data: userOrgsWithAdmin } = await this.octokit.rest.orgs.listForAuthenticatedUser({
          type: 'all'
        });
        console.log(chalk.gray(`   User has access to ${userOrgsWithAdmin.length} organizations total`));
        
        if (userOrgsWithAdmin.length > 0) {
          console.log(chalk.gray('   Organizations:'));
          userOrgsWithAdmin.forEach((org: any) => {
            console.log(chalk.gray(`      - ${org.login} (Role: ${org.role || 'member'})`));
          });
        }
      } catch (error: any) {
        console.log(chalk.red(`   ❌ Could not check user enterprise memberships: ${error.message}`));
      }

      // Test 6: Try to access the enterprise through a known organization
      console.log(chalk.gray('   Attempting to find enterprise through organization membership...'));
      try {
        // Check if there's an organization that matches or contains the enterprise name
        const { data: allOrgs } = await this.octokit.rest.orgs.listForAuthenticatedUser();
        const possibleEnterpriseOrg = allOrgs.find((org: any) => 
          org.login.includes(enterpriseSlug) || enterpriseSlug.includes(org.login)
        );
        
        if (possibleEnterpriseOrg) {
          console.log(chalk.yellow(`   Found potentially related organization: ${possibleEnterpriseOrg.login}`));
          
          // Try to get the organization's enterprise info
          try {
            const { data: orgDetails } = await this.octokit.rest.orgs.get({
              org: possibleEnterpriseOrg.login
            });
            console.log(chalk.gray(`   Organization details: ${orgDetails.name || orgDetails.login}`));
            console.log(chalk.gray(`   Plan: ${orgDetails.plan?.name || 'Unknown'}`));
          } catch (orgError: any) {
            console.log(chalk.red(`   Could not get org details: ${orgError.message}`));
          }
        } else {
          console.log(chalk.yellow('   No organizations found that might be related to this enterprise'));
        }
      } catch (error: any) {
        console.log(chalk.red(`   ❌ Could not search organizations: ${error.message}`));
      }

    } catch (error: any) {
      console.log(chalk.red(`\n❌ Debug failed: ${error.message}`));
    }
  }

  async debugSAMLEndpoints(enterpriseSlug: string): Promise<void> {
    console.log(chalk.cyan(`\n🔧 Testing SAML-specific endpoints for "${enterpriseSlug}"`));
    
    // Test 1: Check current SAML configuration
    console.log(chalk.gray('   Testing SAML configuration endpoint...'));
    try {
      const response = await this.octokit.request('GET /enterprises/{enterprise}/settings/saml', {
        enterprise: enterpriseSlug,
      });
      console.log(chalk.green(`   ✅ SAML config endpoint accessible`));
      console.log(chalk.gray(`   SAML enabled: ${response.data?.enabled || false}`));
      if (response.data?.sso_url) {
        console.log(chalk.gray(`   Current SSO URL: ${response.data.sso_url}`));
      }
    } catch (error: any) {
      console.log(chalk.red(`   ❌ SAML config endpoint failed: ${error.status} - ${error.message}`));
    }

    // Test 2: Check enterprise organizations (needed for SSO setup)
    console.log(chalk.gray('   Testing enterprise organizations endpoint...'));
    try {
      const { data: orgs } = await this.octokit.request('GET /enterprises/{enterprise}/organizations', {
        enterprise: enterpriseSlug,
      });
      console.log(chalk.green(`   ✅ Organizations endpoint accessible: ${orgs.length} organizations`));
      orgs.forEach((org: any) => {
        console.log(chalk.gray(`      - ${org.login}`));
      });
    } catch (error: any) {
      console.log(chalk.red(`   ❌ Organizations endpoint failed: ${error.status} - ${error.message}`));
    }

    // Test 3: Check if we can access enterprise members (useful for SSO)
    console.log(chalk.gray('   Testing enterprise members endpoint...'));
    try {
      const response = await this.octokit.request('GET /enterprises/{enterprise}/members', {
        enterprise: enterpriseSlug,
      });
      console.log(chalk.green(`   ✅ Members endpoint accessible: ${response.data.length} members`));
    } catch (error: any) {
      console.log(chalk.red(`   ❌ Members endpoint failed: ${error.status} - ${error.message}`));
    }
  }
  async directAPIRequest(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
    const url = `https://api.github.com${endpoint}`;
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ghec-sso-cli/1.0.0'
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    console.log(chalk.gray(`   Making direct API request: ${method} ${url}`));
    console.log(chalk.gray(`   Using token: ${this.token.substring(0, 8)}...`));

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch {
      responseData = { raw: responseText };
    }

    console.log(chalk.gray(`   Response status: ${response.status} ${response.statusText}`));
    
    if (!response.ok) {
      console.log(chalk.gray(`   Response headers: ${JSON.stringify(Object.fromEntries(response.headers))}`));
      console.log(chalk.gray(`   Response body: ${responseText.substring(0, 200)}...`));
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${responseText}`);
    }

    return responseData;
  }

  async debugSAMLEndpointsWithDirectAPI(enterpriseSlug: string): Promise<void> {
    console.log(chalk.cyan(`\n🔧 Testing SAML endpoints with direct API calls for "${enterpriseSlug}"`));
    
    // Test 1: Check current SAML configuration with direct API
    console.log(chalk.gray('   Testing SAML configuration endpoint (direct API)...'));
    try {
      const response = await this.directAPIRequest(`/enterprises/${enterpriseSlug}/settings/saml`);
      console.log(chalk.green(`   ✅ SAML config endpoint accessible (direct API)`));
      console.log(chalk.gray(`   SAML enabled: ${response?.enabled || false}`));
      if (response?.sso_url) {
        console.log(chalk.gray(`   Current SSO URL: ${response.sso_url}`));
      }
    } catch (error: any) {
      console.log(chalk.red(`   ❌ SAML config endpoint failed (direct API): ${error.message}`));
    }

    // Test 2: Check enterprise organizations with direct API
    console.log(chalk.gray('   Testing enterprise organizations endpoint (direct API)...'));
    try {
      const response = await this.directAPIRequest(`/enterprises/${enterpriseSlug}/organizations`);
      console.log(chalk.green(`   ✅ Organizations endpoint accessible (direct API): ${response.length} organizations`));
      response.forEach((org: any) => {
        console.log(chalk.gray(`      - ${org.login}`));
      });
    } catch (error: any) {
      console.log(chalk.red(`   ❌ Organizations endpoint failed (direct API): ${error.message}`));
    }

    // Test 3: Check enterprise members with direct API
    console.log(chalk.gray('   Testing enterprise members endpoint (direct API)...'));
    try {
      const response = await this.directAPIRequest(`/enterprises/${enterpriseSlug}/members`);
      console.log(chalk.green(`   ✅ Members endpoint accessible (direct API): ${response.length} members`));
    } catch (error: any) {
      console.log(chalk.red(`   ❌ Members endpoint failed (direct API): ${error.message}`));
    }

    // Test 4: Check enterprise settings/billing (we know this works)
    console.log(chalk.gray('   Testing enterprise billing endpoint (direct API)...'));
    try {
      const response = await this.directAPIRequest(`/enterprises/${enterpriseSlug}/settings/billing/actions`);
      console.log(chalk.green(`   ✅ Billing endpoint accessible (direct API)`));
      console.log(chalk.gray(`   Response type: ${typeof response}`));
    } catch (error: any) {
      console.log(chalk.red(`   ❌ Billing endpoint failed (direct API): ${error.message}`));
    }

    // Test 5: Try enterprise info endpoint with different API versions
    console.log(chalk.gray('   Testing enterprise info with different API approaches...'));
    
    // Try with different Accept headers
    const acceptHeaders = [
      'application/vnd.github+json',
      'application/vnd.github.v3+json',
      'application/json',
      'application/vnd.github.enterprise-admin+json'
    ];

    for (const acceptHeader of acceptHeaders) {
      try {        console.log(chalk.gray(`   Trying with Accept: ${acceptHeader}`));
        const response = await fetch(`https://api.github.com/enterprises/${enterpriseSlug}`, {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Accept': acceptHeader,
            'User-Agent': 'ghec-sso-cli/1.0.0'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log(chalk.green(`   ✅ Enterprise info accessible with ${acceptHeader}`));
          console.log(chalk.gray(`   Enterprise: ${data.name || data.slug || 'Unknown'}`));
          break;
        } else {
          console.log(chalk.gray(`   ${response.status} with ${acceptHeader}`));
        }
      } catch (error: any) {
        console.log(chalk.gray(`   Error with ${acceptHeader}: ${error.message}`));
      }
    }
  }

  async investigateEnterpriseType(enterpriseSlug: string): Promise<void> {
    console.log(chalk.cyan(`\n🔍 Investigating enterprise/organization type for "${enterpriseSlug}"`));
    
    // Test 1: Check if it's actually an organization
    console.log(chalk.gray('   Testing if this is an organization instead of enterprise...'));
    try {
      const response = await this.directAPIRequest(`/orgs/${enterpriseSlug}`);
      console.log(chalk.yellow(`   ⚠️  Found organization: ${response.name || response.login}`));
      console.log(chalk.gray(`   Plan: ${response.plan?.name || 'Unknown'}`));
      console.log(chalk.gray(`   Type: ${response.type || 'Unknown'}`));
      
      // Check if organization has SAML SSO available
      console.log(chalk.gray('   Checking organization SAML SSO capabilities...'));
      try {
        const samlResponse = await this.directAPIRequest(`/orgs/${enterpriseSlug}/saml-sso`);
        console.log(chalk.green(`   ✅ Organization SAML SSO endpoint accessible`));
        console.log(chalk.gray(`   SAML enabled: ${samlResponse?.enabled || false}`));
      } catch (samlError: any) {
        console.log(chalk.red(`   ❌ Organization SAML SSO endpoint failed: ${samlError.message}`));
      }
      
      return;
    } catch (orgError: any) {
      console.log(chalk.gray(`   Not an organization: ${orgError.message}`));
    }

    // Test 2: Check if enterprise exists at all
    console.log(chalk.gray('   Testing basic enterprise existence...'));
    try {
      const response = await this.directAPIRequest(`/enterprises/${enterpriseSlug}`);
      console.log(chalk.green(`   ✅ Enterprise exists: ${response.name || response.slug}`));
      console.log(chalk.gray(`   Enterprise ID: ${response.id}`));
      console.log(chalk.gray(`   Created: ${response.created_at}`));
    } catch (enterpriseError: any) {
      console.log(chalk.red(`   ❌ Enterprise not found: ${enterpriseError.message}`));
    }

    // Test 3: Check user's accessible enterprises
    console.log(chalk.gray('   Checking user accessible enterprises...'));
    try {
      const response = await this.directAPIRequest(`/user/enterprises`);
      console.log(chalk.green(`   ✅ User enterprises endpoint accessible: ${response.length} enterprises`));
      response.forEach((enterprise: any) => {
        console.log(chalk.gray(`      - ${enterprise.slug} (${enterprise.name})`));
      });
    } catch (userEntError: any) {
      console.log(chalk.red(`   ❌ User enterprises endpoint failed: ${userEntError.message}`));
    }

    // Test 4: Check all accessible organizations for enterprise clues
    console.log(chalk.gray('   Checking all accessible organizations...'));
    try {
      const response = await this.directAPIRequest(`/user/orgs`);
      console.log(chalk.gray(`   Found ${response.length} organizations:`));
      
      for (const org of response) {
        console.log(chalk.gray(`      - ${org.login}`));
        
        // Check if this org might be part of an enterprise
        try {
          const orgDetails = await this.directAPIRequest(`/orgs/${org.login}`);
          if (orgDetails.plan?.name === 'enterprise') {
            console.log(chalk.yellow(`        └─ Enterprise plan detected!`));
          }
        } catch {
          // Ignore errors getting org details
        }
      }
    } catch (orgsError: any) {
      console.log(chalk.red(`   ❌ Could not list organizations: ${orgsError.message}`));
    }
  }
}

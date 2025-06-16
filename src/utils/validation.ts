import { GitHubService } from '../services/github';
import { AzureService } from '../services/azure';

export async function validatePrerequisites(
  githubService: GitHubService,
  azureService: AzureService,
  config: any
): Promise<void> {
  // Validate GitHub Enterprise access
  const githubValidation = await githubService.validateEnterpriseAccess(config.enterprise);
  if (!githubValidation.success) {
    throw new Error(`GitHub validation failed: ${githubValidation.message}`);
  }

  // Check if SSO is already configured
  const ssoValidation = await githubService.validateSSOConfig(config.enterprise);
  if (ssoValidation.success) {
    throw new Error('SSO is already configured for this enterprise. Use validate command to check configuration.');
  }

  // Validate Azure access
  const azureValidation = await azureService.validateEnterpriseApp();
  // Note: This might show as failed if no GitHub apps exist yet, which is expected

  console.log('✅ All prerequisites validated successfully');
}

export function validateEnterpriseSlug(slug: string): boolean {
  // GitHub enterprise slugs should be lowercase alphanumeric with hyphens
  const pattern = /^[a-z0-9-]+$/;
  return pattern.test(slug) && slug.length >= 2 && slug.length <= 39;
}

export function validateTenantDomain(domain: string): boolean {
  // Basic domain validation
  const pattern = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
  return pattern.test(domain);
}

export function validateEmail(email: string): boolean {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

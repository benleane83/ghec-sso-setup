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

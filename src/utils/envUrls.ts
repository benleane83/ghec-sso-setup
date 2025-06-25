// Centralized helpers for environment-specific GitHub/SCIM URLs and config

export type EnvType = 'github.com' | 'ghe.com';

export function getBaseUrls(envType: EnvType | undefined, enterprise: string) {
  if (envType === 'ghe.com') {
    return {
      web: `https://${enterprise}.ghe.com`,
      api: `https://api.${enterprise}.ghe.com`
    };
  } else {
    return {
      web: 'https://github.com',
      api: 'https://api.github.com'
    };
  }
}

export function getScimEndpoint(envType: EnvType | undefined, enterprise: string) {
  const { api } = getBaseUrls(envType, enterprise);
  return `${api}/scim/v2/enterprises/${enterprise}`;
}

export function getAppConfig(envType: EnvType | undefined, enterprise: string, ssoType: 'saml' | 'oidc') {
  const { web } = getBaseUrls(envType, enterprise);
  return {
    displayName: ssoType === 'oidc'
      ? `GitHub Enterprise Managed User (OIDC)`
      : `GitHub Enterprise SAML SSO - ${enterprise}`,
    signOnUrl: `${web}/enterprises/${enterprise}/sso`,
    entityId: `${web}/enterprises/${enterprise}`,
    replyUrl: ssoType === 'oidc'
      ? `${web}/enterprises/${enterprise}/oauth/callback`
      : `${web}/enterprises/${enterprise}/saml/consume`,
    logoutUrl: `${web}/enterprises/${enterprise}/saml/sls`,
    githubSamlUrl: `${web}/enterprises/${enterprise}/settings/saml_provider/edit`,
    githubTokenUrl: `${web}/settings/tokens/new?scopes=scim:enterprise&description=SCIM%20Token`,
    githubSsoConfigUrl: `${web}/enterprises/${enterprise}/settings/single_sign_on_configuration`
  };
}

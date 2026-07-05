export interface NavigraphConfig {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  apiBaseUrl: string;
  redirectUri: string;
  scopes: string;
}

const value = (name: string, fallback = "") => process.env[name]?.trim() || fallback;

export function getNavigraphConfig(): NavigraphConfig {
  const config = {
    clientId: value("NAVIGRAPH_CLIENT_ID"),
    clientSecret: value("NAVIGRAPH_CLIENT_SECRET"),
    authorizationUrl: value("NAVIGRAPH_AUTHORIZATION_URL"),
    tokenUrl: value("NAVIGRAPH_TOKEN_URL"),
    apiBaseUrl: value("NAVIGRAPH_API_BASE_URL", "https://api.simbrief.com/v2").replace(/\/$/, ""),
    redirectUri: value("NAVIGRAPH_REDIRECT_URI"),
    scopes: "openid simbrief ofp offline_access",
  };
  if (!config.clientId || !config.authorizationUrl || !config.tokenUrl || !config.redirectUri) {
    throw new Error("Navigraph OAuth is not configured.");
  }
  return config;
}

export function isNavigraphConfigured() {
  return Boolean(value("NAVIGRAPH_CLIENT_ID") && value("NAVIGRAPH_AUTHORIZATION_URL") && value("NAVIGRAPH_TOKEN_URL") && value("NAVIGRAPH_REDIRECT_URI"));
}

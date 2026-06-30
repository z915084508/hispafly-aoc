export interface VamsysPilotConfig {
  clientId: string;
  redirectUri: string;
  scopes: string;
  apiBaseUrl: string;
  authorizationUrl: string;
  tokenUrl: string;
}

const value = (name: string, fallback?: string) => process.env[name]?.trim() || fallback || "";

export function getVamsysPilotConfig(): VamsysPilotConfig {
  const config = {
    clientId: value("VAMSYS_PILOT_CLIENT_ID"),
    redirectUri: value("VAMSYS_PILOT_REDIRECT_URI"),
    scopes: value("VAMSYS_PILOT_SCOPES", "identity:basic identity:networks identity:discord identity:social pilot:read pilot:write flights:read flights:write activities:read activities:write"),
    apiBaseUrl: value("VAMSYS_API_BASE_URL", "https://vamsys.io/api/v3/pilot").replace(/\/$/, ""),
    authorizationUrl: value("VAMSYS_AUTH_URL", "https://vamsys.io/oauth/authorize"),
    tokenUrl: value("VAMSYS_TOKEN_URL", "https://vamsys.io/oauth/token"),
  };
  if (!config.clientId || !config.redirectUri) {
    throw new Error("La conexión OAuth de vAMSYS no está configurada.");
  }
  return config;
}

export function isVamsysPilotConfigured() {
  return Boolean(value("VAMSYS_PILOT_CLIENT_ID") && value("VAMSYS_PILOT_REDIRECT_URI"));
}

const DEFAULT_SIMBRIEF_API_BASE_URL = "https://api.simbrief.com/v2";

export interface SimBriefConfig {
  apiBaseUrl: string;
}

export function getSimBriefConfig(): SimBriefConfig {
  return {
    apiBaseUrl: (process.env.NAVIGRAPH_API_BASE_URL?.trim() || DEFAULT_SIMBRIEF_API_BASE_URL).replace(/\/+$/, ""),
  };
}

export function buildSimBriefApiUrl(path: string) {
  const base = getSimBriefConfig().apiBaseUrl;
  const normalizedPath = `/${path.replace(/^\/+/, "")}`;
  const pathWithoutDuplicateVersion = base.endsWith("/v2") && normalizedPath.startsWith("/v2/")
    ? normalizedPath.slice(3)
    : normalizedPath;
  return `${base}${pathWithoutDuplicateVersion}`;
}


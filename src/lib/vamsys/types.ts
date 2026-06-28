export interface VamsysTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
}

export type VamsysApiRecord = Record<string, unknown>;

export interface ImportedVamsysPilot {
  vamsysPilotId: string;
  vamsysUserId: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string | null;
  callsign: string | null;
  vatsimId: string | null;
  ivaoId: string | null;
  discordId: string | null;
  rankName: string | null;
  rankAbbreviation: string | null;
  hubId: string | null;
}

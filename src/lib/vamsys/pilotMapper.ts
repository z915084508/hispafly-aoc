import type { ImportedVamsysPilot, VamsysApiRecord } from "./types";

function unwrap(value: VamsysApiRecord): VamsysApiRecord {
  const data = value.data;
  if (Array.isArray(data) && data[0] && typeof data[0] === "object") return data[0] as VamsysApiRecord;
  if (data && typeof data === "object" && !Array.isArray(data)) return data as VamsysApiRecord;
  return value;
}

function text(record: VamsysApiRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function nestedText(record: VamsysApiRecord, parent: string, keys: string[]): string | null {
  const value = record[parent];
  return value && typeof value === "object" && !Array.isArray(value) ? text(value as VamsysApiRecord, keys) : null;
}

export function mapVamsysPilot(userResponse: VamsysApiRecord, profileResponse: VamsysApiRecord): ImportedVamsysPilot {
  const user = unwrap(userResponse);
  const profile = unwrap(profileResponse);
  const vamsysPilotId = text(profile, ["pilot_id", "pilotId", "id", "uuid"]);
  if (!vamsysPilotId) throw new Error("vAMSYS profile did not include a pilot identifier.");

  const firstName = text(user, ["first_name", "firstName"]) ?? text(profile, ["first_name", "firstName"]);
  const lastName = text(user, ["last_name", "lastName"]) ?? text(profile, ["last_name", "lastName"]);
  const username = text(user, ["username", "name"]) ?? text(profile, ["username"]);
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || username || `Piloto ${vamsysPilotId}`;

  return {
    vamsysPilotId,
    vamsysUserId: text(user, ["user_id", "userId", "id", "uuid"]),
    username,
    firstName,
    lastName,
    displayName,
    email: text(user, ["email"]),
    callsign: text(profile, ["callsign", "pilot_callsign"]),
    vatsimId: text(profile, ["vatsim_id", "vatsimId"]) ?? nestedText(profile, "vatsim", ["id"]),
    ivaoId: text(profile, ["ivao_id", "ivaoId"]) ?? nestedText(profile, "ivao", ["id"]),
    discordId: text(profile, ["discord_id", "discordId"]) ?? nestedText(profile, "discord", ["id"]),
    rankName: text(profile, ["rank_name", "rankName"]) ?? nestedText(profile, "rank", ["name"]),
    rankAbbreviation: text(profile, ["rank_abbreviation", "rankAbbreviation"]) ?? nestedText(profile, "rank", ["abbreviation", "abbr"]),
    hubId: text(profile, ["hub_id", "hubId"]) ?? nestedText(profile, "hub", ["id"]),
  };
}

export const PILOT_RANKS = ["TRN", "FO", "SFO", "CPT", "SCPT"] as const;
export type PilotRank = typeof PILOT_RANKS[number];

export type CareerStats = {
  acceptedSectors: number;
  acceptedMinutes: number;
  totalPireps: number;
};

export type CareerRequirement = {
  label: string;
  current: number;
  target: number;
  unit: "sectors" | "hours" | "percent";
};

const rankAliases: Record<string, PilotRank> = {
  TRN: "TRN", TRAINEE: "TRN", "TRAINEE PILOT": "TRN",
  FO: "FO", "FIRST OFFICER": "FO",
  SFO: "SFO", "SENIOR FIRST OFFICER": "SFO",
  CPT: "CPT", CAPTAIN: "CPT",
  SCPT: "SCPT", "SENIOR CAPTAIN": "SCPT",
};

export function normalizePilotRank(...values: Array<string | null | undefined>): PilotRank {
  for (const value of values) {
    const rank = value ? rankAliases[value.trim().toUpperCase()] : undefined;
    if (rank) return rank;
  }
  return "TRN";
}

export function careerProgress(rank: PilotRank, stats: CareerStats) {
  const hours = stats.acceptedMinutes / 60;
  const acceptanceRate = stats.totalPireps ? stats.acceptedSectors / stats.totalPireps * 100 : 100;
  const definitions: Record<PilotRank, { next: PilotRank | null; approval: boolean; requirements: CareerRequirement[] }> = {
    TRN: { next: "FO", approval: false, requirements: [{ label: "Accepted sectors", current: stats.acceptedSectors, target: 5, unit: "sectors" }] },
    FO: { next: "SFO", approval: false, requirements: [
      { label: "HISPAFLY hours", current: hours, target: 100, unit: "hours" },
      { label: "Accepted sectors", current: stats.acceptedSectors, target: 50, unit: "sectors" },
    ] },
    SFO: { next: "CPT", approval: true, requirements: [
      { label: "HISPAFLY hours", current: hours, target: 300, unit: "hours" },
      { label: "Accepted sectors", current: stats.acceptedSectors, target: 150, unit: "sectors" },
      { label: "Accepted PIREPs", current: acceptanceRate, target: 95, unit: "percent" },
    ] },
    CPT: { next: "SCPT", approval: true, requirements: [
      { label: "HISPAFLY hours", current: hours, target: 600, unit: "hours" },
      { label: "Accepted sectors", current: stats.acceptedSectors, target: 300, unit: "sectors" },
    ] },
    SCPT: { next: null, approval: false, requirements: [] },
  };
  const definition = definitions[rank];
  const percent = definition.requirements.length
    ? Math.min(100, Math.floor(definition.requirements.reduce((sum, item) => sum + Math.min(1, item.current / item.target), 0) / definition.requirements.length * 100))
    : 100;
  return { ...definition, percent, eligible: definition.requirements.every((item) => item.current >= item.target) };
}

export function earnedAwards(stats: CareerStats) {
  const hours = stats.acceptedMinutes / 60;
  return [
    { code: "FIRST_LEG", name: "First Leg", description: "Complete the first accepted HISPAFLY sector.", earned: stats.acceptedSectors >= 1 },
    { code: "FIFTY_SECTORS", name: "Route Regular", description: "Complete 50 accepted sectors.", earned: stats.acceptedSectors >= 50 },
    { code: "HUNDRED_HOURS", name: "100 Hours", description: "Log 100 accepted HISPAFLY hours.", earned: hours >= 100 },
    { code: "THREE_HUNDRED_HOURS", name: "300 Hours", description: "Log 300 accepted HISPAFLY hours.", earned: hours >= 300 },
  ];
}

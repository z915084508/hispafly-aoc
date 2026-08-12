export const HISPAFLY_HUB_ICAOS = ["LEMD", "LEVC", "LEPA", "LEBL"] as const;

export const isHispaFlyHub = (icao: string) => HISPAFLY_HUB_ICAOS.includes(icao.toUpperCase() as (typeof HISPAFLY_HUB_ICAOS)[number]);

const STALE_LOCATION_MS = 72 * 60 * 60 * 1000;

type StateInput = {
  operationalStatus: string;
  currentAirportId: string | null;
  locationSnapshot?: { status: string; currentAirportId: string | null; source: string; updatedAt: Date } | null;
};

export function resolveAircraftState(aircraft: StateInput, now = new Date()) {
  const snapshot = aircraft.locationSnapshot ?? null;
  const locationStatus = snapshot?.status ?? null;
  const maintenanceBlocked = ["MAINTENANCE", "AOG", "IN_MAINTENANCE", "RETIRED", "SUSPENDED"].includes(aircraft.operationalStatus);
  const available = !maintenanceBlocked && (snapshot ? locationStatus === "AVAILABLE" : aircraft.operationalStatus === "AVAILABLE");
  return {
    available,
    currentAirportId: snapshot?.currentAirportId ?? aircraft.currentAirportId,
    source: snapshot?.source ?? "AIRCRAFT_MASTER",
    stale: Boolean(snapshot && now.getTime() - snapshot.updatedAt.getTime() > STALE_LOCATION_MS),
    external: snapshot?.source === "VAMSYS_EXTERNAL",
    updatedAt: snapshot?.updatedAt ?? null,
  };
}

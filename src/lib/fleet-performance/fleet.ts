export type FleetAircraft = {
  id: string;
  fleetId: string | null;
  fleetName: string | null;
  aircraftType: string | null;
};

export function fleetKeyForAircraft(aircraft: FleetAircraft) {
  if (aircraft.fleetId?.trim()) return `ID:${aircraft.fleetId.trim()}`;
  if (aircraft.fleetName?.trim()) return `NAME:${aircraft.fleetName.trim().toUpperCase()}`;
  if (aircraft.aircraftType?.trim()) return `TYPE:${aircraft.aircraftType.trim().toUpperCase()}`;
  return `AIRCRAFT:${aircraft.id}`;
}

export function groupAircraftByFleet<T extends FleetAircraft>(aircraft: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of aircraft) {
    const key = fleetKeyForAircraft(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([fleetKey, members]) => ({ fleetKey, members }));
}

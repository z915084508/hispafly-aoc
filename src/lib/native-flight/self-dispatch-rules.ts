export const SELF_DISPATCH_MIN_LEAD_MINUTES = 15;
export const SELF_DISPATCH_MAX_HORIZON_DAYS = 30;

export function validateSelfDispatchWindow(departure: Date, now = new Date()) {
  if (Number.isNaN(departure.getTime())) return "Select a valid UTC departure time.";
  if (departure.getTime() < now.getTime() + SELF_DISPATCH_MIN_LEAD_MINUTES * 60_000) return `Departure must be at least ${SELF_DISPATCH_MIN_LEAD_MINUTES} minutes from now.`;
  if (departure.getTime() > now.getTime() + SELF_DISPATCH_MAX_HORIZON_DAYS * 86_400_000) return `Departure cannot be more than ${SELF_DISPATCH_MAX_HORIZON_DAYS} days from now.`;
  return null;
}

export function fleetIsAuthorized(assignedFleetIds: string[], aircraftFleetId: string | null | undefined) {
  return Boolean(aircraftFleetId) && (!assignedFleetIds.length || assignedFleetIds.includes(aircraftFleetId!));
}

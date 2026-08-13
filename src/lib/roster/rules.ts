export type RosterState = "RESERVED" | "COMPLETED" | "CANCELLED";

export function rosterState(bookingStatus: string, flightStatus?: string | null): RosterState {
  if (bookingStatus === "CANCELLED" || flightStatus === "CANCELLED") return "CANCELLED";
  if (["COMPLETED", "FLOWN"].includes(bookingStatus) || flightStatus === "COMPLETED") return "COMPLETED";
  return "RESERVED";
}

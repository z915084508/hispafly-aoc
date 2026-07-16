export type AircraftLocationStatusValue = "AVAILABLE" | "RESERVED" | "IN_FLIGHT" | "MAINTENANCE" | "UNKNOWN";
export type AircraftLocationSourceValue = "MANUAL" | "PIREP" | "DISPATCH" | "ACARS" | "NATIVE_DISPATCH" | "NATIVE_ACARS" | "NATIVE_PIREP" | "VAMSYS_LEGACY" | "VAMSYS_EXTERNAL" | "IMPORTED";

export type AircraftLocationMapItem = {
  id: string;
  vamsysAircraftId: string;
  registration: string | null;
  aircraftType: string | null;
  currentAirportIcao: string | null;
  currentAirportIata: string | null;
  status: AircraftLocationStatusValue;
  source: AircraftLocationSourceValue;
  lastBookingId: string | null;
  lastVamsysPirepId: string | null;
  updatedAt: string;
  latitude: number | null;
  longitude: number | null;
};

export type FleetMapLabels = {
  empty: string;
  aircraftAtAirport: string;
  createRepositionOffer: string;
  staleLocation: string;
  externalMovement: string;
  unavailable: string;
  registration: string;
  aircraftType: string;
  status: string;
  source: string;
  updatedAt: string;
  lastBooking: string;
  lastPirep: string;
  statusValues: Record<AircraftLocationStatusValue, string>;
  sourceValues: Record<AircraftLocationSourceValue, string>;
};

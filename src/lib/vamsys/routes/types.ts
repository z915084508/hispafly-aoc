export interface VamsysRouteData {
  id: number;
  type: string;
  departure_id: number;
  arrival_id: number;
  callsign: string;
  flight_number: string;
  departure_time?: string | null;
  arrival_time?: string | null;
  flight_length?: string | null;
  flight_distance?: number | null;
  altitude?: number | null;
  cost_index?: string | null;
  route?: string | null;
  remarks?: string | null;
  internal_remarks?: string | null;
  tag?: string[];
  service_days?: string[];
  start_date?: string | null;
  end_date?: string | null;
  hidden?: boolean;
  fleet_ids?: number[];
  container_ids?: number[];
  loadfactor_ids?: Record<string, number>;
  simbrief_options?: Record<string, unknown>;
  callsign_options?: Record<string, boolean>;
  created_at?: string;
  updated_at?: string;
}

export interface VamsysRoutePayload {
  type?: string;
  callsign?: string;
  flight_number?: string;
  departure_id?: number;
  arrival_id?: number;
  departure_time?: string | null;
  arrival_time?: string | null;
  flight_length?: string | null;
  flight_distance?: number | null;
  altitude?: number | null;
  cost_index?: string | null;
  route?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  hidden?: boolean;
  remarks?: string | null;
  internal_remarks?: string | null;
  fleet_ids?: number[];
  service_days?: string[];
  tag?: string[];
  container_ids?: number[];
  loadfactor_ids?: Record<string, number>;
  simbrief_options?: Record<string, unknown>;
  callsign_options?: Record<string, boolean>;
}

export interface RouteFormInput {
  localId?: string;
  type: string;
  callsign: string;
  flightNumber: string;
  departureIcao: string;
  arrivalIcao: string;
  departureTime?: string;
  arrivalTime?: string;
  durationMinutes?: number;
  distanceNm?: number;
  altitude?: number;
  costIndex?: string;
  route?: string;
  hidden: boolean;
  remarks?: string;
  internalNotes?: string;
  fleetIds: string[];
}

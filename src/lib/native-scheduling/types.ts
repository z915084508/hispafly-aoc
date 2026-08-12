export type ProposedFlightSchedule = {
  scheduleId?: string;
  routeId: string;
  daysOfWeek: number[];
  departureTimeMinutesUtc: number;
  arrivalTimeMinutesUtc: number;
  scheduledDurationMinutes: number;
  defaultFleetId?: string | null;
  assignedAircraftId?: string | null;
  effectiveFrom: Date;
  effectiveUntil?: Date | null;
  bookingOpenOffsetMinutes: number;
  bookingCloseOffsetMinutes: number;
  generationHorizonDays: number;
};

export type ScheduleValidationIssue = {
  code: string;
  severity: "ERROR" | "WARNING";
  message: string;
  scheduleId?: string;
  conflictingScheduleId?: string;
  routeId?: string;
  aircraftId?: string;
  dayOfWeek?: number;
  startsAt?: Date;
  endsAt?: Date;
  details?: Record<string, unknown>;
};

export type ScheduleDayValidation = { dayOfWeek: number; valid: boolean; issues: ScheduleValidationIssue[] };
export type ScheduleValidationResult = { valid: boolean; errors: ScheduleValidationIssue[]; warnings: ScheduleValidationIssue[]; days: ScheduleDayValidation[] };

export type SchedulingRoute = {
  id: string; active: boolean; operationalStatus: string; archivedAt: Date | null;
  departureAirportId: string | null; arrivalAirportId: string | null;
  departureAirport: { id: string; icao: string; status: string } | null;
  arrivalAirport: { id: string; icao: string; status: string } | null;
  fleetAssignments: Array<{ fleetId: string }>;
  fleetCompatibility: Array<{ fleetId: string; policy: string }>;
};
export type SchedulingFleet = { id: string; operationalStatus: string; active: boolean; archivedAt: Date | null };
export type SchedulingAircraft = {
  id: string; nativeFleetId: string | null; operationalStatus: string; operationMode?: "FREE" | "SCHEDULED" | "FLEX"; archivedAt: Date | null;
  conditionSnapshot: { operationalStatus: string; maintenanceStatus: string } | null;
  nativeFleet: SchedulingFleet | null;
};
export type ExistingSchedule = {
  id: string; routeId: string; daysOfWeek: number[]; departureTimeMinutesUtc: number;
  scheduledDurationMinutes: number; assignedAircraftId: string | null; status: string;
  effectiveFrom: Date; effectiveUntil: Date | null;
  route: { departureAirportId: string | null; arrivalAirportId: string | null };
};
export type ExistingGeneratedFlight = {
  id: string; scheduleId: string | null; routeId: string; assignedAircraftId: string | null;
  scheduledDeparture: Date; scheduledArrival: Date; status: string; manuallyModifiedAt: Date | null;
};
export type ScheduleValidationContext = {
  route: SchedulingRoute | null;
  fleet: SchedulingFleet | null;
  aircraft: SchedulingAircraft | null;
  existingSchedules: ExistingSchedule[];
  generatedFlights: ExistingGeneratedFlight[];
};

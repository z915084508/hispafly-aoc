import { calculatePayroll } from "./payroll/calculatePayroll.ts";
import type { AircraftType as SupportedAircraft } from "./payroll/types.ts";

export type MockPirepStatus = "accepted" | "rejected";

export interface MockPilot {
  vamsysPilotId: string;
  callsign: string;
  displayName: string;
  email: string;
  rank: string;
  base: string;
}

export interface MockPirep {
  vamsysPirepId: string;
  vamsysPilotId: string;
  flightNumber: string;
  callsign: string;
  departure: string;
  arrival: string;
  aircraftType: SupportedAircraft;
  network: "VATSIM" | "IVAO" | "OFFLINE";
  flightTimeMinutes: number;
  blockTimeMinutes: number;
  landingRate: number;
  score: number;
  fuelUsed: number;
  status: MockPirepStatus;
  flownAt: string;
}

export const mockPilots: MockPilot[] = [
  { vamsysPilotId: "VMS-HSP-0102", callsign: "HSP102", displayName: "Marta Vidal", email: "marta.vidal@hispafly.test", rank: "Comandante", base: "LEMD" },
  { vamsysPilotId: "VMS-HSP-0118", callsign: "HSP118", displayName: "Daniel Costa", email: "daniel.costa@hispafly.test", rank: "Primer oficial", base: "LEBL" },
  { vamsysPilotId: "VMS-HSP-0126", callsign: "HSP126", displayName: "Lucía Romero", email: "lucia.romero@hispafly.test", rank: "Comandante", base: "LEVC" },
  { vamsysPilotId: "VMS-HSP-0141", callsign: "HSP141", displayName: "Álex Martín", email: "alex.martin@hispafly.test", rank: "Primer oficial", base: "LEMD" },
  { vamsysPilotId: "VMS-HSP-0157", callsign: "HSP157", displayName: "Sofía Navarro", email: "sofia.navarro@hispafly.test", rank: "Comandante", base: "LEVC" },
];

export const mockPireps: MockPirep[] = [
  { vamsysPirepId: "VMS-PIREP-260601", vamsysPilotId: "VMS-HSP-0102", flightNumber: "HSP214", callsign: "HSP214", departure: "LEMD", arrival: "LEBL", aircraftType: "A320", network: "VATSIM", flightTimeMinutes: 74, blockTimeMinutes: 91, landingRate: -184, score: 98, fuelUsed: 3820, status: "accepted", flownAt: "2026-06-03T08:20:00.000Z" },
  { vamsysPirepId: "VMS-PIREP-260602", vamsysPilotId: "VMS-HSP-0118", flightNumber: "HSP431", callsign: "HSP431", departure: "LEVC", arrival: "LEMD", aircraftType: "A321", network: "IVAO", flightTimeMinutes: 55, blockTimeMinutes: 70, landingRate: -245, score: 94, fuelUsed: 3160, status: "accepted", flownAt: "2026-06-05T15:05:00.000Z" },
  { vamsysPirepId: "VMS-PIREP-260603", vamsysPilotId: "VMS-HSP-0126", flightNumber: "HSP508", callsign: "HSP508", departure: "LEBL", arrival: "GCTS", aircraftType: "B772", network: "VATSIM", flightTimeMinutes: 182, blockTimeMinutes: 204, landingRate: -312, score: 96, fuelUsed: 26400, status: "accepted", flownAt: "2026-06-07T10:30:00.000Z" },
  { vamsysPirepId: "VMS-PIREP-260604", vamsysPilotId: "VMS-HSP-0141", flightNumber: "HSP109", callsign: "HSP109", departure: "LEMD", arrival: "EGLL", aircraftType: "A359", network: "OFFLINE", flightTimeMinutes: 132, blockTimeMinutes: 151, landingRate: -421, score: 88, fuelUsed: 17850, status: "accepted", flownAt: "2026-06-09T06:45:00.000Z" },
  { vamsysPirepId: "VMS-PIREP-260605", vamsysPilotId: "VMS-HSP-0157", flightNumber: "HSP332", callsign: "HSP332", departure: "LEVC", arrival: "LEPA", aircraftType: "A388", network: "IVAO", flightTimeMinutes: 48, blockTimeMinutes: 65, landingRate: -128, score: 99, fuelUsed: 11200, status: "accepted", flownAt: "2026-06-11T17:15:00.000Z" },
  { vamsysPirepId: "VMS-PIREP-260606", vamsysPilotId: "VMS-HSP-0102", flightNumber: "HSP216", callsign: "HSP216", departure: "LEMD", arrival: "LEBL", aircraftType: "A321", network: "VATSIM", flightTimeMinutes: 76, blockTimeMinutes: 90, landingRate: -276, score: 93, fuelUsed: 4010, status: "accepted", flownAt: "2026-06-13T12:00:00.000Z" },
  { vamsysPirepId: "VMS-PIREP-260607", vamsysPilotId: "VMS-HSP-0118", flightNumber: "HSP433", callsign: "HSP433", departure: "LEVC", arrival: "LEMD", aircraftType: "A320", network: "OFFLINE", flightTimeMinutes: 57, blockTimeMinutes: 73, landingRate: -640, score: 67, fuelUsed: 3290, status: "accepted", flownAt: "2026-06-15T09:10:00.000Z" },
  { vamsysPirepId: "VMS-PIREP-260608", vamsysPilotId: "VMS-HSP-0126", flightNumber: "HSP510", callsign: "HSP510", departure: "LEBL", arrival: "GCTS", aircraftType: "A359", network: "VATSIM", flightTimeMinutes: 178, blockTimeMinutes: 199, landingRate: -204, score: 97, fuelUsed: 20100, status: "accepted", flownAt: "2026-06-17T13:25:00.000Z" },
  { vamsysPirepId: "VMS-PIREP-260609", vamsysPilotId: "VMS-HSP-0141", flightNumber: "HSP111", callsign: "HSP111", departure: "LEMD", arrival: "EGLL", aircraftType: "B772", network: "IVAO", flightTimeMinutes: 128, blockTimeMinutes: 146, landingRate: -298, score: 95, fuelUsed: 18900, status: "accepted", flownAt: "2026-06-19T16:40:00.000Z" },
  { vamsysPirepId: "VMS-PIREP-260610", vamsysPilotId: "VMS-HSP-0157", flightNumber: "HSP334", callsign: "HSP334", departure: "LEVC", arrival: "LEPA", aircraftType: "A320", network: "VATSIM", flightTimeMinutes: 51, blockTimeMinutes: 66, landingRate: -88, score: 100, fuelUsed: 2950, status: "accepted", flownAt: "2026-06-21T07:35:00.000Z" },
  { vamsysPirepId: "VMS-PIREP-260611", vamsysPilotId: "VMS-HSP-0102", flightNumber: "HSP218", callsign: "HSP218", departure: "LEMD", arrival: "LEBL", aircraftType: "A388", network: "OFFLINE", flightTimeMinutes: 72, blockTimeMinutes: 89, landingRate: -350, score: 84, fuelUsed: 13800, status: "accepted", flownAt: "2026-06-23T18:55:00.000Z" },
  { vamsysPirepId: "VMS-PIREP-260612", vamsysPilotId: "VMS-HSP-0126", flightNumber: "HSP512", callsign: "HSP512", departure: "LEBL", arrival: "GCTS", aircraftType: "B772", network: "IVAO", flightTimeMinutes: 185, blockTimeMinutes: 207, landingRate: -265, score: 92, fuelUsed: 27100, status: "accepted", flownAt: "2026-06-25T11:50:00.000Z" },
  { vamsysPirepId: "VMS-PIREP-260613", vamsysPilotId: "VMS-HSP-0141", flightNumber: "HSP113", callsign: "HSP113", departure: "LEMD", arrival: "EGLL", aircraftType: "A321", network: "VATSIM", flightTimeMinutes: 130, blockTimeMinutes: 149, landingRate: -720, score: 62, fuelUsed: 7520, status: "rejected", flownAt: "2026-06-26T14:15:00.000Z" },
  { vamsysPirepId: "VMS-PIREP-260614", vamsysPilotId: "VMS-HSP-0157", flightNumber: "HSP336", callsign: "HSP336", departure: "LEVC", arrival: "LEPA", aircraftType: "A320", network: "OFFLINE", flightTimeMinutes: 49, blockTimeMinutes: 64, landingRate: -510, score: 55, fuelUsed: 2870, status: "rejected", flownAt: "2026-06-27T20:05:00.000Z" },
];

export const mockPayrollRecords = mockPireps
  .filter((pirep) => pirep.status === "accepted")
  .map((pirep, index) => ({
    id: `MOCK-PAY-${String(index + 1).padStart(3, "0")}`,
    ...pirep,
    pilot: mockPilots.find((pilot) => pilot.vamsysPilotId === pirep.vamsysPilotId)!,
    calculation: calculatePayroll(pirep),
    status: (["pending", "approved", "paid"] as const)[index % 3],
    settlementMonth: pirep.flownAt.slice(0, 7),
  }));

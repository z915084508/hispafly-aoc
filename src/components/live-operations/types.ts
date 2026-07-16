export type LiveFlight = {
  id:string; flightNumber:string; callsign:string; departureIcao:string; arrivalIcao:string; pilot:string;
  aircraftRegistration:string; aircraftType:string; phase:string; connectionStatus:"ONLINE"|"DELAYED"|"OFFLINE"|"COMPLETED";
  sessionStatus:string; lastHeartbeatAt:string; latitude:number|null; longitude:number|null; altitudeFeet:number|null;
  groundSpeedKnots:number|null; headingDegrees:number|null; fuelKg:number|null; onGround:boolean|null; recordedAt:string|null;
};
export type TrackPoint={sequenceNumber:number;recordedAt:string;latitude:number|null;longitude:number|null;altitudeFeet:number|null;groundSpeedKnots:number|null;phase:string};

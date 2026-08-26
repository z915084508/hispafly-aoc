export interface AmnExportAircraftRow { id:string; registration:string|null; aircraftType:string|null; seatCapacity:number|null; cargoCapacityKg:number|null; updatedAt:Date }
export interface AmnExportRouteRow { id:string; departureAirport:{iata:string|null}|null; arrivalAirport:{iata:string|null}|null; operationalStatus:string; updatedAt:Date }
export interface AmnExportFlightRow { id:string; flightNumber:string; operatingDate:Date; scheduledDeparture:Date; departureAirport:{iata:string|null}|null; arrivalAirport:{iata:string|null}|null; fleet:{type:string|null;code:string|null}|null; assignedAircraft:{registration:string|null;aircraftType:string|null}|null; updatedAt:Date }

export function buildAmnExport(input:{aircraft:AmnExportAircraftRow[];routes:AmnExportRouteRow[];flights:AmnExportFlightRow[];generatedAt:Date}) {
  const issues:Array<{entityType:string;externalId:string;code:string;message:string}> = [];
  const fleet=input.aircraft.flatMap(row=>{
    if(!row.registration||!row.aircraftType){issues.push({entityType:"FLEET",externalId:row.id,code:"IDENTITY_REQUIRED",message:"Aircraft registration and type are required."});return []}
    if(row.seatCapacity==null||row.cargoCapacityKg==null)issues.push({entityType:"FLEET",externalId:row.id,code:"CONFIGURATION_REQUIRED",message:`${row.registration} requires a complete AMN capacity configuration.`});
    return [{externalId:row.id,registration:row.registration,aircraftTypeCode:row.aircraftType,configuration:row.seatCapacity==null||row.cargoCapacityKg==null?null:{sellableSeats:row.seatCapacity,maximumCargoWeightKg:row.cargoCapacityKg}}];
  });
  const routes=input.routes.flatMap(row=>{
    const origin=row.departureAirport?.iata,destination=row.arrivalAirport?.iata;
    if(!origin||!destination){issues.push({entityType:"ROUTE",externalId:row.id,code:"AIRPORT_IATA_REQUIRED",message:"Route airports require IATA codes."});return []}
    return [{externalId:row.id,originIata:origin,destinationIata:destination,serviceType:"PASSENGER" as const}];
  });
  const flights=input.flights.flatMap(row=>{
    const origin=row.departureAirport?.iata,destination=row.arrivalAirport?.iata,type=row.assignedAircraft?.aircraftType??row.fleet?.type??row.fleet?.code;
    if(!origin||!destination||!type){issues.push({entityType:"FLIGHT",externalId:row.id,code:"OPERATIONAL_MAPPING_REQUIRED",message:"Flight requires IATA airports and an aircraft type."});return []}
    return [{externalId:row.id,flightNumber:row.flightNumber,operatingDate:row.operatingDate.toISOString().slice(0,10),originIata:origin,destinationIata:destination,scheduledDepartureUtc:row.scheduledDeparture.toISOString(),aircraftTypeCode:type,registration:row.assignedAircraft?.registration??null}];
  });
  const airports=[...new Set([...routes.flatMap(row=>[row.originIata,row.destinationIata]),...flights.flatMap(row=>[row.originIata,row.destinationIata])])].map(iata=>({iata}));
  const revisionDates=[...input.aircraft,...input.routes,...input.flights].map(row=>row.updatedAt.getTime());
  return {provider:"HISPAFLY_AOC" as const,sourceRevision:new Date(Math.max(input.generatedAt.getTime(),...revisionDates)).toISOString(),generatedAt:input.generatedAt.toISOString(),airports,fleet,routes,flights,issues,summary:{airports:airports.length,fleet:fleet.length,routes:routes.length,flights:flights.length,actionRequired:issues.length}};
}

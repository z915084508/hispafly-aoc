import { prisma } from "@/lib/prisma";
import { buildAmnExport } from "./export-contract";

export async function createAmnExport() {
  const now=new Date(),horizon=new Date(now.getTime()+90*86_400_000);
  const [aircraft,routes,flights]=await Promise.all([
    prisma.aircraft.findMany({where:{archivedAt:null,hiddenInPhoenix:false},select:{id:true,registration:true,aircraftType:true,seatCapacity:true,cargoCapacityKg:true,updatedAt:true}}),
    prisma.route.findMany({where:{archivedAt:null,active:true,operationalStatus:"ACTIVE"},select:{id:true,operationalStatus:true,updatedAt:true,departureAirport:{select:{iata:true}},arrivalAirport:{select:{iata:true}}}}),
    prisma.flight.findMany({where:{scheduledDeparture:{gte:now,lte:horizon},status:{in:["SCHEDULED","OPEN","BOOKED"]}},select:{id:true,flightNumber:true,operatingDate:true,scheduledDeparture:true,updatedAt:true,departureAirport:{select:{iata:true}},arrivalAirport:{select:{iata:true}},fleet:{select:{type:true,code:true}},assignedAircraft:{select:{registration:true,aircraftType:true}}},orderBy:{scheduledDeparture:"asc"},take:10000}),
  ]);
  return buildAmnExport({aircraft,routes,flights,generatedAt:now});
}

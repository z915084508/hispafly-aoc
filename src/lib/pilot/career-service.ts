import { prisma } from "@/lib/prisma";
import { effectivePilotRank, legacyAppointment, recognizedPilotRank } from "@/lib/pilot/career";

const rankNames = { TRN: "Trainee Pilot", FO: "First Officer", SFO: "Senior First Officer", CPT: "Captain", SCPT: "Senior Captain" } as const;

export async function syncPilotAutomaticRank(pilotId: string) {
  const [pilot, accepted, totalPireps] = await Promise.all([
    prisma.pilot.findUniqueOrThrow({ where: { id: pilotId }, select: { rank: true, rankName: true, rankAbbreviation: true, appointment: true } }),
    prisma.pirep.findMany({ where: { pilotId, status: "accepted" }, select: { flightTimeMinutes: true, blockTimeMinutes: true } }),
    prisma.pirep.count({ where: { pilotId } }),
  ]);
  const stats = { acceptedSectors: accepted.length, acceptedMinutes: accepted.reduce((sum, row) => sum + (row.flightTimeMinutes ?? row.blockTimeMinutes ?? 0), 0), totalPireps };
  const rank = effectivePilotRank(stats, pilot.rankAbbreviation, pilot.rankName, pilot.rank);
  const appointment = pilot.appointment ?? legacyAppointment(pilot.rankName, pilot.rank, pilot.rankAbbreviation);
  const current = recognizedPilotRank(pilot.rankAbbreviation, pilot.rankName, pilot.rank);
  if (current === rank && pilot.appointment === appointment) return { rank, changed: false };
  await prisma.pilot.update({ where: { id: pilotId }, data: { rank: rank, rankAbbreviation: rank, rankName: rankNames[rank], appointment } });
  return { rank, changed: true };
}

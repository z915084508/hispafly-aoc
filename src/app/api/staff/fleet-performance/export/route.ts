import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminStaff } from "@/lib/staff/requireAdmin";
import { createPerformanceCsv } from "@/lib/fleet-performance/csv";
import { groupAircraftByFleet } from "@/lib/fleet-performance/fleet";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminStaff();
    const aircraft = await prisma.aircraft.findMany({ include: { performanceProfile: true }, orderBy: [{ registration: "asc" }, { vamsysAircraftId: "asc" }] });
    const csv = createPerformanceCsv(groupAircraftByFleet(aircraft).map(({ fleetKey, members }) => {
      const item = members[0], profile = members.find((member) => member.performanceProfile)?.performanceProfile;
      return {
        fleetKey,
        fleetName: item.fleetName ?? item.fleetId ?? item.aircraftType,
        aircraftType: item.aircraftType,
        aircraftCount: members.length,
        seatCapacity: item.seatCapacity,
        cargoCapacityKg: item.cargoCapacityKg,
        operatingEmptyWeightKg: profile?.operatingEmptyWeightKg,
        maxZeroFuelWeightKg: profile?.maxZeroFuelWeightKg,
        maxTakeoffWeightKg: profile?.maxTakeoffWeightKg ?? item.mtowKg,
        maxLandingWeightKg: profile?.maxLandingWeightKg,
        maxFuelKg: profile?.maxFuelKg,
        maxPayloadKg: profile?.maxPayloadKg,
        defaultCostIndex: profile?.defaultCostIndex,
        fuelBiasPercent: profile?.fuelBiasPercent ?? 0,
        taxiFuelKg: profile?.taxiFuelKg,
        locked: profile?.locked ? "TRUE" : "FALSE",
        notes: profile?.notes,
      };
    }));
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="HISPAFLY-Aircraft-Performance-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
}

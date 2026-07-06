import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
};

function publicStatus(status: string | null, fallback: string | null) {
  return status?.trim() || fallback?.trim() || "Active";
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers });
}

export async function GET() {
  const aircraft = await prisma.aircraft.findMany({
    where: { publicVisible: true },
    orderBy: [{ publicDisplayOrder: "asc" }, { registration: "asc" }],
    select: {
      id: true,
      registration: true,
      aircraftType: true,
      fleetName: true,
      seatCapacity: true,
      cargoCapacityKg: true,
      publicDisplayName: true,
      publicDescription: true,
      publicImageUrl: true,
      publicBaseIcao: true,
      publicStatus: true,
      publicDisplayOrder: true,
      publicPublishedAt: true,
      status: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    {
      airline: "HISPAFLY",
      generatedAt: new Date().toISOString(),
      aircraft: aircraft.map((item) => ({
        id: item.id,
        registration: item.registration,
        type: item.aircraftType,
        fleet: item.fleetName,
        displayName: item.publicDisplayName ?? item.registration ?? item.aircraftType,
        description: item.publicDescription,
        imageUrl: item.publicImageUrl,
        baseIcao: item.publicBaseIcao,
        status: publicStatus(item.publicStatus, item.status),
        seats: item.seatCapacity,
        cargoCapacityKg: item.cargoCapacityKg,
        displayOrder: item.publicDisplayOrder,
        publishedAt: item.publicPublishedAt?.toISOString() ?? null,
        updatedAt: item.updatedAt.toISOString(),
      })),
    },
    { headers },
  );
}

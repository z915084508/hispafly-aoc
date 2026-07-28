"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { greatCircleDistanceNm, nativePirepScore } from "@/lib/acars/completion";
import { generateCompanyExpensesForPirep } from "@/lib/economy/companyExpenses";
import { calculateFuelCostSnapshot } from "@/lib/economy/fuel";
import { prisma } from "@/lib/prisma";
import { calculatePassengerRevenue } from "@/lib/revenue/passengerRevenue";
import { requireStaffPermission } from "@/lib/staff/authorization";

function finish(id: string, type: "success" | "error", message: string): never {
  revalidatePath(`/staff/pireps/${id}`);
  revalidatePath("/staff/pireps");
  revalidatePath("/staff/expenses");
  redirect(`/staff/pireps/${id}?${type}=${encodeURIComponent(message)}`);
}

async function authorize(id: string, action: string) {
  return requireStaffPermission("PIREP_SCORE", {
    entityType: "Pirep",
    entityId: id,
    attemptedAction: action,
  });
}

export async function refreshVamsysPirepDetail(id: string) {
  await authorize(id, "attempt disabled historical PIREP refresh");
  finish(id, "error", "External PIREP refresh is permanently disabled.");
}

export async function reprocessPirepEconomy(id: string) {
  let feedback: { type: "success" | "error"; message: string };

  try {
    const staff = await authorize(id, "reprocesar las métricas y la economía del PIREP");
    const pirep = await prisma.pirep.findFirst({
      where: { id, status: "accepted" },
      include: { acarsSession: true },
    });
    if (!pirep) throw new Error("PIREP aceptado no encontrado.");

    const nativeDispatch = pirep.acarsSession
      ? await prisma.flightDispatch.findUnique({
        where: { id: pirep.acarsSession.dispatchId },
        include: { flight: { include: { departureAirport: true, arrivalAirport: true } } },
      })
      : null;
    const nativeFlight = nativeDispatch?.flight;
    const flightDistanceNm = pirep.flightDistanceNm ?? (nativeFlight?.departureAirport && nativeFlight.arrivalAirport
      ? greatCircleDistanceNm(nativeFlight.departureAirport, nativeFlight.arrivalAirport)
      : null);
    const score = pirep.score ?? (pirep.dataOrigin === "HISPAFLY_NATIVE" ? nativePirepScore(pirep.landingRate) : null);
    const points = pirep.points ?? score;
    const passengerRevenueCents = pirep.passengers !== null && flightDistanceNm !== null
      ? calculatePassengerRevenue(pirep.passengers, flightDistanceNm).revenueCents
      : null;
    const fuel = await calculateFuelCostSnapshot({ departure: pirep.departure, fuelUsedKg: pirep.fuelUsed, at: pirep.flownAt ?? pirep.acceptedAt });
    await prisma.pirep.update({
      where: { id },
      data: { flightDistanceNm, score, points, passengerRevenueCents, ...fuel },
    });
    const expenses = await generateCompanyExpensesForPirep(id);
    await prisma.aocAuditLog.create({
      data: {
        staffUserId: staff.id,
        action: "PIREP_METRICS_ECONOMY_REPROCESSED",
        entityType: "Pirep",
        entityId: id,
        message: `${staff.name} reprocessed metrics and company economy for PIREP ${pirep.vamsysPirepId ?? pirep.id}.`,
        metadata: { flightDistanceNm, score, points, passengerRevenueCents, fuelCostCents: fuel.fuelCostCents, expensesGenerated: expenses.generated, expenseTotalCents: expenses.totalCents },
      },
    });
    feedback = { type: "success", message: "Métricas y economía recalculadas con las reglas actuales." };
  } catch (error) {
    feedback = { type: "error", message: error instanceof Error ? error.message : "No se pudo reprocesar el PIREP." };
  }

  finish(id, feedback.type, feedback.message);
}

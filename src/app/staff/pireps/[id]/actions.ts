"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  try {
    const staff = await authorize(id, "reprocesar la economía del PIREP");
    const pirep = await prisma.pirep.findFirst({ where: { id, status: "accepted" } });
    if (!pirep) throw new Error("PIREP aceptado no encontrado.");

    const passengerRevenueCents = pirep.passengers !== null && pirep.flightDistanceNm !== null
      ? calculatePassengerRevenue(pirep.passengers, pirep.flightDistanceNm).revenueCents
      : null;
    const fuel = await calculateFuelCostSnapshot({ departure: pirep.departure, fuelUsedKg: pirep.fuelUsed, at: pirep.flownAt ?? pirep.acceptedAt });
    await prisma.pirep.update({ where: { id }, data: { passengerRevenueCents, ...fuel } });
    const expenses = await generateCompanyExpensesForPirep(id);
    await prisma.aocAuditLog.create({
      data: {
        staffUserId: staff.id,
        action: "PIREP_ECONOMY_REPROCESSED",
        entityType: "Pirep",
        entityId: id,
        message: `${staff.name} reprocessed company economy for PIREP ${pirep.vamsysPirepId}.`,
        metadata: { passengerRevenueCents, fuelCostCents: fuel.fuelCostCents, expensesGenerated: expenses.generated, expenseTotalCents: expenses.totalCents },
      },
    });
    finish(id, "success", "Economía reprocesada con las reglas actuales.");
  } catch (error) {
    finish(id, "error", error instanceof Error ? error.message : "No se pudo reprocesar la economía.");
  }
}

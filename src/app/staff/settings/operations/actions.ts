"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { backfillCompanyEconomy } from "@/lib/economy/backfill";
import { IATA_JET_FUEL_PRICE_SOURCE, IATA_JET_FUEL_PRICE_URL, FUEL_REGIONS } from "@/lib/economy/fuel";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { syncOperationsFleetData } from "@/lib/vamsys/fleetSync";

const readableError = (error: unknown) => error instanceof Error ? error.message : "No se pudo completar la acción.";
const COMPANY_ECONOMY_BACKFILL_BATCH_SIZE = 50;

export async function syncFleetDataAction() {
  let feedback: { type: "success" | "error"; message: string };
  try {
    const staff = await requireStaffPermission("VAMSYS_PIREP_SYNC", { entityType: "Aircraft", entityId: "fleet", attemptedAction: "sync vAMSYS fleet, aircraft and airports" });
    const result = await syncOperationsFleetData(staff.id);
    const totalAircraft = result.aircraftImported + result.aircraftUpdated;
    const totalFleets = result.fleetsImported + result.fleetsUpdated;
    const totalAirports = result.airportsImported + result.airportsUpdated;
    const suffix = result.errors.length ? ` Avisos: ${result.errors.slice(0, 2).join(" | ")}` : "";
    feedback = { type: result.errors.length ? "error" : "success", message: `Operations sync: ${totalFleets} flotas, ${totalAircraft} aeronaves y ${totalAirports} aeropuertos procesados.${suffix}` };
  } catch (error) {
    feedback = { type: "error", message: readableError(error) };
  }
  revalidatePath("/staff/settings/operations");
  revalidatePath("/staff/audit");
  redirect(`/staff/settings/operations?${feedback.type}=${encodeURIComponent(feedback.message)}`);
}

export async function backfillCompanyEconomyAction() {
  let feedback: { type: "success" | "error"; message: string };
  try {
    const staff = await requireStaffPermission("VAMSYS_PIREP_SYNC", { entityType: "CompanyExpense", entityId: "backfill", attemptedAction: "backfill company economy data" });
    const result = await backfillCompanyEconomy(staff.id, COMPANY_ECONOMY_BACKFILL_BATCH_SIZE);
    const suffix = result.errors.length ? ` Avisos: ${result.errors.slice(0, 2).join(" | ")}` : "";
    feedback = { type: result.errors.length ? "error" : "success", message: `Backfill por lote: ${result.scanned} PIREPs revisados, ${result.fuelUpdated} fuel snapshots y ${result.expensesGenerated} gastos generados/recalculados.${suffix}` };
  } catch (error) {
    feedback = { type: "error", message: readableError(error) };
  }
  revalidatePath("/staff/settings/operations");
  revalidatePath("/staff/wallet");
  revalidatePath("/staff/expenses");
  revalidatePath("/staff/audit");
  redirect(`/staff/settings/operations?${feedback.type}=${encodeURIComponent(feedback.message)}`);
}

export async function saveFuelPriceAction(formData: FormData) {
  let feedback: { type: "success" | "error"; message: string };
  try {
    const staff = await requireStaffPermission("VAMSYS_PIREP_SYNC", { entityType: "FuelPrice", entityId: "iata", attemptedAction: "update IATA fuel price reference" });
    const region = String(formData.get("region") ?? "GLOBAL").toUpperCase();
    const priceText = String(formData.get("pricePerKg") ?? "").replace(",", ".").trim();
    const pricePerKg = Number(priceText);

    if (!FUEL_REGIONS.includes(region as (typeof FUEL_REGIONS)[number])) throw new Error("Región de combustible no válida.");
    if (!Number.isFinite(pricePerKg) || pricePerKg <= 0) throw new Error("Introduce un precio por kg válido.");

    const pricePerKgCents = Math.round(pricePerKg * 100);
    await prisma.fuelPrice.create({
      data: {
        region,
        pricePerKgCents,
        source: IATA_JET_FUEL_PRICE_SOURCE,
        sourceUrl: IATA_JET_FUEL_PRICE_URL,
        effectiveFrom: new Date(),
        manuallyMaintained: true,
      },
    });
    await prisma.aocAuditLog.create({
      data: {
        staffUserId: staff.id,
        action: "FUEL_PRICE_UPDATED",
        entityType: "FuelPrice",
        message: `${staff.name} updated ${region} fuel price reference from IATA Jet Fuel Price Monitor.`,
        metadata: { region, pricePerKgCents, source: IATA_JET_FUEL_PRICE_SOURCE },
      },
    });
    feedback = { type: "success", message: `Precio ${region} actualizado a ${pricePerKg.toFixed(3)} €/kg.` };
  } catch (error) {
    feedback = { type: "error", message: readableError(error) };
  }
  revalidatePath("/staff/settings/operations");
  revalidatePath("/staff/audit");
  redirect(`/staff/settings/operations?${feedback.type}=${encodeURIComponent(feedback.message)}`);
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";

const clean = (value: FormDataEntryValue | null) => String(value ?? "").trim();
const upper = (value: FormDataEntryValue | null) => clean(value).toUpperCase();

function numberOrNull(value: FormDataEntryValue | null) {
  const text = clean(value).replace(",", ".");
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) throw new Error("Introduce un número válido.");
  return parsed;
}

function intOrNull(value: FormDataEntryValue | null) {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.round(parsed);
}

function euroToCents(value: FormDataEntryValue | null) {
  const parsed = numberOrNull(value);
  return parsed === null ? 0 : Math.round(parsed * 100);
}

function redirectWith(type: "success" | "error", message: string) {
  redirect(`/staff/expenses/rules?${type}=${encodeURIComponent(message)}`);
}

async function authorize(attemptedAction: string, entityType: string, entityId?: string) {
  return requireStaffPermission("VAMSYS_PIREP_SYNC", { entityType, entityId, attemptedAction });
}

export async function saveAirportChargeProfileAction(formData: FormData) {
  try {
    const airportIcao = upper(formData.get("airportIcao"));
    if (!/^[A-Z0-9]{4}$/.test(airportIcao)) throw new Error("Introduce un ICAO válido de 4 caracteres.");
    const staff = await authorize(`guardar reglas económicas del aeropuerto ${airportIcao}`, "AirportChargeProfile", airportIcao);

    await prisma.airportChargeProfile.upsert({
      where: { airportIcao },
      update: {
        airportCategory: clean(formData.get("airportCategory")) || "standard",
        landingRatePerTonneCents: euroToCents(formData.get("landingRatePerTonne")),
        passengerFeeCents: euroToCents(formData.get("passengerFee")),
        passengerServiceFeeCents: euroToCents(formData.get("passengerServiceFee")),
        parkingRatePerHourCents: euroToCents(formData.get("parkingRatePerHour")),
        terminalAtcUnitRateCents: euroToCents(formData.get("terminalAtcUnitRate")),
        currency: "EUR",
      },
      create: {
        airportIcao,
        airportCategory: clean(formData.get("airportCategory")) || "standard",
        landingRatePerTonneCents: euroToCents(formData.get("landingRatePerTonne")),
        passengerFeeCents: euroToCents(formData.get("passengerFee")),
        passengerServiceFeeCents: euroToCents(formData.get("passengerServiceFee")),
        parkingRatePerHourCents: euroToCents(formData.get("parkingRatePerHour")),
        terminalAtcUnitRateCents: euroToCents(formData.get("terminalAtcUnitRate")),
        currency: "EUR",
      },
    });
    await prisma.aocAuditLog.create({ data: { staffUserId: staff.id, action: "AIRPORT_CHARGE_PROFILE_SAVED", entityType: "AirportChargeProfile", entityId: airportIcao, message: `${staff.name} updated airport charge rules for ${airportIcao}.`, metadata: { airportIcao } } });
    revalidatePath("/staff/expenses/rules");
    revalidatePath("/staff/expenses");
    redirectWith("success", `Reglas de ${airportIcao} guardadas.`);
  } catch (error) {
    redirectWith("error", error instanceof Error ? error.message : "No se pudieron guardar las reglas del aeropuerto.");
  }
}

export async function saveAirspaceChargeProfileAction(formData: FormData) {
  try {
    const region = upper(formData.get("region"));
    if (!region) throw new Error("Introduce una región.");
    const staff = await authorize(`guardar regla ATC de región ${region}`, "AirspaceChargeProfile", region);
    await prisma.airspaceChargeProfile.upsert({
      where: { region },
      update: { unitRateCents: euroToCents(formData.get("unitRate")), currency: "EUR" },
      create: { region, unitRateCents: euroToCents(formData.get("unitRate")), currency: "EUR" },
    });
    await prisma.aocAuditLog.create({ data: { staffUserId: staff.id, action: "AIRSPACE_CHARGE_PROFILE_SAVED", entityType: "AirspaceChargeProfile", entityId: region, message: `${staff.name} updated ATC airspace rules for ${region}.`, metadata: { region } } });
    revalidatePath("/staff/expenses/rules");
    revalidatePath("/staff/expenses");
    redirectWith("success", `Regla ATC ${region} guardada.`);
  } catch (error) {
    redirectWith("error", error instanceof Error ? error.message : "No se pudo guardar la regla ATC.");
  }
}

export async function saveAircraftProfileAction(formData: FormData) {
  try {
    const aircraftType = upper(formData.get("aircraftType"));
    if (!aircraftType) throw new Error("Introduce el tipo ICAO de aeronave.");
    const staff = await authorize(`guardar fallback de aeronave ${aircraftType}`, "AircraftProfile", aircraftType);
    await prisma.aircraftProfile.upsert({
      where: { aircraftType },
      update: {
        seatCapacity: intOrNull(formData.get("seatCapacity")),
        cargoCapacityKg: intOrNull(formData.get("cargoCapacityKg")),
        mtowKg: intOrNull(formData.get("mtowKg")),
        source: "aoc_staff_rule",
      },
      create: {
        aircraftType,
        seatCapacity: intOrNull(formData.get("seatCapacity")),
        cargoCapacityKg: intOrNull(formData.get("cargoCapacityKg")),
        mtowKg: intOrNull(formData.get("mtowKg")),
        source: "aoc_staff_rule",
      },
    });
    await prisma.aocAuditLog.create({ data: { staffUserId: staff.id, action: "AIRCRAFT_PROFILE_SAVED", entityType: "AircraftProfile", entityId: aircraftType, message: `${staff.name} updated aircraft fallback profile for ${aircraftType}.`, metadata: { aircraftType } } });
    revalidatePath("/staff/expenses/rules");
    redirectWith("success", `Fallback ${aircraftType} guardado.`);
  } catch (error) {
    redirectWith("error", error instanceof Error ? error.message : "No se pudo guardar el fallback de aeronave.");
  }
}

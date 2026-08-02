import { calculateDispatchPayload, suggestedLoadFactor } from "../dispatch/loadFactor.ts";

export type ResolvedDispatchLoad = {
  passengers: number;
  loadFactorPercent: number | null;
  baggageKgPerPassenger: number | null;
  luggageKg: number | null;
  generated: boolean;
};

export function resolveSimbriefDispatchLoad(input: {
  passengers: number | null | undefined;
  loadFactorPercent: number | null | undefined;
  baggageKgPerPassenger: number | null | undefined;
  luggageKg: number | null | undefined;
  seatCapacity: number | null | undefined;
  departureIcao: string;
  arrivalIcao: string;
  departureAt: Date;
}): ResolvedDispatchLoad {
  if (input.passengers !== null && input.passengers !== undefined) {
    return {
      passengers: input.passengers,
      loadFactorPercent: input.loadFactorPercent ?? null,
      baggageKgPerPassenger: input.baggageKgPerPassenger ?? null,
      luggageKg: input.luggageKg ?? null,
      generated: false,
    };
  }

  if (!Number.isFinite(input.seatCapacity) || (input.seatCapacity ?? 0) <= 0) {
    throw new Error("Aircraft seat capacity is required to calculate the passenger load.");
  }

  const loadFactorPercent = input.loadFactorPercent ?? suggestedLoadFactor({
    departure: input.departureIcao,
    arrival: input.arrivalIcao,
    departureAt: input.departureAt,
  });
  const payload = calculateDispatchPayload({
    seats: input.seatCapacity as number,
    loadFactorPercent,
    baggageKgPerPassenger: input.baggageKgPerPassenger ?? undefined,
  });

  return {
    passengers: payload.passengers,
    loadFactorPercent,
    baggageKgPerPassenger: payload.baggageKgPerPassenger,
    luggageKg: payload.luggageKg,
    generated: true,
  };
}

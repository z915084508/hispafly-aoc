import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StaffIdentity } from "@/lib/staff/currentStaff";
import { periodsOverlap, validateDuration, validateEffectivePeriod } from "./management-rules";
import {
  buildRoutePairCode,
  classifyRouteMarket,
  estimateBlockMinutes,
  greatCircleDistanceNm,
  nextRouteIdentities,
  routeMarketLabel,
} from "./route-automation";

const actorId = (actor: StaffIdentity) => actor.id === "development-staff" ? null : actor.id;

type AutomaticRouteInput = {
  departureAirportId: string;
  arrivalAirportId: string;
  defaultFleetId?: string | null;
  durationMinutes?: number | null;
  cruiseAltitude?: number | null;
  route?: string | null;
  returnRoute?: string | null;
  networkPolicy?: string | null;
  effectiveFrom?: Date | null;
  effectiveUntil?: Date | null;
  internalNotes?: string | null;
  createReturnRoute?: boolean;
  overrideConflicts?: boolean;
  overrideReason?: string;
};

type AirportReference = {
  id: string;
  icao: string;
  iata: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
};

type FleetReference = {
  id: string;
  code: string | null;
  name: string | null;
  cruiseSpeedKts: number | null;
  operationalStatus: string;
};

async function loadReferences(tx: Prisma.TransactionClient, input: AutomaticRouteInput) {
  if (!input.departureAirportId || !input.arrivalAirportId) throw new Error("Choose both airports.");
  if (input.departureAirportId === input.arrivalAirportId) throw new Error("Departure and arrival airports must differ.");
  validateEffectivePeriod(input.effectiveFrom, input.effectiveUntil);

  const [departure, arrival, fleet] = await Promise.all([
    tx.airport.findUnique({ where: { id: input.departureAirportId }, select: {
      id: true, icao: true, iata: true, country: true, latitude: true, longitude: true, status: true,
    } }),
    tx.airport.findUnique({ where: { id: input.arrivalAirportId }, select: {
      id: true, icao: true, iata: true, country: true, latitude: true, longitude: true, status: true,
    } }),
    input.defaultFleetId ? tx.fleet.findUnique({ where: { id: input.defaultFleetId }, select: {
      id: true, code: true, name: true, cruiseSpeedKts: true, operationalStatus: true,
    } }) : null,
  ]);

  if (!departure || !arrival) throw new Error("Route airports do not exist.");
  if (departure.status !== "ACTIVE" || arrival.status !== "ACTIVE") throw new Error("Both airports must be active.");
  if (input.defaultFleetId && (!fleet || fleet.operationalStatus !== "ACTIVE")) throw new Error("Default fleet must be active.");
  return { departure: departure as AirportReference, arrival: arrival as AirportReference, fleet: fleet as FleetReference | null };
}

function planningDefaults(refs: Awaited<ReturnType<typeof loadReferences>>, requestedDuration?: number | null) {
  const coordinatesAvailable = refs.departure.latitude !== null && refs.departure.longitude !== null
    && refs.arrival.latitude !== null && refs.arrival.longitude !== null;
  if (coordinatesAvailable) {
    const distanceNm = greatCircleDistanceNm(
      { latitude: refs.departure.latitude as number, longitude: refs.departure.longitude as number },
      { latitude: refs.arrival.latitude as number, longitude: refs.arrival.longitude as number },
    );
    const durationMinutes = estimateBlockMinutes(distanceNm, refs.fleet?.cruiseSpeedKts ?? 430);
    return { distanceNm, durationMinutes, source: refs.fleet?.cruiseSpeedKts ? "AIRPORT_DISTANCE_AND_FLEET" : "AIRPORT_DISTANCE" } as const;
  }

  const durationMinutes = validateDuration(requestedDuration);
  if (!durationMinutes) throw new Error("Airport coordinates are missing. Enter an estimated duration manually or update the Airport records.");
  return { distanceNm: null, durationMinutes, source: "MANUAL_DURATION" } as const;
}

async function findConflicts(
  tx: Prisma.TransactionClient,
  departureAirportId: string,
  arrivalAirportId: string,
  routeCode: string,
  effectiveFrom?: Date | null,
  effectiveUntil?: Date | null,
) {
  const candidates = await tx.route.findMany({
    where: {
      operationalStatus: { not: "ARCHIVED" },
      OR: [
        { routeCode },
        { departureAirportId, arrivalAirportId },
      ],
    },
    select: { id: true, routeCode: true, flightNumber: true, effectiveFrom: true, effectiveUntil: true },
  });
  return candidates
    .filter((candidate) => periodsOverlap(effectiveFrom, effectiveUntil, candidate.effectiveFrom, candidate.effectiveUntil))
    .map((candidate) => candidate.routeCode ?? candidate.flightNumber ?? candidate.id);
}

function assertConflicts(conflicts: string[], input: AutomaticRouteInput, direction: string) {
  if (!conflicts.length) return;
  if (!input.overrideConflicts) throw new Error(`A ${direction} route already overlaps this airport pair or route code: ${conflicts.join(", ")}.`);
  if (!input.overrideReason?.trim()) throw new Error("A reason is required to override route conflict warnings.");
}

async function usedIdentities(tx: Prisma.TransactionClient) {
  const [routes, reservations] = await Promise.all([
    tx.route.findMany({ select: { flightNumber: true, callsign: true } }),
    tx.routeIdentityReservation.findMany({ select: { flightNumber: true, callsign: true } }),
  ]);
  return [...routes, ...reservations];
}

function routeData(input: AutomaticRouteInput, refs: Awaited<ReturnType<typeof loadReferences>>, options: {
  departure: AirportReference;
  arrival: AirportReference;
  routeCode: string;
  flightNumber: string;
  callsign: string;
  routeString?: string | null;
  durationMinutes: number;
  marketLabel: string;
}) {
  return {
    routeCode: options.routeCode,
    flightNumber: options.flightNumber,
    callsign: options.callsign,
    departure: options.departure.icao,
    arrival: options.arrival.icao,
    departureAirportId: options.departure.id,
    arrivalAirportId: options.arrival.id,
    defaultFleetId: refs.fleet?.id ?? null,
    scheduledDurationMinutes: options.durationMinutes,
    cruiseAltitude: input.cruiseAltitude ?? null,
    route: options.routeString?.trim().toUpperCase() || null,
    networkPolicy: input.networkPolicy?.trim() || options.marketLabel,
    effectiveFrom: input.effectiveFrom ?? null,
    effectiveUntil: input.effectiveUntil ?? null,
    internalNotes: input.internalNotes?.trim() || null,
    operationalStatus: "DRAFT" as const,
    syncStatus: "LOCAL_DRAFT" as const,
    active: true,
    dataOrigin: "HISPAFLY_NATIVE" as const,
  };
}

async function createInTransaction(tx: Prisma.TransactionClient, input: AutomaticRouteInput, actor: StaffIdentity) {
  const refs = await loadReferences(tx, input);
  const marketType = classifyRouteMarket(refs.departure, refs.arrival);
  const marketLabel = routeMarketLabel(marketType);
  const planning = planningDefaults(refs, input.durationMinutes);
  const outboundCode = buildRoutePairCode(refs.departure, refs.arrival);
  const returnCode = buildRoutePairCode(refs.arrival, refs.departure);
  const identities = nextRouteIdentities(marketType, await usedIdentities(tx), Boolean(input.createReturnRoute));

  const outboundConflicts = await findConflicts(
    tx, refs.departure.id, refs.arrival.id, outboundCode, input.effectiveFrom, input.effectiveUntil,
  );
  assertConflicts(outboundConflicts, input, "departure");

  if (input.createReturnRoute) {
    const returnConflicts = await findConflicts(
      tx, refs.arrival.id, refs.departure.id, returnCode, input.effectiveFrom, input.effectiveUntil,
    );
    assertConflicts(returnConflicts, input, "return");
  }

  const outbound = await tx.route.create({ data: routeData(input, refs, {
    departure: refs.departure,
    arrival: refs.arrival,
    routeCode: outboundCode,
    flightNumber: identities.outbound.flightNumber,
    callsign: identities.outbound.callsign,
    routeString: input.route,
    durationMinutes: planning.durationMinutes,
    marketLabel,
  }) });
  await tx.routeIdentityReservation.create({ data: {
    routeId: outbound.id,
    flightNumber: identities.outbound.flightNumber,
    callsign: identities.outbound.callsign,
  } });

  let returnRoute: typeof outbound | null = null;
  if (input.createReturnRoute && identities.return) {
    returnRoute = await tx.route.create({ data: routeData(input, refs, {
      departure: refs.arrival,
      arrival: refs.departure,
      routeCode: returnCode,
      flightNumber: identities.return.flightNumber,
      callsign: identities.return.callsign,
      routeString: input.returnRoute,
      durationMinutes: planning.durationMinutes,
      marketLabel,
    }) });
    await tx.routeIdentityReservation.create({ data: {
      routeId: returnRoute.id,
      flightNumber: identities.return.flightNumber,
      callsign: identities.return.callsign,
    } });
  }

  await tx.aocAuditLog.create({ data: {
    staffUserId: actorId(actor),
    action: input.createReturnRoute ? "ROUTE_PAIR_CREATED" : "ROUTE_CREATED",
    entityType: "Route",
    entityId: outbound.id,
    message: input.createReturnRoute
      ? `${actor.name} created automatic route pair ${outbound.routeCode} / ${returnRoute?.routeCode}.`
      : `${actor.name} created automatic route ${outbound.routeCode}.`,
    metadata: {
      marketType,
      marketLabel,
      planning,
      outboundRouteId: outbound.id,
      returnRouteId: returnRoute?.id ?? null,
      outboundIdentity: identities.outbound,
      returnIdentity: identities.return,
      overrideReason: input.overrideReason?.trim() || null,
    },
  } });

  return { outbound, returnRoute, marketType, marketLabel, planning };
}

function retryableTransactionError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  return code === "P2002" || code === "P2034";
}

export async function createAutomaticNativeRoutes(input: AutomaticRouteInput, actor: StaffIdentity) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        (tx) => createInTransaction(tx, input, actor),
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      lastError = error;
      if (!retryableTransactionError(error) || attempt === 2) throw error;
    }
  }
  throw lastError;
}

export async function previewAutomaticNativeRoute(input: Pick<AutomaticRouteInput,
  "departureAirportId" | "arrivalAirportId" | "defaultFleetId" | "durationMinutes" | "createReturnRoute"
>) {
  return prisma.$transaction(async (tx) => {
    const refs = await loadReferences(tx, input);
    const marketType = classifyRouteMarket(refs.departure, refs.arrival);
    const identities = nextRouteIdentities(marketType, await usedIdentities(tx), Boolean(input.createReturnRoute));
    const planning = planningDefaults(refs, input.durationMinutes);
    return {
      marketType,
      marketLabel: routeMarketLabel(marketType),
      outboundRouteCode: buildRoutePairCode(refs.departure, refs.arrival),
      returnRouteCode: input.createReturnRoute ? buildRoutePairCode(refs.arrival, refs.departure) : null,
      outbound: identities.outbound,
      return: identities.return,
      distanceNm: planning.distanceNm,
      durationMinutes: planning.durationMinutes,
      durationSource: planning.source,
    };
  });
}

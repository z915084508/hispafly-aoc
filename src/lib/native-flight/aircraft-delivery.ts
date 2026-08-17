export type DeliveryPostOperationMode = "FREE" | "SCHEDULED" | "FLEX";

export type AircraftDeliveryMetadata = {
  active: boolean;
  originIcao: string;
  destinationIcao: string;
  postDeliveryOperationMode: DeliveryPostOperationMode;
  completedAt?: string | null;
};

export const AIRCRAFT_DELIVERY_METADATA_KEY = "hispaflyDelivery";
export const DELIVERY_POST_OPERATION_MODES = new Set<DeliveryPostOperationMode>(["FREE", "SCHEDULED", "FLEX"]);

const asObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const normalizeIcao = (value: unknown) => typeof value === "string" ? value.trim().toUpperCase() : "";

export function readAircraftDelivery(rawData: unknown): AircraftDeliveryMetadata | null {
  const root = asObject(rawData);
  const raw = root ? asObject(root[AIRCRAFT_DELIVERY_METADATA_KEY]) : null;
  if (!raw) return null;
  const originIcao = normalizeIcao(raw.originIcao);
  const destinationIcao = normalizeIcao(raw.destinationIcao);
  const postDeliveryOperationMode = typeof raw.postDeliveryOperationMode === "string" ? raw.postDeliveryOperationMode.toUpperCase() : "";
  if (!/^[A-Z0-9]{4}$/.test(originIcao) || !/^[A-Z0-9]{4}$/.test(destinationIcao) || !DELIVERY_POST_OPERATION_MODES.has(postDeliveryOperationMode as DeliveryPostOperationMode)) return null;
  return {
    active: raw.active === true,
    originIcao,
    destinationIcao,
    postDeliveryOperationMode: postDeliveryOperationMode as DeliveryPostOperationMode,
    completedAt: typeof raw.completedAt === "string" ? raw.completedAt : null,
  };
}

export function normalizeAircraftDelivery(input: {
  active: boolean;
  originIcao?: string | null;
  destinationIcao?: string | null;
  postDeliveryOperationMode?: string | null;
}): AircraftDeliveryMetadata | null {
  if (!input.active) return null;
  const originIcao = normalizeIcao(input.originIcao);
  const destinationIcao = normalizeIcao(input.destinationIcao);
  const postDeliveryOperationMode = (input.postDeliveryOperationMode ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(originIcao)) throw new Error("Delivery airport must be a valid four-character ICAO code.");
  if (!/^[A-Z0-9]{4}$/.test(destinationIcao)) throw new Error("Delivery destination must be a valid four-character ICAO code.");
  if (originIcao === destinationIcao) throw new Error("Delivery airport and destination must be different.");
  if (!DELIVERY_POST_OPERATION_MODES.has(postDeliveryOperationMode as DeliveryPostOperationMode)) throw new Error("Select the operation mode the aircraft will use after delivery.");
  return { active: true, originIcao, destinationIcao, postDeliveryOperationMode: postDeliveryOperationMode as DeliveryPostOperationMode, completedAt: null };
}

export function writeAircraftDelivery(rawData: unknown, delivery: AircraftDeliveryMetadata): Record<string, unknown> {
  return { ...(asObject(rawData) ?? {}), [AIRCRAFT_DELIVERY_METADATA_KEY]: delivery };
}

export function aircraftIsInDelivery(rawData: unknown) {
  return readAircraftDelivery(rawData)?.active === true;
}

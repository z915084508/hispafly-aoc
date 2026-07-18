import { AocDataOrigin } from "@prisma/client";

export class NativeWriteGateError extends Error {
  readonly code = "NATIVE_IDENTITY_REQUIRED";
  constructor(entity: string, detail?: string) {
    super(`${entity} requires complete HispaFly Native identity.${detail ? ` ${detail}` : ""}`);
  }
}

export function assertNativeOrigin(entity: string, origin: AocDataOrigin | string | null | undefined) {
  if (!origin || origin === AocDataOrigin.VAMSYS_LEGACY) {
    throw new NativeWriteGateError(entity, "Legacy-only identity is read-only.");
  }
}

export function assertNativeIds(entity: string, ids: Record<string, string | null | undefined>) {
  const missing = Object.entries(ids).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new NativeWriteGateError(entity, `Missing internal ID(s): ${missing.join(", ")}.`);
}

export function assertNoLegacyOnlyIdentity(entity: string, input: Record<string, unknown>) {
  const nativeIds = Object.entries(input).filter(([key, value]) => key.endsWith("Id") && !key.startsWith("vamsys") && typeof value === "string" && value);
  const legacyIds = Object.entries(input).filter(([key, value]) => key.startsWith("vamsys") && key.endsWith("Id") && typeof value === "string" && value);
  if (legacyIds.length && !nativeIds.length) throw new NativeWriteGateError(entity, "A vAMSYS reference cannot identify a new operational record.");
}

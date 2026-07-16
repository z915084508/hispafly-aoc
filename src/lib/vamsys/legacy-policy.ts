export const VAMSYS_DISCONNECTED_AT = "2026-07-16";
export const VAMSYS_LEGACY_MODE = true;
export const VAMSYS_LEGACY_MESSAGE = "vAMSYS is disconnected and retained only as a historical data source. No automatic reconnect or production request will be attempted.";

export type LegacyDependencyDisposition = "DISABLE_NOW" | "HISTORICAL_READ_ONLY" | "REPLACE_IN_TASK_5" | "REMOVE_LATER";
export type AocDataOrigin = "HISPAFLY_NATIVE" | "VAMSYS_LEGACY" | "IMPORTED" | "MANUAL";

export class VamsysDisconnectedError extends Error {
  readonly code = "VAMSYS_LEGACY_DISCONNECTED";

  constructor(operation = "vAMSYS operation") {
    super(`${operation} is disabled. ${VAMSYS_LEGACY_MESSAGE}`);
    this.name = "VamsysDisconnectedError";
  }
}

export function assertVamsysNetworkDisabled(operation?: string): void {
  throw new VamsysDisconnectedError(operation);
}

export function disabledVamsysResponse() {
  return Response.json({ok:true,disabled:true,status:"VAMSYS_LEGACY",message:VAMSYS_LEGACY_MESSAGE},{status:200,headers:{"Cache-Control":"no-store"}});
}

export class SimBriefApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly reconnectRequired: boolean;

  constructor(
    message: string,
    status: number,
    code?: string,
    reconnectRequired = false,
  ) {
    super(message);
    this.name = "SimBriefApiError";
    this.status = status;
    this.code = code;
    this.reconnectRequired = reconnectRequired;
  }
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseSimBriefError(status: number, payload: unknown): SimBriefApiError {
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const nested = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : {};
  const code = text(body.code) || text(body.error) || text(nested.code);
  const upstream = text(body.message) || text(body.error_description) || text(body.detail) || text(nested.message);
  const fallback = status === 400
    ? "SimBrief rejected the request. Check the flight plan inputs."
    : status === 401
      ? "Your Navigraph authorization is no longer valid. Reconnect Navigraph / SimBrief."
      : status >= 500
        ? "SimBrief is temporarily unavailable. Please try again later."
        : `SimBrief request failed with status ${status}.`;
  return new SimBriefApiError(upstream || fallback, status, code, status === 401);
}

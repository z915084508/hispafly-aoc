import crypto from "node:crypto";
import { processAcceptedOperationsPirep } from "@/lib/vamsys/operationsPireps";
import { writeAuditLogSafely } from "@/lib/audit/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function timingSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthorized(rawBody: string, signature: string | null) {
  const secret = process.env.VAMSYS_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const normalized = signature.replace(/^sha256=/i, "").trim();
  return timingSafeEqual(expected, normalized);
}

function extractPirepId(payload: JsonRecord) {
  const data = record(payload.data) ?? payload;
  const attributes = record(data.attributes);
  const candidates = [
    data.id,
    data.pirep_id,
    data.pirepId,
    attributes?.id,
    attributes?.pirep_id,
    attributes?.pirepId,
  ];
  for (const candidate of candidates) {
    const id = stringValue(candidate);
    if (id) return id;
  }
  return null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-vamsys-signature");
  if (!isAuthorized(rawBody, signature)) {
    await writeAuditLogSafely({
      action: "VAMSYS_WEBHOOK_REJECTED",
      entityType: "Pirep",
      message: "Rejected vAMSYS webhook because the signature was missing or invalid.",
    });
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const payload = record(parsed);
  if (!payload) return Response.json({ ok: false, error: "invalid_payload" }, { status: 400 });

  const event = stringValue(payload.event) ?? "unknown";
  const pirepId = extractPirepId(payload);
  if (!pirepId) {
    await writeAuditLogSafely({
      action: "VAMSYS_WEBHOOK_IGNORED",
      entityType: "Pirep",
      message: `Ignored vAMSYS webhook ${event} because no PIREP id was present.`,
      metadata: { event },
    });
    return Response.json({ ok: true, skipped: true, reason: "missing_pirep_id" });
  }

  try {
    const result = await processAcceptedOperationsPirep(pirepId);
    await writeAuditLogSafely({
      action: "VAMSYS_WEBHOOK_PIREP_PROCESSED",
      entityType: "Pirep",
      entityId: pirepId,
      message: `Processed vAMSYS webhook ${event} for PIREP ${pirepId}.`,
      metadata: {
        event,
        imported: result.importedCount,
        updated: result.updatedCount,
        payrollGenerated: result.payrollGeneratedCount,
        expensesGenerated: result.expensesGeneratedCount,
        walletTransactions: result.walletTransactionsCount,
        errors: result.errors.length,
      },
    });
    return Response.json({ ok: result.errors.length === 0, event, pirepId, result }, { status: result.errors.length ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook processing error.";
    await writeAuditLogSafely({
      action: "VAMSYS_WEBHOOK_PIREP_FAILED",
      entityType: "Pirep",
      entityId: pirepId,
      message: `Failed to process vAMSYS webhook ${event} for PIREP ${pirepId}: ${message}`,
      metadata: { event, error: message.slice(0, 180) },
    });
    return Response.json({ ok: false, event, pirepId, error: message }, { status: 500 });
  }
}

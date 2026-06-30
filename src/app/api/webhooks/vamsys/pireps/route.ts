import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { processAcceptedOperationsPirep } from "@/lib/vamsys/operationsPireps";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WebhookPayload = {
  event?: string;
  event_id?: string;
  timestamp?: string;
  airline_id?: string | number;
  data?: unknown;
};

function timingSafeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifySignature(rawBody: string, signature: string | null) {
  const secret = process.env.VAMSYS_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("VAMSYS_WEBHOOK_SECRET is not configured.");
  if (!signature) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const normalized = signature.trim().replace(/^sha256=/i, "");
  return timingSafeEqual(digest, normalized);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" || typeof candidate === "number") return String(candidate);
  }
  return null;
}

function extractPirepId(payload: WebhookPayload) {
  const data = record(payload.data);
  if (!data) return null;
  const attributes = record(data.attributes);
  return text(data, "id", "pirep_id", "pirepId", "uuid") ?? (attributes ? text(attributes, "id", "pirep_id", "pirepId", "uuid") : null);
}

function isPirepEvent(event: string | undefined) {
  const normalized = event?.toLowerCase() ?? "";
  return normalized.includes("pirep");
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-vamsys-signature");

  if (!verifySignature(rawBody, signature)) {
    await writeAuditLogSafely({
      action: "VAMSYS_WEBHOOK_REJECTED",
      entityType: "Webhook",
      message: "Rejected vAMSYS webhook because signature verification failed.",
      metadata: { reason: "invalid_signature" },
    });
    return Response.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!isPirepEvent(payload.event)) {
    return Response.json({ ok: true, skipped: true, reason: "event_not_pirep" });
  }

  const pirepId = extractPirepId(payload);
  if (!pirepId) return Response.json({ ok: false, error: "missing_pirep_id" }, { status: 400 });

  try {
    const processed = await processAcceptedOperationsPirep(pirepId);
    await writeAuditLogSafely({
      action: "VAMSYS_WEBHOOK_PIREP_PROCESSED",
      entityType: "Pirep",
      entityId: processed.pirepId,
      message: `Processed vAMSYS PIREP webhook ${payload.event_id ?? ""} for ${processed.vamsysPirepId}.`,
      metadata: {
        imported: processed.imported,
        updated: processed.updated,
        payrollGenerated: processed.payrollGenerated,
        walletTransactionCreated: processed.walletTransactionCreated,
        expensesGenerated: processed.expensesGenerated,
      },
    });
    return Response.json({ ok: true, ...processed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook processing error.";
    await writeAuditLogSafely({
      action: "VAMSYS_WEBHOOK_PIREP_FAILED",
      entityType: "Pirep",
      entityId: pirepId,
      message: `Failed to process vAMSYS PIREP webhook: ${message}`,
      metadata: { eventId: payload.event_id ?? null, error: message.slice(0, 180) },
    });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

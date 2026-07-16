import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

function equalSecret(left: string | undefined, right: string) {
  if (!left) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function isCronAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const authorization = request.headers.get("authorization")?.trim();
  if (authorization?.startsWith("Bearer ") && equalSecret(authorization.slice(7), secret)) return true;

  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  if (equalSecret(headerSecret, secret)) return true;

  return false;
}

export function cronUnauthorizedResponse() {
  return Response.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
}

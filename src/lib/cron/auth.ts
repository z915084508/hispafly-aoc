import type { NextRequest } from "next/server";

export function isCronAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const authorization = request.headers.get("authorization")?.trim();
  if (authorization === `Bearer ${secret}`) return true;

  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  if (headerSecret === secret) return true;

  const urlSecret = request.nextUrl.searchParams.get("secret")?.trim();
  return urlSecret === secret;
}

export function cronUnauthorizedResponse() {
  return Response.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
}

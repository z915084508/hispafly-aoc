import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "hispafly_aoc_pilot_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const sessionSecret = process.env.AOC_PILOT_SESSION_SECRET ?? process.env.AUTH_SECRET ?? process.env.AOC_ADMIN_SESSION_SECRET ?? "hispafly-aoc-pilot-session";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(payload: string) {
  return createHmac("sha256", sessionSecret).update(payload).digest("base64url");
}

function sessionValue(pilotId: string) {
  const issuedAt = Date.now().toString();
  const payload = `${pilotId}:${issuedAt}`;
  return `${payload}:${sign(payload)}`;
}

function readSessionPilotId(value?: string) {
  if (!value) return null;
  const [pilotId, issuedAt, signature] = value.split(":");
  if (!pilotId || !issuedAt || !signature) return null;
  const issuedAtMs = Number(issuedAt);
  if (!Number.isFinite(issuedAtMs)) return null;
  if (Date.now() - issuedAtMs > SESSION_MAX_AGE_SECONDS * 1000) return null;
  return safeEqual(signature, sign(`${pilotId}:${issuedAt}`)) ? pilotId : null;
}

export async function setPilotSession(pilotId: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, sessionValue(pilotId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearPilotSession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getCurrentPilot() {
  const cookieStore = await cookies();
  const pilotId = readSessionPilotId(cookieStore.get(COOKIE_NAME)?.value);
  if (!pilotId) return null;
  return prisma.pilot.findUnique({ where: { id: pilotId } }).catch(() => null);
}

export async function requirePilotSession() {
  const pilot = await getCurrentPilot();
  if (!pilot) redirect("/pilot");
  return pilot;
}

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "hispafly_aoc_admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function requiredSecret(name: "AOC_ADMIN_PASSWORD" | "AOC_ADMIN_SESSION_SECRET") {
  const secret = process.env[name]?.trim();
  if (!secret) throw new Error(`${name} must be configured.`);
  return secret;
}

export const adminUsername = process.env.AOC_ADMIN_USERNAME?.trim() || "Admin";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(payload: string) {
  return createHmac("sha256", requiredSecret("AOC_ADMIN_SESSION_SECRET")).update(payload).digest("base64url");
}

function sessionValue() {
  const issuedAt = Date.now().toString();
  const payload = `${adminUsername}:${issuedAt}`;
  return `${payload}:${sign(payload)}`;
}

function isValidSessionValue(value?: string) {
  if (!value) return false;
  const [username, issuedAt, signature] = value.split(":");
  if (!username || !issuedAt || !signature) return false;
  if (!safeEqual(username.toLowerCase(), adminUsername.toLowerCase())) return false;
  const issuedAtMs = Number(issuedAt);
  if (!Number.isFinite(issuedAtMs)) return false;
  if (Date.now() - issuedAtMs > SESSION_MAX_AGE_SECONDS * 1000) return false;
  return safeEqual(signature, sign(`${username}:${issuedAt}`));
}

export function validateAdminCredentials(username: string, password: string) {
  return safeEqual(username.trim().toLowerCase(), adminUsername.toLowerCase()) && safeEqual(password, requiredSecret("AOC_ADMIN_PASSWORD"));
}

export async function hasValidAdminSession() {
  try {
    const cookieStore = await cookies();
    return isValidSessionValue(cookieStore.get(COOKIE_NAME)?.value);
  } catch {
    return false;
  }
}

export async function setAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, sessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

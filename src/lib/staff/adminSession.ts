import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "hispafly_aoc_admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export const legacyAdminLoginEnabled = process.env.AOC_LEGACY_ADMIN_LOGIN_ENABLED !== "false";
export const adminUsername = process.env.AOC_ADMIN_USERNAME ?? "Admin";
const developmentPassword = process.env.NODE_ENV === "production" ? "" : "z915084508";
const adminPassword = process.env.AOC_ADMIN_PASSWORD ?? developmentPassword;
const sessionSecret = process.env.AOC_ADMIN_SESSION_SECRET ?? adminPassword;

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(payload: string) {
  return createHmac("sha256", sessionSecret).update(payload).digest("base64url");
}

function sessionValue() {
  const issuedAt = Date.now().toString();
  const payload = `${adminUsername}:${issuedAt}`;
  return `${payload}:${sign(payload)}`;
}

function isValidSessionValue(value?: string) {
  if (!value || !sessionSecret) return false;
  const [username, issuedAt, signature] = value.split(":");
  if (!username || !issuedAt || !signature) return false;
  if (!safeEqual(username.toLowerCase(), adminUsername.toLowerCase())) return false;
  const issuedAtMs = Number(issuedAt);
  if (!Number.isFinite(issuedAtMs)) return false;
  if (Date.now() - issuedAtMs > SESSION_MAX_AGE_SECONDS * 1000) return false;
  return safeEqual(signature, sign(`${username}:${issuedAt}`));
}

export function validateAdminCredentials(username: string, password: string) {
  if (!legacyAdminLoginEnabled || !adminPassword) return false;
  return safeEqual(username.trim().toLowerCase(), adminUsername.toLowerCase()) && safeEqual(password, adminPassword);
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

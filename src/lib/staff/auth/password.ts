import "server-only";

import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "crypto";

const VERSION = "1";
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const BLOCKED_PASSWORDS = ["password", "123456", "qwerty", "hispafly", "admin"];

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

function encodeHash(salt: Buffer, key: Buffer) {
  return `scrypt$v=${VERSION}$N=${SCRYPT_OPTIONS.N}$r=${SCRYPT_OPTIONS.r}$p=${SCRYPT_OPTIONS.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

const FAKE_SALT = Buffer.from("hispafly-aoc-fake-login-salt-v1");
export const FAKE_PASSWORD_HASH = encodeHash(
  FAKE_SALT,
  scryptSync("not-a-real-staff-password", FAKE_SALT, KEY_LENGTH, SCRYPT_OPTIONS),
);

export async function hashStaffPassword(password: string) {
  const salt = randomBytes(16);
  return encodeHash(salt, await derive(password, salt));
}

export async function verifyStaffPassword(password: string, storedHash: string) {
  try {
    const parts = storedHash.split("$");
    if (parts.length !== 7 || parts[0] !== "scrypt" || parts[1] !== `v=${VERSION}`) return false;
    const options = Object.fromEntries(parts.slice(2, 5).map((part) => part.split("=")));
    if (Number(options.N) !== SCRYPT_OPTIONS.N || Number(options.r) !== SCRYPT_OPTIONS.r || Number(options.p) !== SCRYPT_OPTIONS.p) return false;
    const salt = Buffer.from(parts[5], "base64url");
    const expected = Buffer.from(parts[6], "base64url");
    const actual = await derive(password, salt);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function validateStaffPasswordPolicy(
  password: string,
  identity?: { staffCode?: string | null; email?: string | null },
) {
  const errors: string[] = [];
  if (password.length < 12) errors.push("Password must contain at least 12 characters.");
  if (password.length > 128) errors.push("Password cannot contain more than 128 characters.");

  const classes = [/[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
  if (classes < 3) errors.push("Password must use at least three character types: lowercase, uppercase, number or symbol.");

  const normalized = password.toLowerCase();
  if (BLOCKED_PASSWORDS.some((value) => normalized.includes(value))) errors.push("Choose a less predictable password.");

  const staffCode = identity?.staffCode?.trim().toLowerCase();
  if (staffCode && normalized.includes(staffCode)) errors.push("Password cannot contain the Staff code.");
  const emailLocalPart = identity?.email?.split("@")[0]?.trim().toLowerCase();
  if (emailLocalPart && emailLocalPart.length >= 3 && normalized.includes(emailLocalPart)) errors.push("Password cannot contain the email name.");

  return { valid: errors.length === 0, errors };
}

export function generateTemporaryPassword() {
  return `Hf1!${randomBytes(15).toString("base64url")}`;
}

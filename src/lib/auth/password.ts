import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 200) throw new Error("Password must contain between 12 and 200 characters.");
  const salt = randomBytes(16); const derived = await scrypt(password, salt, KEY_LENGTH) as Buffer;
  return `scrypt:v1:${salt.toString("base64url")}:${derived.toString("base64url")}`;
}
export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, version, saltValue, hashValue] = storedHash.split(":");
  if (algorithm !== "scrypt" || version !== "v1" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64url");
  const actual = await scrypt(password, Buffer.from(saltValue, "base64url"), expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

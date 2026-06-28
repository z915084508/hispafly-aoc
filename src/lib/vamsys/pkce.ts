import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const base64Url = (value: Buffer) => value.toString("base64url");

export function generateCodeVerifier(): string {
  return base64Url(randomBytes(64));
}

export function generateCodeChallenge(codeVerifier: string): string {
  if (codeVerifier.length < 43 || codeVerifier.length > 128) throw new Error("Invalid PKCE code verifier length.");
  return base64Url(createHash("sha256").update(codeVerifier).digest());
}

export function generateState(): string {
  return base64Url(randomBytes(32));
}

export function secureStateEquals(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

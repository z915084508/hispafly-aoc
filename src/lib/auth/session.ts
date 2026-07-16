import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
const COOKIE_NAME = "hispafly_identity_session"; const SESSION_SECONDS = 60 * 60 * 24 * 7;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("base64url");
export async function createAuthSession(userId: string, metadata: { ipAddress?: string; userAgent?: string } = {}) {
  const token = randomBytes(32).toString("base64url");
  await prisma.authSession.create({ data: { userId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000), ipAddress: metadata.ipAddress?.slice(0,128), userAgent: metadata.userAgent?.slice(0,512) } });
  (await cookies()).set(COOKIE_NAME, token, { httpOnly:true, sameSite:"lax", secure:process.env.NODE_ENV === "production", path:"/", maxAge:SESSION_SECONDS });
}
export async function currentAuthUser() {
  const token = (await cookies()).get(COOKIE_NAME)?.value; if (!token) return null;
  const session = await prisma.authSession.findUnique({ where:{tokenHash:tokenHash(token)}, include:{user:{include:{pilot:true,roles:{include:{role:{include:{permissions:{include:{permission:true}}}}}}}}} }).catch(()=>null);
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") return null;
  return session.user;
}
export async function revokeCurrentAuthSession() {
  const store=await cookies(),token=store.get(COOKIE_NAME)?.value;
  if(token) await prisma.authSession.updateMany({where:{tokenHash:tokenHash(token),revokedAt:null},data:{revokedAt:new Date()}});
  store.set(COOKIE_NAME,"",{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV === "production",path:"/",maxAge:0});
}

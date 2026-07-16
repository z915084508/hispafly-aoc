import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { createAuthSession } from "./session";
import { hashPassword, verifyPassword } from "./password";
const normalize=(email:string)=>email.trim().toLowerCase(),hashToken=(token:string)=>createHash("sha256").update(token).digest("base64url");
const normalizeUsername=(username:string)=>username.trim().toLowerCase();
export interface RegisterPilotInput{firstName:string;lastName:string;email:string;username:string;password:string;callsign?:string;}
export async function registerPilot(input:RegisterPilotInput){
  const email=normalize(input.email),username=normalizeUsername(input.username),firstName=input.firstName.trim(),lastName=input.lastName.trim(),callsign=input.callsign?.trim().toUpperCase()||null;
  if(!firstName||!lastName||!/^[a-z0-9._-]{3,30}$/.test(username)||!/^\S+@\S+\.\S+$/.test(email))throw new Error("Invalid registration details.");
  const passwordHash=await hashPassword(input.password),token=randomBytes(32).toString("base64url");
  const user=await prisma.$transaction(async tx=>{const role=await tx.authRole.findUnique({where:{code:"PILOT"}});if(!role)throw new Error("PILOT role is not installed.");return tx.authUser.create({data:{email,username,passwordHash,displayName:`${firstName} ${lastName}`,status:"PENDING_VERIFICATION",roles:{create:{roleId:role.id}},pilot:{create:{firstName,lastName,displayName:`${firstName} ${lastName}`,email,username,callsign,status:"inactive"}},verificationTokens:{create:{tokenHash:hashToken(token),expiresAt:new Date(Date.now()+24*60*60*1000)}}},include:{pilot:true}})});
  await writeAuditLogSafely({action:"IDENTITY_REGISTERED",entityType:"AuthUser",entityId:user.id,message:"A new Hispafly Pilot account registered."});return {user,token};
}
export async function issueEmailVerification(email:string){
  const user=await prisma.authUser.findUnique({where:{email:normalize(email)}});
  if(!user||user.status!=="PENDING_VERIFICATION"||user.emailVerifiedAt)return null;
  const token=randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.emailVerificationToken.updateMany({where:{userId:user.id,usedAt:null},data:{usedAt:new Date()}}),
    prisma.emailVerificationToken.create({data:{userId:user.id,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+24*60*60*1000)}})
  ]);
  await writeAuditLogSafely({action:"EMAIL_VERIFICATION_REISSUED",entityType:"AuthUser",entityId:user.id,message:"A new identity verification email was requested."});
  return {user,token};
}
export async function verifyEmail(token:string){const record=await prisma.emailVerificationToken.findUnique({where:{tokenHash:hashToken(token)}});if(!record||record.usedAt||record.expiresAt<=new Date())return false;await prisma.$transaction([prisma.emailVerificationToken.update({where:{id:record.id},data:{usedAt:new Date()}}),prisma.authUser.update({where:{id:record.userId},data:{emailVerifiedAt:new Date(),status:"ACTIVE"}}),prisma.pilot.updateMany({where:{authUserId:record.userId},data:{status:"active"}})]);await writeAuditLogSafely({action:"EMAIL_VERIFIED",entityType:"AuthUser",entityId:record.userId,message:"Hispafly identity email verified."});return true;}
export async function loginWithPassword(email:string,password:string,metadata:{ipAddress?:string;userAgent?:string}={}){
  const normalized=normalize(email),user=await prisma.authUser.findUnique({where:{email:normalized}}),locked=Boolean(user?.lockedUntil&&user.lockedUntil>new Date());
  const valid=Boolean(user?.passwordHash)&&!locked&&await verifyPassword(password,user!.passwordHash!);
  if(!user||!valid||user.status==="DISABLED"||user.status==="PENDING_VERIFICATION"){
    if(user&&!locked){const failures=user.failedLoginAttempts+1;await prisma.authUser.update({where:{id:user.id},data:{failedLoginAttempts:failures,lockedUntil:failures>=5?new Date(Date.now()+15*60*1000):null,...(failures>=5?{status:"LOCKED" as const}:{})}})}
    await writeAuditLogSafely({action:"IDENTITY_LOGIN_FAILED",entityType:"AuthUser",entityId:user?.id,message:"Local identity login failed.",metadata:{email:normalized,locked}});return null;
  }
  await prisma.authUser.update({where:{id:user.id},data:{failedLoginAttempts:0,lockedUntil:null,status:"ACTIVE",lastLoginAt:new Date()}});await createAuthSession(user.id,metadata);
  await writeAuditLogSafely({action:"IDENTITY_LOGIN_SUCCEEDED",entityType:"AuthUser",entityId:user.id,message:"Local identity login succeeded."});return user;
}
export async function issuePasswordReset(email:string){const user=await prisma.authUser.findUnique({where:{email:normalize(email)}});if(!user||user.status==="DISABLED")return null;const token=randomBytes(32).toString("base64url");await prisma.passwordResetToken.create({data:{userId:user.id,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+30*60*1000)}});await writeAuditLogSafely({action:"PASSWORD_RESET_REQUESTED",entityType:"AuthUser",entityId:user.id,message:"A local password reset was requested."});return token;}
export async function resetPassword(token:string,password:string){const record=await prisma.passwordResetToken.findUnique({where:{tokenHash:hashToken(token)}});if(!record||record.usedAt||record.expiresAt<=new Date())return false;const passwordHash=await hashPassword(password);await prisma.$transaction([prisma.passwordResetToken.update({where:{id:record.id},data:{usedAt:new Date()}}),prisma.authUser.update({where:{id:record.userId},data:{passwordHash,passwordChangedAt:new Date(),failedLoginAttempts:0,lockedUntil:null,status:"ACTIVE",emailVerifiedAt:new Date()}}),prisma.authSession.updateMany({where:{userId:record.userId,revokedAt:null},data:{revokedAt:new Date()}})]);await writeAuditLogSafely({action:"PASSWORD_RESET_COMPLETED",entityType:"AuthUser",entityId:record.userId,message:"A local password was reset."});return true;}

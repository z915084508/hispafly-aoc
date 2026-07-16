"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { loginWithPassword } from "@/lib/auth/service";
import { revokeCurrentAuthSession } from "@/lib/auth/session";
const value=(formData:FormData,key:string)=>String(formData.get(key)??"");
export async function loginPilot(formData:FormData){const h=await headers();const user=await loginWithPassword(value(formData,"email"),value(formData,"password"),{ipAddress:h.get("x-forwarded-for")?.split(",")[0]?.trim(),userAgent:h.get("user-agent")??undefined});if(!user)redirect("/pilot?error=invalid_credentials");redirect("/pilot/dashboard");}
export async function logoutPilot(){await revokeCurrentAuthSession();redirect("/pilot?success=logged_out");}

import { redirect } from "next/navigation";
import { currentAuthUser } from "@/lib/auth/session";
export async function getCurrentPilot(){return (await currentAuthUser())?.pilot??null;}
export async function requirePilotSession(){const user=await currentAuthUser();const roles=new Set(user?.roles.map(({role})=>role.code));if(!user?.pilot||(!roles.has("PILOT")&&!roles.has("ADMIN")))redirect("/pilot?error=login_required");return user.pilot;}

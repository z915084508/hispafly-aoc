import { NextResponse } from "next/server";
import { currentAuthUser } from "@/lib/auth/session";
import { getAcarsAssignment } from "@/lib/native-flight/dispatch";
export const dynamic="force-dynamic";
export async function GET(){const user=await currentAuthUser();if(!user?.pilot)return NextResponse.json({error:"unauthorized"},{status:401});const assignment=await getAcarsAssignment(user.pilot.id);return NextResponse.json({available:Boolean(assignment),assignment})}

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cronUnauthorizedResponse,isCronAuthorized } from "@/lib/cron/auth";
import { expireNativeDispatches } from "@/lib/native-flight/dispatch";
export const dynamic="force-dynamic";export const runtime="nodejs";
export async function GET(request:NextRequest){if(!isCronAuthorized(request))return cronUnauthorizedResponse();return NextResponse.json({ok:true,...await expireNativeDispatches()})}

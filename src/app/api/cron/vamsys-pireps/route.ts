import type {NextRequest} from "next/server";
import {cronUnauthorizedResponse,isCronAuthorized} from "@/lib/cron/auth";
import {disabledVamsysResponse} from "@/lib/vamsys/legacy-policy";
export const dynamic="force-dynamic";export const runtime="nodejs";
export async function GET(request:NextRequest){if(!isCronAuthorized(request))return cronUnauthorizedResponse();return disabledVamsysResponse()}

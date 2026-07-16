import {writeAuditLogSafely} from "@/lib/audit/log";
import {VAMSYS_LEGACY_MESSAGE} from "@/lib/vamsys/legacy-policy";
export const dynamic="force-dynamic";export const runtime="nodejs";
export async function POST(request:Request){await request.text();await writeAuditLogSafely({action:"VAMSYS_WEBHOOK_DISABLED",entityType:"Pirep",message:"Ignored a vAMSYS webhook because the integration is frozen in legacy mode."});return Response.json({ok:true,disabled:true,status:"VAMSYS_LEGACY",message:VAMSYS_LEGACY_MESSAGE},{status:202})}

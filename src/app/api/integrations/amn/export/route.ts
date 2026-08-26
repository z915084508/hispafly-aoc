import { timingSafeEqual } from "node:crypto";
import { createAmnExport } from "@/lib/amn/export-service";
export const dynamic="force-dynamic";export const runtime="nodejs";
const equal=(a:string,b:string)=>{const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right)};
export async function GET(request:Request){
  const secret=(process.env.AMN_EXPORT_API_KEY??process.env.AMN_API_KEY)?.trim(),presented=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"").trim();
  if(!secret||!presented||!equal(presented,secret))return Response.json({error:{code:"UNAUTHORIZED",message:"A valid AMN export credential is required."}},{status:401,headers:{"Cache-Control":"no-store"}});
  return Response.json(await createAmnExport(),{headers:{"Cache-Control":"private, no-store"}});
}

import { verifyEmail } from "@/lib/auth/service";
export async function POST(request:Request){const body=await request.json().catch(()=>null) as {token?:unknown}|null;if(typeof body?.token!=="string")return Response.json({error:"invalid_request"},{status:400});return await verifyEmail(body.token)?Response.json({ok:true}):Response.json({error:"invalid_or_expired_token"},{status:400});}

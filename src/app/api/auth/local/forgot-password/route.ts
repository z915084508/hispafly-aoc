import { issuePasswordReset } from "@/lib/auth/service";
import { deliverIdentityToken } from "@/lib/auth/delivery";
export async function POST(request:Request){const body=await request.json().catch(()=>null) as {email?:unknown}|null;if(typeof body?.email==="string"){const token=await issuePasswordReset(body.email);if(token)await deliverIdentityToken({type:"reset_password",email:body.email,token}).catch(error=>console.error("Password reset delivery failed.",error));}return Response.json({ok:true,message:"If the account exists, reset instructions will be sent."});}

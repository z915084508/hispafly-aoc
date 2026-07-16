import { revokeCurrentAuthSession } from "@/lib/auth/session";
export async function POST(request:Request){const origin=request.headers.get("origin");if(origin&&new URL(origin).origin!==new URL(request.url).origin)return Response.json({error:"invalid_origin"},{status:403});await revokeCurrentAuthSession();return Response.json({ok:true});}

export async function deliverIdentityToken(input:{type:"verify_email"|"reset_password";email:string;token:string}){
  const webhook=process.env.AUTH_EMAIL_WEBHOOK?.trim();if(!webhook){if(process.env.NODE_ENV==="production")throw new Error("AUTH_EMAIL_WEBHOOK must be configured.");console.info(`[Identity email stub] ${input.type} for ${input.email}: ${input.token}`);return false;}
  const response=await fetch(webhook,{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${process.env.AUTH_EMAIL_WEBHOOK_SECRET??""}`},body:JSON.stringify(input),cache:"no-store"});
  if(!response.ok)throw new Error(`Identity email delivery failed (${response.status}).`);return true;
}

"use server";
import { redirect } from "next/navigation";
import { issueEmailVerification, registerPilot } from "@/lib/auth/service";
import { deliverIdentityToken } from "@/lib/auth/delivery";
const v=(f:FormData,k:string)=>String(f.get(k)??"");
export async function registerAction(form:FormData){
  const password=v(form,"password"),email=v(form,"email");
  if(password!==v(form,"confirmPassword"))redirect("/register?error=passwords_do_not_match");
  try{
    const result=await registerPilot({firstName:v(form,"firstName"),lastName:v(form,"lastName"),email,username:v(form,"username"),password,callsign:v(form,"callsign")});
    await deliverIdentityToken({type:"verify_email",email:result.user.email,token:result.token});
  }catch(error){
    if(error instanceof Error&&error.message.includes("Unique constraint")){
      const result=await issueEmailVerification(email);
      if(result){
        try{await deliverIdentityToken({type:"verify_email",email:result.user.email,token:result.token});}
        catch{redirect("/register?error=verification_email_failed");}
        redirect("/login?success=verification_resent");
      }
      redirect("/register?error=account_already_exists");
    }
    redirect(`/register?error=${encodeURIComponent(error instanceof Error?error.message:"registration_failed")}`);
  }
  redirect("/login?success=check_email");
}

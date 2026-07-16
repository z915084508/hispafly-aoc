"use server";

import { redirect } from "next/navigation";
import { deliverIdentityToken } from "@/lib/auth/delivery";
import { issueEmailVerification } from "@/lib/auth/service";

export async function resendVerificationAction(form: FormData) {
  const email = String(form.get("email") ?? "");
  const result = await issueEmailVerification(email);
  if (result) {
    try {
      await deliverIdentityToken({ type: "verify_email", email: result.user.email, token: result.token });
    } catch (error) {
      console.error("Verification email delivery failed.", error);
      redirect("/resend-verification?error=delivery_failed");
    }
  }
  redirect("/resend-verification?success=sent");
}

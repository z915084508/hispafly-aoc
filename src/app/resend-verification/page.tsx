import Link from "next/link";
import { resendVerificationAction } from "./actions";

export default async function ResendVerificationPage({ searchParams }: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const query = await searchParams;
  return <main className="portal-gateway admin-login-gateway"><section className="login-panel">
    <div className="login-copy"><span>HISPAFLY IDENTITY</span><h1>Resend verification</h1>
      <p>Enter the email address used to create your Pilot account.</p><Link href="/login">Back to sign in</Link>
    </div>
    <form className="login-form" action={resendVerificationAction}>
      {query.success&&<div className="feedback success">If an unverified account exists, a new verification email has been sent. Check your inbox and spam folder.</div>}
      {query.error==="delivery_failed"&&<div className="feedback error">Your account was found, but the email could not be sent. Please contact Hispafly staff.</div>}
      <label>Email<input name="email" type="email" autoComplete="email" required/></label>
      <button className="button">SEND VERIFICATION EMAIL</button>
    </form>
  </section></main>;
}

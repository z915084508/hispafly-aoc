import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAdmin } from "./actions";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { legacyAdminLoginEnabled } from "@/lib/staff/adminSession";

const errorMessages: Record<string, string> = {
  invalid_credentials: "Invalid Staff code/email or password.",
  account_locked: "This account is temporarily unavailable. Try again later or contact an administrator.",
  staff_access_denied: "Please sign in with an active Staff account to continue.",
};

const successMessages: Record<string, string> = {
  logged_out: "Staff session closed.",
};

function safeNextPath(value?: string) {
  return value?.startsWith("/staff") ? value : "/staff";
}

export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; next?: string }>;
}) {
  const [params, staff] = await Promise.all([searchParams, getCurrentStaff()]);
  const next = safeNextPath(params.next);
  if (staff?.active) redirect(staff.mustChangePassword ? "/staff/account/change-password" : next);

  return (
    <main className="portal-gateway admin-login-gateway">
      <div className="gateway-brand">
        <Image src="/logo-hispafly-full.png" alt="HISPAFLY" width={1800} height={400} priority />
        <p>AOC STAFF PORTAL</p>
      </div>
      <section className="login-panel">
        <div className="gateway-copy login-copy">
          <span>STAFF ACCESS</span>
          <h1>Sign in to AOC.</h1>
          <p>Use your personal Staff code or email and password.</p>
        </div>
        <form className="login-form" action={loginAdmin}>
          {params.error && <div className="feedback error">{errorMessages[params.error] ?? "Staff access denied."}</div>}
          {params.success && <div className="feedback success">{successMessages[params.success] ?? params.success}</div>}
          {legacyAdminLoginEnabled && (
            <div className="notice">
              Legacy administrator recovery login is enabled. For recovery, enter the old administrator username here—not NET001, FLT001 or a Staff email—and use the existing administrator password.
            </div>
          )}
          <input type="hidden" name="next" value={next} />
          <label>
            Staff code or email
            <input name="identifier" type="text" autoComplete="username" required autoFocus />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <div className="login-actions">
            <button className="button" type="submit">ENTER STAFF PORTAL →</button>
            <Link href="/">Back to portal selection</Link>
          </div>
        </form>
      </section>
      <footer>HISPAFLY · Airline Operations Center</footer>
    </main>
  );
}

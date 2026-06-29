import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAdmin } from "./actions";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { adminUsername } from "@/lib/staff/adminSession";

const errorMessages: Record<string, string> = {
  invalid_credentials: "Admin username or password is incorrect.",
  staff_access_denied: "Please sign in with an active Admin account to continue.",
};

const successMessages: Record<string, string> = {
  logged_out: "Admin session closed.",
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
  if (staff?.active && staff.role === "ADMIN") redirect(next);

  return (
    <main className="portal-gateway admin-login-gateway">
      <div className="gateway-brand">
        <Image src="/logo-hispafly-full.png" alt="HISPAFLY" width={1800} height={400} priority />
        <p>AOC ADMIN PORTAL</p>
      </div>
      <section className="login-panel">
        <div className="gateway-copy login-copy">
          <span>ADMIN ACCESS</span>
          <h1>Sign in to AOC.</h1>
          <p>Protected entry for HISPAFLY staff operations, PIREPs, payroll and reports.</p>
        </div>
        <form className="login-form" action={loginAdmin}>
          {params.error && <div className="feedback error">{errorMessages[params.error] ?? "Admin access denied."}</div>}
          {params.success && <div className="feedback success">{successMessages[params.success] ?? params.success}</div>}
          <input type="hidden" name="next" value={next} />
          <label>
            Account
            <input name="username" type="text" defaultValue={adminUsername} autoComplete="username" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <div className="login-actions">
            <button className="button" type="submit">ENTER ADMIN PORTAL →</button>
            <Link href="/">Back to portal selection</Link>
          </div>
        </form>
      </section>
      <footer>HISPAFLY · Airline Operations Center</footer>
    </main>
  );
}

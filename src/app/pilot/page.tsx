import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPilot } from "@/lib/pilot/session";
import { isVamsysPilotConfigured } from "@/lib/vamsys/config";

export default async function PilotPortal({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const [message, pilot] = await Promise.all([searchParams, getCurrentPilot()]);
  if (pilot) redirect("/pilot/dashboard");

  const configured = isVamsysPilotConfigured();
  return (
    <div className="pilot-shell">
      <header className="pilot-header">
        <Link href="/" className="pilot-logo"><Image src="/logo-hispafly-full.png" alt="HISPAFLY" width={1800} height={400} priority /></Link>
        <nav><Link href="/">Switch portal</Link></nav>
      </header>
      <main className="pilot-content">
        <div className="pilot-hero">
          <p>PILOT PORTAL</p>
          <h1>Your flying life,<br/>all in one place.</h1>
          <span>Connect with vAMSYS to access your HISPAFLY pilot workspace.</span>
        </div>
        {message.success && <div className="feedback success">{message.success}</div>}
        {message.error && <div className="feedback error">{message.error}</div>}
        <section className="pilot-welcome-card">
          <div>
            <small>SECURE ACCESS</small>
            <h2>Sign in with vAMSYS</h2>
            <p>Your vAMSYS identity links you to the correct pilot record. Credentials and API tokens remain server-side.</p>
          </div>
          <div className="pilot-access-actions">
            {configured
              ? <Link className="button" href="/api/vamsys/oauth/start">CONTINUE WITH vAMSYS →</Link>
              : <span className="meta">OAuth configuration required.</span>}
          </div>
        </section>
      </main>
    </div>
  );
}

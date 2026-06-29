import Image from "next/image";
import Link from "next/link";

export default async function PortalSelection({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const denied = (await searchParams).error === "staff_access_denied";
  return <main className="portal-gateway">
    <div className="gateway-brand"><Image src="/logo-hispafly-full.png" alt="HISPAFLY" width={1800} height={400} priority /><p>AOC PORTAL</p></div>
    <div className="gateway-copy"><span>WELCOME ABOARD</span><h1>Choose your portal</h1><p>Access your personal flight information or manage HISPAFLY operations.</p></div>
    {denied && <div className="feedback error">STAFF PORTAL is currently restricted to active ADMIN users.</div>}
    <section className="portal-choices">
      <Link className="portal-choice pilot-choice" href="/pilot"><span className="portal-number">01</span><div><small>FLIGHT CREW</small><h2>PILOT PORTAL</h2><p>Personal PIREPs, virtual payroll, wallet and pilot profile.</p></div><strong>ENTER →</strong></Link>
      <Link className="portal-choice staff-choice" href="/staff"><span className="portal-number">02</span><div><small>ADMINISTRATION</small><h2>STAFF PORTAL</h2><p>Operations, pilots, payroll, reports and system settings.</p></div><strong>ADMIN ONLY →</strong></Link>
    </section>
    <footer>HISPAFLY · Airline Operations Center</footer>
  </main>;
}

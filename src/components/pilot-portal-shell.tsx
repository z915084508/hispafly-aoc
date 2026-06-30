import Image from "next/image";
import Link from "next/link";
import { requirePilotSession } from "@/lib/pilot/session";

const flightNavItems = [
  ["Panel Control", "/pilot/dashboard"],
  ["PIREPs", "/pilot/pireps"],
  ["Roster Piloto", "/pilot/roster"],
] as const;

const economyNavItems = [
  ["Movimiento de cartera", "/pilot/wallet"],
  ["Nómina", "/pilot/payroll"],
] as const;

const money = (cents: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(cents / 100);

export async function PilotPortalShell({ children }: { children: React.ReactNode }) {
  const pilot = await requirePilotSession();
  const identity = pilot.callsign ?? pilot.vamsysPilotId;
  const rank = pilot.rankName ?? pilot.rankAbbreviation ?? pilot.rank ?? "Sin rango";
  const initials = pilot.displayName.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase() || "P";

  return (
    <div className="app-shell pilot-portal-shell">
      <aside className="sidebar pilot-sidebar">
        <div className="brand">
          <div className="brand-logo"><Image src="/logo-hispafly-full.png" alt="HISPAFLY" width={1800} height={400} priority /></div>
          <div className="brand-subtitle">Pilot Portal</div>
        </div>
        <div className="nav-label">Área de vuelo</div>
        <nav className="nav-list">{flightNavItems.map(([label, href]) => <Link className="nav-item" href={href} key={href}>{label}</Link>)}</nav>
        <div className="nav-label">Estado económico</div>
        <nav className="nav-list">{economyNavItems.map(([label, href]) => <Link className="nav-item" href={href} key={href}>{label}</Link>)}</nav>
        <div className="sidebar-note">Tu portal solo muestra tus datos personales de operación, nómina y cartera.<br/><Link href="/privacy">Política de privacidad</Link></div>
      </aside>
      <main className="main">
        <header className="topbar pilot-topbar">
          <div className="environment">Pilot Portal · Datos sincronizados desde vAMSYS</div>
          <div className="pilot-user-summary">
            <div>
              <div className="primary">{pilot.displayName}</div>
              <span className="secondary">{identity} · {rank} · {pilot.base ?? "Base —"} · {pilot.status}</span>
              <span className="secondary">Cartera: {money(pilot.walletBalanceCents)}</span>
            </div>
            <div className="avatar">{initials}</div>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}

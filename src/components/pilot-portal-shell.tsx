import Image from "next/image";
import Link from "next/link";
import { requirePilotSession } from "@/lib/pilot/session";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getTranslations } from "@/lib/i18n/server";
import { formatCurrency } from "@/lib/i18n/core";
import { logoutPilot } from "@/app/pilot/actions";
import { prisma } from "@/lib/prisma";
import { effectivePilotRank, legacyAppointment } from "@/lib/pilot/career";

const dispatchNavItems = [
  ["flightMarketplace", "/pilot/flight-offers"],
  ["createFlight", "/pilot/flight-offers/self-dispatch"],
  ["myOperations", "/pilot/bookings"],
  ["dispatchOfp", "/pilot/ofp"],
] as const;

const operationNavItems = [
  ["liveFlights", "/pilot/live-flights"], ["pireps", "/pilot/pireps"], ["routes", "/pilot/routes"], ["fleet", "/pilot/fleet"], ["roster", "/pilot/roster"],
] as const;

const economyNavItems = [
  ["wallet", "/pilot/wallet"], ["payroll", "/pilot/payroll"],
] as const;

export async function PilotPortalShell({ children }: { children: React.ReactNode }) {
  const pilot = await requirePilotSession();
  const { t, locale } = await getTranslations();
  const identity = pilot.callsign ?? pilot.vamsysPilotId;
  const [acceptedPireps, totalPireps] = await Promise.all([
    prisma.pirep.findMany({ where: { pilotId: pilot.id, status: "accepted" }, select: { flightTimeMinutes: true, blockTimeMinutes: true } }),
    prisma.pirep.count({ where: { pilotId: pilot.id } }),
  ]);
  const rank = effectivePilotRank({ acceptedSectors: acceptedPireps.length, acceptedMinutes: acceptedPireps.reduce((sum, row) => sum + (row.flightTimeMinutes ?? row.blockTimeMinutes ?? 0), 0), totalPireps }, pilot.rankAbbreviation, pilot.rankName, pilot.rank);
  const appointment = pilot.appointment ?? legacyAppointment(pilot.rankName, pilot.rank, pilot.rankAbbreviation);
  const initials = pilot.displayName.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase() || "P";

  return (
    <div className="app-shell pilot-portal-shell">
      <aside className="sidebar pilot-sidebar">
        <div className="brand">
          <div className="brand-logo"><Image src="/logo-hispafly-full.png" alt="HISPAFLY" width={1800} height={400} priority /></div>
          <div className="brand-subtitle">Pilot Portal</div>
        </div>

        <div className="nav-label">PILOT HUB</div>
        <nav className="nav-list"><Link className="nav-item" href="/pilot/dashboard">{t("pilotNav.overview")}</Link><Link className="nav-item" href="/pilot/career">{t("pilotNav.career")}</Link><Link className="nav-item" href="/pilot/performance">{t("pilotNav.performance")}</Link><Link className="nav-item" href="/pilot/awards">{t("pilotNav.awards")}</Link></nav>

        <div className="nav-label">{t("pilotNav.dispatchPortal")}</div>
        <nav className="nav-list">{dispatchNavItems.map(([key, href]) => <Link className="nav-item" href={href} key={href}>{t(`pilotNav.${key}`)}</Link>)}</nav>

        <div className="nav-label">{t("pilotNav.myOperation")}</div>
        <nav className="nav-list">{operationNavItems.map(([key, href]) => <Link className="nav-item" href={href} key={href}>{t(`pilotNav.${key}`)}</Link>)}</nav>

        <div className="nav-label">{t("pilotNav.software")}</div>
        <nav className="nav-list"><Link className="nav-item" href="/pilot/downloads">{t("pilotNav.downloadCenter")}</Link></nav>

        <div className="nav-label">{t("pilotNav.economy")}</div>
        <nav className="nav-list">{economyNavItems.map(([key, href]) => <Link className="nav-item" href={href} key={href}>{t(`pilotNav.${key}`)}</Link>)}</nav>
        <div className="sidebar-note">{t("pilotNav.privacyNote")}<br/><Link href="/privacy">{t("pilotNav.privacy")}</Link></div>
      </aside>
      <main className="main">
        <header className="topbar pilot-topbar">
          <div className="environment">{t("pilotNav.environment")}</div>
          <div className="pilot-user-summary">
            <LanguageSwitcher/>
            <div>
              <div className="primary">{pilot.displayName}</div>
              <span className="secondary">{identity} · {rank}{appointment ? ` · ${appointment}` : ""} · {pilot.base ?? t("pilotNav.noBase")} · {t(`status.${pilot.status}`)}</span>
              <span className="secondary">{t("pilotNav.walletBalance")}: {formatCurrency(pilot.walletBalanceCents, locale)}</span>
            </div>
            <div className="avatar">{initials}</div>
            <form action={logoutPilot}><button className="action-button" type="submit">{t("pilotNav.signOut")}</button></form>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}

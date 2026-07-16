import Image from "next/image";
import Link from "next/link";
import { requirePilotSession } from "@/lib/pilot/session";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getTranslations } from "@/lib/i18n/server";
import { formatCurrency } from "@/lib/i18n/core";
import { logoutPilot } from "@/app/pilot/actions";

const flightNavItems = [
  ["dashboard", "/pilot/dashboard"], ["pireps", "/pilot/pireps"], ["offers", "/pilot/flight-offers"], ["bookings", "/pilot/bookings"], ["ofp", "/pilot/ofp"], ["fleet", "/pilot/fleet"], ["roster", "/pilot/roster"],
] as const;

const economyNavItems = [
  ["wallet", "/pilot/wallet"], ["payroll", "/pilot/payroll"],
] as const;

export async function PilotPortalShell({ children }: { children: React.ReactNode }) {
  const pilot = await requirePilotSession();
  const { t, locale } = await getTranslations();
  const identity = pilot.callsign ?? pilot.vamsysPilotId;
  const rank = pilot.rankName ?? pilot.rankAbbreviation ?? pilot.rank ?? t("pilotNav.noRank");
  const initials = pilot.displayName.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase() || "P";

  return (
    <div className="app-shell pilot-portal-shell">
      <aside className="sidebar pilot-sidebar">
        <div className="brand">
          <div className="brand-logo"><Image src="/logo-hispafly-full.png" alt="HISPAFLY" width={1800} height={400} priority /></div>
          <div className="brand-subtitle">Pilot Portal</div>
        </div>
        <div className="nav-label">{t("pilotNav.area")}</div>
        <nav className="nav-list">{flightNavItems.map(([key, href]) => <Link className="nav-item" href={href} key={href}>{t(`pilotNav.${key}`)}</Link>)}</nav>
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
              <span className="secondary">{identity} · {rank} · {pilot.base ?? t("pilotNav.noBase")} · {t(`status.${pilot.status}`)}</span>
              <span className="secondary">{t("pilotNav.walletBalance")}: {formatCurrency(pilot.walletBalanceCents, locale)}</span>
            </div>
            <div className="avatar">{initials}</div>
            <form action={logoutPilot}><button className="action-button" type="submit">Sign out</button></form>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}

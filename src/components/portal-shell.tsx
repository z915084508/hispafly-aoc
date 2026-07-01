import Link from "next/link";
import Image from "next/image";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { roleLabels } from "@/lib/staff/permissions";
import { logoutAdmin } from "@/app/admin-login/actions";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getTranslations } from "@/lib/i18n/server";

const navItems = [
  ["dashboard", "/staff"], ["pilots", "/staff/pilots"], ["pireps", "/staff/pireps"], ["offers", "/staff/flight-offers"],
  ["payroll", "/staff/payroll"], ["economy", "/staff/wallet"], ["expenses", "/staff/expenses"], ["expenseRules", "/staff/expenses/rules"],
  ["audit", "/staff/audit"], ["vamsys", "/staff/settings/vamsys"], ["settings", "/staff/settings"], ["operations", "/staff/settings/operations"],
] as const;

export async function StaffPortalShell({ children }: { children: React.ReactNode }) {
  const staff = await getCurrentStaff();
  const { t } = await getTranslations();
  const initials = staff?.name.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase() ?? "AOC";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo"><Image src="/logo-hispafly-full.png" alt="HISPAFLY" width={1800} height={400} priority /></div>
          <div className="brand-subtitle">{t("staffNav.portal")}</div>
        </div>
        <div className="nav-label">{t("staffNav.area")}</div>
        <nav className="nav-list">{navItems.map(([key, href]) => <Link className="nav-item" href={href} key={href}>{t(`staffNav.${key}`)}</Link>)}</nav>
        <div className="sidebar-note">{t("staffNav.sourceNote")}<br/><Link href="/privacy">{t("staffNav.privacy")}</Link></div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="environment">{t("staffNav.environment")}</div>
          <div className="user user-session"><LanguageSwitcher/><div><div className="primary">{staff?.name ?? t("common.notConfigured")}</div><span className="secondary">{staff ? roleLabels[staff.role] : t("common.noAccess")}{staff && !staff.active ? ` · ${t("common.inactive")}` : ""}</span></div><div className="avatar">{initials}</div><form action={logoutAdmin}><button className="logout-button" type="submit">{t("common.logout")}</button></form></div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}

export const PortalShell = StaffPortalShell;

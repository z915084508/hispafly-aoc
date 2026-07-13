import Link from "next/link";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { roleLabels } from "@/lib/staff/permissions";
import { logoutAdmin } from "@/app/admin-login/actions";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getTranslations } from "@/lib/i18n/server";
import { visibleNavigation } from "@/lib/staff/navigation";
import { resolvePermissionCodes } from "@/lib/staff/access/resolve";
import { StaffNavigation } from "@/components/staff-navigation";

export async function StaffPortalShell({ children }: { children: React.ReactNode }) {
  const staff = await getCurrentStaff();
  const { t } = await getTranslations();
  const initials = staff?.name.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase() ?? "AOC";
  const permissionSet = new Set(staff?.permissions ?? (staff ? [...resolvePermissionCodes({ legacyRole: staff.role })] : []));
  const groups = staff?.mustChangePassword ? [] : visibleNavigation(permissionSet).map((group) => ({
    key: group.key,
    label: t(group.labelKey),
    items: group.items.map((item) => ({ key: item.key, label: t(item.labelKey), href: item.href })),
  }));

  return (
    <div className="app-shell">
      <StaffNavigation
        groups={groups}
        portal={t("staffNav.portal")}
        staffName={staff?.name ?? t("common.notConfigured")}
        roleName={staff?.roleTemplateName ?? (staff ? roleLabels[staff.role] : t("common.noAccess"))}
        staffCode={staff?.staffCode}
        sourceNote={staff?.mustChangePassword ? "Temporary password must be changed" : t("staffNav.sourceNote")}
        privacy={t("staffNav.privacy")}
      />
      <main className="main">
        <header className="topbar">
          <div className="environment">{t("staffNav.environment")}</div>
          <div className="user user-session">
            <LanguageSwitcher />
            {staff && <Link href="/staff/account/change-password" className="secondary">Password</Link>}
            <div><div className="primary">{staff?.name ?? t("common.notConfigured")}</div><span className="secondary">{staff?.roleTemplateName ?? (staff ? roleLabels[staff.role] : t("common.noAccess"))}{staff && !staff.active ? ` · ${t("common.inactive")}` : ""}</span></div>
            <div className="avatar">{initials}</div>
            <form action={logoutAdmin}><button className="logout-button" type="submit">{t("common.logout")}</button></form>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}

export const PortalShell = StaffPortalShell;

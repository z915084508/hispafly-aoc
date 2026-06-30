import Link from "next/link";
import Image from "next/image";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { roleLabels } from "@/lib/staff/permissions";
import { logoutAdmin } from "@/app/admin-login/actions";

const navItems = [
  ["Panel de control", "/staff"],
  ["Pilotos", "/staff/pilots"],
  ["PIREPs", "/staff/pireps"],
  ["Ofertas de vuelo", "/staff/flight-offers"],
  ["Nóminas", "/staff/payroll"],
  ["Economía de la compañía", "/staff/wallet"],
  ["Gastos compañía", "/staff/expenses"],
  ["Reglas gastos", "/staff/expenses/rules"],
  ["Registro de auditoría", "/staff/audit"],
  ["Conexión vAMSYS", "/staff/settings/vamsys"],
  ["Configuración", "/staff/settings"],
  ["Operations API", "/staff/settings/operations"],
] as const;

export async function StaffPortalShell({ children }: { children: React.ReactNode }) {
  const staff = await getCurrentStaff();
  const initials = staff?.name.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase() ?? "AOC";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo"><Image src="/logo-hispafly-full.png" alt="HISPAFLY" width={1800} height={400} priority /></div>
          <div className="brand-subtitle">AOC · Portal de operaciones</div>
        </div>
        <div className="nav-label">Área de trabajo</div>
        <nav className="nav-list">{navItems.map(([label, href]) => <Link className="nav-item" href={href} key={href}>{label}</Link>)}</nav>
        <div className="sidebar-note">PEGASUS ACARS y vAMSYS siguen siendo la fuente oficial de los PIREPs aceptados.<br/><Link href="/privacy">Política de privacidad</Link></div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="environment">Portal AOC · Entorno de desarrollo</div>
          <div className="user user-session"><div><div className="primary">{staff?.name ?? "Usuario no configurado"}</div><span className="secondary">{staff ? roleLabels[staff.role] : "Sin acceso"}{staff && !staff.active ? " · Inactivo" : ""}</span></div><div className="avatar">{initials}</div><form action={logoutAdmin}><button className="logout-button" type="submit">Salir</button></form></div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}

export const PortalShell = StaffPortalShell;

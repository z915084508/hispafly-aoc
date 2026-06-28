import Link from "next/link";
import Image from "next/image";

const navItems = [
  ["Panel de control", "/"],
  ["Pilotos", "/pilots"],
  ["PIREPs", "/pireps"],
  ["Nóminas", "/payroll"],
  ["Movimientos", "/wallet"],
  ["Configuración", "/settings"],
] as const;

export function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">
            <Image src="/logo-hispafly-full.png" alt="HISPAFLY" width={1800} height={400} priority />
          </div>
          <div className="brand-subtitle">AOC · Portal de operaciones</div>
        </div>
        <div className="nav-label">Área de trabajo</div>
        <nav className="nav-list">
          {navItems.map(([label, href]) => <Link className="nav-item" href={href} key={href}>{label}</Link>)}
        </nav>
        <div className="sidebar-note">Los datos de esta vista previa son simulados. PEGASUS ACARS y vAMSYS siguen siendo la fuente oficial de los PIREPs aceptados.</div>
      </aside>
      <main className="main">
        <header className="topbar"><div className="environment">Portal AOC · Entorno de prueba</div><div className="user"><div><div className="primary">Administrador de operaciones</div><span className="secondary">Personal AOC</span></div><div className="avatar">AO</div></div></header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}

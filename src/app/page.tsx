import Image from "next/image";
import Link from "next/link";

export default function PortalGateway() {
  return (
    <main className="portal-gateway portal-selection">
      <div className="gateway-brand">
        <Image src="/logo-hispafly-full.png" alt="HISPAFLY" width={1800} height={400} priority />
        <p>AOC · AIRLINE OPERATIONS CENTER</p>
      </div>

      <section className="gateway-hero">
        <p className="eyebrow">SELECCIONA TU PORTAL</p>
        <h1>HISPAFLY AOC</h1>
        <p className="page-copy">Acceso separado para pilotos y personal STAFF.</p>
      </section>

      <section className="gateway-portal-grid">
        <article className="gateway-card pilot-entry-card">
          <span className="gateway-card-label">PILOT PORTAL</span>
          <h2>Entrada Piloto</h2>
          <p>Accede con vAMSYS para consultar tu panel, roster, cartera y nómina personal.</p>
          <Link className="button" href="/pilot">ENTRAR COMO PILOTO →</Link>
        </article>

        <article className="gateway-card staff-entry-card">
          <span className="gateway-card-label">STAFF PORTAL</span>
          <h2>Entrada STAFF</h2>
          <p>Acceso administrativo mediante usuario y contraseña para gestionar AOC, PIREPs, nóminas y configuración.</p>
          <Link className="button" href="/admin-login?next=/staff">ENTRAR COMO STAFF →</Link>
        </article>
      </section>
    </main>
  );
}

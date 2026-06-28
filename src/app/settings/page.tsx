import Link from "next/link";
import { PageHeading } from "@/components/page-heading";

export default function SettingsPage() {
  return <>
    <PageHeading eyebrow="ADMINISTRACIÓN DEL PORTAL" title="Configuración" copy="Integraciones y parámetros operativos de HISPAFLY AOC." />
    <div className="grid two-column">
      <div className="card">
        <div className="card-header"><h2 className="card-title">Conexión de pilotos con vAMSYS</h2></div>
        <p className="page-copy">OAuth Authorization Code + PKCE, sin client secret y con tokens almacenados exclusivamente en el servidor.</p>
        <Link className="button settings-link" href="/settings/vamsys">Gestionar conexión vAMSYS</Link>
      </div>
      <div className="card">
        <div className="card-header"><h2 className="card-title">Sincronización de PIREPs</h2></div>
        <div className="notice">La sincronización real de PIREPs pertenece a Task 7 y todavía está desactivada.</div>
        <div className="field"><label>Fuente futura</label><input disabled defaultValue="PIREPs aceptados de vAMSYS · Solo lectura"/></div>
      </div>
    </div>
  </>;
}

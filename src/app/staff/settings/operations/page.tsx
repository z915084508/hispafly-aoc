import { PageHeading } from "@/components/page-heading";

export default function StaffOperationsSettingsPage() {
  return <>
    <PageHeading eyebrow="OPERATIONS API" title="Operations API" copy="Estado y configuración de la integración vAMSYS Operations." />
    <div className="card">
      <div className="card-header"><h2 className="card-title">Integración disponible</h2><span className="meta">vAMSYS Operations</span></div>
      <p className="page-copy">La sincronización automática se ejecuta mediante los cron jobs configurados en Vercel. La gestión manual de Operations API se añadirá en una siguiente iteración.</p>
    </div>
  </>;
}

import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { hasStaffPermission } from "@/lib/staff/permissions";
import { getPirepRows } from "@/lib/workflow-data";
import { syncAllPireps } from "./actions";

const value = (item: string | number | null) => item ?? "—";
const formatMinutes = (minutes: number | null) => minutes === null ? "—" : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;

export default async function PirepsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const [pireps, staff, messages] = await Promise.all([getPirepRows(), getCurrentStaff(), searchParams]);
  const canSync = Boolean(staff?.active && hasStaffPermission(staff.role, "VAMSYS_PIREP_SYNC"));
  return <>
    <PageHeading eyebrow="REGISTROS DE VUELO · SOLO LECTURA" title="PIREPs" copy="PIREPs aceptados importados de vAMSYS y registros simulados de desarrollo." />
    {messages.success && <div className="notice success-notice">{messages.success}</div>}
    {messages.error && <div className="notice error-notice">{messages.error}</div>}
    <div className="notice">PEGASUS ACARS y vAMSYS siguen siendo las fuentes oficiales. AOC solo consulta PIREPs aceptados; nunca los envía ni modifica en vAMSYS.</div>
    <div className="card sync-toolbar">
      <div><strong>Sincronización vAMSYS</strong><span>Importación manual, paginada e idempotente.</span></div>
      {canSync ? <form action={syncAllPireps}><button className="action-button" type="submit">Sincronizar todos</button></form> : <span className="meta">Requiere rol ADMIN u OPS</span>}
    </div>
    <div className="card"><DataTable
      headers={["Piloto", "Vuelo", "Indicativo", "Ruta", "Aeronave", "Red", "Tiempo", "Aterrizaje", "Puntuación", "Estado", "Origen", "Fecha", "Sincronizado"]}
      rows={pireps.map((pirep) => [
        <Identity key="pilot" primary={pirep.pilot} secondary={pirep.id} />,
        <span className="primary" key="flight">{value(pirep.flightNumber)}</span>, value(pirep.callsign), pirep.route, value(pirep.aircraftType),
        <Badge key="network" tone={pirep.network === "OFFLINE" ? "amber" : "blue"}>{value(pirep.network)}</Badge>,
        formatMinutes(pirep.flightTimeMinutes), pirep.landingRate === null ? "—" : `${pirep.landingRate} fpm`, value(pirep.score),
        <Badge key="status" tone={pirep.status === "accepted" ? "green" : "amber"}>{pirep.status === "accepted" ? "Aceptado" : "Rechazado"}</Badge>,
        <Badge key="source" tone={pirep.source === "vamsys" ? "green" : "blue"}>{pirep.source === "vamsys" ? "vAMSYS" : "Mock"}</Badge>,
        pirep.flownAt ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(pirep.flownAt) : "—",
        new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(pirep.synchronizedAt),
      ])}
    /></div>
  </>;
}

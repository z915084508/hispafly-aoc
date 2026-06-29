import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { getPirepRows } from "@/lib/workflow-data";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { hasStaffPermission } from "@/lib/staff/permissions";
import { isOperationsConfigured } from "@/lib/vamsys/operations";
import { syncAllPireps } from "./actions";

const formatMinutes = (minutes: number) => `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;

export default async function PirepsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const [pireps, staff, feedback] = await Promise.all([getPirepRows(), getCurrentStaff(), searchParams]);
  const canSync = Boolean(staff?.active && hasStaffPermission(staff.role, "VAMSYS_PIREP_SYNC") && isOperationsConfigured());

  return <>
    <PageHeading eyebrow="REGISTROS DE VUELO · SOLO LECTURA" title="PIREPs" copy="Datos aceptados de vAMSYS. AOC solo consulta y calcula nómina desde PIREPs aceptados." />
    <div className="notice">PEGASUS ACARS y vAMSYS siguen siendo las fuentes oficiales. Esta página solo sincroniza PIREPs aceptados; nunca los envía ni modifica.</div>
    {feedback.success && <div className="feedback success">{feedback.success}</div>}
    {feedback.error && <div className="feedback error">{feedback.error}</div>}
    <div className="card actions sync-toolbar">
      {canSync
        ? <form action={syncAllPireps}><button className="action-button approve" type="submit">Sincronizar PIREPs históricos</button></form>
        : <span className="meta">La sincronización requiere Operations API configurada y rol ADMIN u OPS.</span>}
    </div>
    <div className="card"><DataTable
      headers={["Piloto", "Vuelo", "Indicativo", "Ruta", "Aeronave", "Red", "Tiempo", "Aterrizaje", "Puntuación", "Estado", "Fecha"]}
      rows={pireps.map((pirep) => [
        <Identity key="pilot" primary={pirep.pilot} secondary={pirep.id} />,
        <span className="primary" key="flight">{pirep.flightNumber}</span>,
        pirep.callsign,
        pirep.route,
        pirep.aircraftType,
        <Badge key="network" tone={pirep.network === "OFFLINE" ? "amber" : "blue"}>{pirep.network}</Badge>,
        formatMinutes(pirep.flightTimeMinutes),
        `${pirep.landingRate} fpm`,
        pirep.score,
        <Badge key="status" tone={pirep.status === "accepted" ? "green" : "amber"}>{pirep.status === "accepted" ? "Aceptado" : "Rechazado"}</Badge>,
        new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(pirep.flownAt),
      ])}
    /></div>
  </>;
}

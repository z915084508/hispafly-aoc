import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { hasStaffPermission } from "@/lib/staff/permissions";
import { getPilotRows } from "@/lib/workflow-data";
import { syncPilotPireps } from "@/app/pireps/actions";

const connectionLabels = { connected: "Conectado", expired: "Caducado", revoked: "Revocado", disconnected: "Sin conectar" };
const connectionTone = (status: keyof typeof connectionLabels): "green" | "amber" | "blue" => status === "connected" ? "green" : status === "disconnected" ? "blue" : "amber";

export default async function PilotsPage() {
  const [pilots, staff] = await Promise.all([getPilotRows(), getCurrentStaff()]);
  const canSync = Boolean(staff?.active && hasStaffPermission(staff.role, "VAMSYS_PIREP_SYNC"));
  return <>
    <PageHeading eyebrow="DIRECTORIO DE TRIPULACIONES" title="Pilotos" copy="Estado local, conexión vAMSYS y última importación de PIREPs aceptados." />
    <div className="card"><DataTable headers={["Piloto", "Rango", "Base", "Estado", "Saldo", "vAMSYS", "Última sincronización", "Acción"]} rows={pilots.map((pilot) => [
      <Identity key="identity" primary={pilot.name} secondary={pilot.callsign ?? pilot.externalId} />, pilot.rank, pilot.base,
      <Badge key="status" tone={pilot.status === "active" ? "green" : "amber"}>{pilot.status === "active" ? "Activo" : "Inactivo"}</Badge>,
      `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(pilot.balanceCents / 100)} cr`,
      <Badge key="connection" tone={connectionTone(pilot.connectionStatus)}>{connectionLabels[pilot.connectionStatus]}</Badge>,
      pilot.lastPirepSyncAt ? new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(pilot.lastPirepSyncAt) : "Nunca",
      canSync && pilot.connectionStatus !== "disconnected" && pilot.connectionStatus !== "revoked" ? <form action={syncPilotPireps} key="action"><input type="hidden" name="pilotId" value={pilot.id} /><button className="table-action" type="submit">Sincronizar</button></form> : <span className="meta" key="none">—</span>,
    ])} /></div>
  </>;
}

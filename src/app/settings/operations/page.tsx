import { Badge } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { prisma } from "@/lib/prisma";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { hasStaffPermission } from "@/lib/staff/permissions";
import { isOperationsConfigured } from "@/lib/vamsys/operations";
import { syncOperationsPilotDirectory, testOperationsConnection } from "./actions";

export default async function OperationsSettings({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const [feedback, staff, state] = await Promise.all([searchParams, getCurrentStaff(), prisma.operationsApiState.findUnique({ where: { id: "vamsys" } }).catch(() => null)]);
  const canManage = Boolean(staff?.active && hasStaffPermission(staff.role, "VAMSYS_OPERATIONS_SYNC")); const configured = isOperationsConfigured();
  return <><PageHeading eyebrow="INTEGRACIÓN SERVER-TO-SERVER" title="vAMSYS Operations API" copy="Directorio de pilotos y notas administrativas en modo de lectura." />
    {feedback.success && <div className="feedback success">{feedback.success}</div>}{feedback.error && <div className="feedback error">{feedback.error}</div>}
    {!configured && <div className="notice">Añade el Client ID y el nuevo Client Secret exclusivamente en las variables del servidor.</div>}
    <div className="card oauth-connect-card"><div><h2 className="card-title">Estado de conexión</h2><p className="page-copy">Token Client Credentials de siete días. El secreto nunca llega al navegador.</p></div><Badge tone={state?.status === "healthy" ? "green" : state?.status === "degraded" ? "amber" : "red"}>{configured ? state?.status ?? "Sin comprobar" : "No configurado"}</Badge></div>
    <div className="card actions">{canManage && configured ? <><form action={testOperationsConnection}><button className="action-button" type="submit">Comprobar conexión</button></form><form action={syncOperationsPilotDirectory}><button className="action-button approve" type="submit">Sincronizar pilotos y notas</button></form></> : <span className="meta">Requiere configuración y rol ADMIN u OPS.</span>}</div>
    <div className="card settings-link"><div className="workflow-summary"><div><strong>{state?.lastCheckedAt ? new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(state.lastCheckedAt) : "Nunca"}</strong><span>Última comprobación</span></div><div><strong>{state?.lastPilotSyncAt ? new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(state.lastPilotSyncAt) : "Nunca"}</strong><span>Última sincronización</span></div><div><strong>100/min</strong><span>Límite compartido de vAMSYS</span></div></div></div>
  </>;
}

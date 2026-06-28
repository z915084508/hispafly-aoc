import { DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { getAuditFilterOptions, getAuditRows } from "@/lib/workflow-data";

const actionLabels: Record<string, string> = {
  PAYROLL_APPROVED: "Nómina aprobada",
  PAYROLL_REJECTED: "Nómina rechazada",
  PAYROLL_MARKED_PAID: "Nómina pagada",
  PAYROLL_RECALCULATED: "Nómina recalculada",
  WALLET_TRANSACTION_CREATED: "Movimiento creado",
  PERMISSION_DENIED: "Permiso denegado",
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; staff?: string }> }) {
  const filters = await searchParams;
  const [rows, options] = await Promise.all([getAuditRows({ action: filters.action, staffUserId: filters.staff }), getAuditFilterOptions()]);
  return <>
    <PageHeading eyebrow="CONTROL Y TRAZABILIDAD" title="Registro de auditoría" copy="Acciones del personal AOC y cambios sensibles del flujo de nómina." />
    <form className="audit-filters" method="get">
      <label>Acción<select name="action" defaultValue={filters.action ?? ""}><option value="">Todas</option>{options.actions.map((action) => <option value={action} key={action}>{actionLabels[action] ?? action}</option>)}</select></label>
      <label>Usuario<select name="staff" defaultValue={filters.staff ?? ""}><option value="">Todos</option>{options.staff.map((staff) => <option value={staff.id} key={staff.id}>{staff.name}</option>)}</select></label>
      <button className="action-button" type="submit">Aplicar filtros</button>
    </form>
    <div className="card"><DataTable
      headers={["Fecha y hora", "Usuario", "Acción", "Entidad", "ID", "Mensaje"]}
      rows={rows.map((row) => [
        new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "medium", timeZone: "UTC" }).format(row.createdAt) + " UTC",
        <Identity key="staff" primary={row.staffName} secondary={row.id} />,
        actionLabels[row.action] ?? row.action,
        row.entityType,
        row.entityId ?? "—",
        <span className="audit-message" key="message">{row.message}</span>,
      ])}
    /></div>
  </>;
}

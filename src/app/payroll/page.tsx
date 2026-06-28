import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { canMutatePayroll, getPayrollRows } from "@/lib/workflow-data";
import { approvePayroll, markPayrollPaid, rejectPayroll } from "./actions";

const credits = (cents: number) => `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(cents / 100)} cr`;
const statusLabels: Record<string, string> = { pending: "Pendiente", approved: "Aprobado", rejected: "Rechazado", paid: "Pagado" };

export default async function PayrollPage() {
  const payroll = await getPayrollRows();
  return <>
    <PageHeading eyebrow="COMPENSACIÓN VIRTUAL" title="Nóminas" copy="Un registro por PIREP aceptado, calculado con reglas versionadas." />
    {!canMutatePayroll && <div className="notice">Vista de demostración: configura PostgreSQL y ejecuta la semilla para activar Aprobar, Rechazar y Marcar como pagado.</div>}
    <div className="card"><DataTable
      headers={["Piloto", "Vuelo", "Aeronave", "Base", "Bonificación", "Penalización", "Importe final", "Estado", "Mes", "Acciones"]}
      rows={payroll.map((record) => [
        <Identity key="pilot" primary={record.pilot} secondary={record.id} />,
        record.flightNumber,
        record.aircraftType,
        credits(record.basePayCents),
        <span key="bonus" className="amount-positive">+{credits(record.bonusCents)}</span>,
        <span key="penalty" className={record.penaltyCents ? "amount-negative" : ""}>−{credits(record.penaltyCents)}</span>,
        <strong key="amount">{credits(record.amountCents)}</strong>,
        <Badge key="status" tone={record.status === "paid" ? "green" : record.status === "rejected" ? "amber" : "blue"}>{statusLabels[record.status] ?? record.status}</Badge>,
        record.settlementMonth,
        <div className="actions" key="actions">
          <form action={approvePayroll}><input type="hidden" name="payrollId" value={record.id}/><button className="action-button approve" disabled={!canMutatePayroll || record.status !== "pending"}>Aprobar</button></form>
          <form action={rejectPayroll}><input type="hidden" name="payrollId" value={record.id}/><button className="action-button reject" disabled={!canMutatePayroll || !["pending", "approved"].includes(record.status)}>Rechazar</button></form>
          <form action={markPayrollPaid}><input type="hidden" name="payrollId" value={record.id}/><button className="action-button pay" disabled={!canMutatePayroll || record.status !== "approved"}>Pagar</button></form>
        </div>,
      ])}
    /></div>
  </>;
}
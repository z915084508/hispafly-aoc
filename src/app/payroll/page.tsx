import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { canMutatePayroll, getPayrollRows } from "@/lib/workflow-data";
import { approvePayroll, markPayrollPaid, recalculatePayroll, rejectPayroll } from "./actions";

const credits = (cents: number) => `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(cents / 100)} cr`;
const statusLabels: Record<string, string> = { pending: "Pendiente", approved: "Aprobado", rejected: "Rechazado", paid: "Pagado" };

export default async function PayrollPage() {
  const payroll = await getPayrollRows();
  return <>
    <PageHeading eyebrow="COMPENSACI脫N VIRTUAL" title="N贸minas" copy="Un registro por PIREP aceptado, calculado con reglas versionadas y explicaci贸n completa." />
    {!canMutatePayroll && <div className="notice">Vista de demostraci贸n: configura PostgreSQL y ejecuta la semilla para activar las acciones de n贸mina.</div>}
    <div className="card"><DataTable
      headers={["Piloto", "Vuelo", "Aeronave", "Base", "Bonificaci贸n", "Penalizaci贸n", "Importe final", "Estado", "Mes", "C谩lculo y acciones"]}
      rows={payroll.map((record) => [
        <Identity key="pilot" primary={record.pilot} secondary={record.id} />,
        record.flightNumber,
        record.aircraftType,
        credits(record.basePayCents),
        <span key="bonus" className="amount-positive">+{credits(record.bonusCents)}</span>,
        <span key="penalty" className={record.penaltyCents ? "amount-negative" : ""}>鈭抺credits(record.penaltyCents)}</span>,
        <strong key="amount">{credits(record.amountCents)}</strong>,
        <Badge key="status" tone={record.status === "paid" ? "green" : record.status === "rejected" ? "amber" : "blue"}>{statusLabels[record.status] ?? record.status}</Badge>,
        record.settlementMonth,
        <div className="actions" key="actions">
          <details className="calculation-details">
            <summary>Ver c谩lculo</summary>
            <div className="calculation-panel">
              <div className="calculation-grid">
                <span>Base <strong>{credits(record.basePayCents)}</strong></span>
                <span>Aeronave <strong>+{credits(record.calculation.aircraftBonusCents)}</strong></span>
                <span>Red <strong>+{credits(record.calculation.networkBonusCents)}</strong></span>
                <span>Aterrizaje <strong>+{credits(record.calculation.landingBonusCents)}</strong></span>
                <span>Puntuaci贸n <strong>+{credits(record.calculation.scoreBonusCents)}</strong></span>
                <span>Penalizaciones <strong>鈭抺credits(record.penaltyCents)}</strong></span>
                <span>Final <strong>{credits(record.amountCents)}</strong></span>
              </div>
              <ul>{record.calculation.explanation.map((line) => <li key={line}>{line}</li>)}</ul>
            </div>
          </details>
          <form action={recalculatePayroll}><input type="hidden" name="payrollId" value={record.id}/><button className="action-button recalculate" disabled={!canMutatePayroll || record.status !== "pending"}>Recalcular</button></form>
          <form action={approvePayroll}><input type="hidden" name="payrollId" value={record.id}/><button className="action-button approve" disabled={!canMutatePayroll || record.status !== "pending"}>Aprobar</button></form>
          <form action={rejectPayroll}><input type="hidden" name="payrollId" value={record.id}/><button className="action-button reject" disabled={!canMutatePayroll || !["pending", "approved"].includes(record.status)}>Rechazar</button></form>
          <form action={markPayrollPaid}><input type="hidden" name="payrollId" value={record.id}/><button className="action-button pay" disabled={!canMutatePayroll || record.status !== "approved"}>Pagar</button></form>
        </div>,
      ])}
    /></div>
  </>;
}

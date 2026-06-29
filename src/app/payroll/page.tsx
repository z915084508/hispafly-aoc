import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { canMutatePayroll, getPayrollRows } from "@/lib/workflow-data";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { hasStaffPermission } from "@/lib/staff/permissions";
import { approvePayroll, markPayrollPaid, recalculatePayroll, rejectPayroll } from "./actions";

const credits = (cents: number) => `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(cents / 100)} cr`;
const statusLabels: Record<string, string> = { pending: "Pendiente", approved: "Aprobado", rejected: "Rechazado", paid: "Pagado" };
const statusTones = { pending: "amber", approved: "blue", rejected: "red", paid: "green" } as const;

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const [payroll, staff, feedback] = await Promise.all([getPayrollRows(), getCurrentStaff(), searchParams]);
  const canReview = Boolean(canMutatePayroll && staff?.active && hasStaffPermission(staff.role, "PAYROLL_APPROVE"));
  const canPay = Boolean(canMutatePayroll && staff?.active && hasStaffPermission(staff.role, "PAYROLL_MARK_PAID"));

  return <>
    <PageHeading eyebrow="COMPENSACIÓN VIRTUAL" title="Nóminas" copy="Acciones protegidas por rol y registradas para auditoría." />
    {feedback.success && <div className="feedback success">{feedback.success}</div>}
    {feedback.error && <div className="feedback error">{feedback.error}</div>}
    {!canMutatePayroll && <div className="notice">Vista de demostración: configura PostgreSQL y ejecuta la semilla para activar las acciones de nómina.</div>}
    <div className="card"><DataTable
      headers={["Piloto", "Vuelo", "Aeronave", "Base", "Bonificación", "Penalización", "Importe final", "Estado", "Mes", "Cálculo y acciones"]}
      rows={payroll.map((record) => {
        const actionsAvailable = (record.status === "pending" && canReview) || (record.status === "approved" && canPay);
        return [
          <Identity key="pilot" primary={record.pilot} secondary={record.id} />,
          record.flightNumber,
          record.aircraftType,
          credits(record.basePayCents),
          <span key="bonus" className="amount-positive">+{credits(record.bonusCents)}</span>,
          <span key="penalty" className={record.penaltyCents ? "amount-negative" : ""}>−{credits(record.penaltyCents)}</span>,
          <strong key="amount">{credits(record.amountCents)}</strong>,
          <Badge key="status" tone={statusTones[record.status as keyof typeof statusTones] ?? "gray"}>{statusLabels[record.status] ?? record.status}</Badge>,
          record.settlementMonth,
          <div className="actions" key="actions">
            <details className="calculation-details">
              <summary>Ver cálculo</summary>
              <div className="calculation-panel">
                <div className="calculation-grid">
                  <span>Base <strong>{credits(record.basePayCents)}</strong></span>
                  <span>Aeronave <strong>+{credits(record.calculation.aircraftBonusCents)}</strong></span>
                  <span>Red <strong>+{credits(record.calculation.networkBonusCents)}</strong></span>
                  <span>Aterrizaje <strong>+{credits(record.calculation.landingBonusCents)}</strong></span>
                  <span>Puntuación <strong>+{credits(record.calculation.scoreBonusCents)}</strong></span>
                  <span>Penalizaciones <strong>−{credits(record.penaltyCents)}</strong></span>
                  <span>Final <strong>{credits(record.amountCents)}</strong></span>
                </div>
                <ul>{record.calculation.explanation.map((line) => <li key={line}>{line}</li>)}</ul>
              </div>
            </details>
            {record.status === "pending" && canReview && <>
              <form action={recalculatePayroll}><input type="hidden" name="payrollId" value={record.id}/><button className="action-button recalculate">Recalcular</button></form>
              <form action={approvePayroll}><input type="hidden" name="payrollId" value={record.id}/><button className="action-button approve">Aprobar</button></form>
              <form action={rejectPayroll}><input type="hidden" name="payrollId" value={record.id}/><button className="action-button reject">Rechazar</button></form>
            </>}
            {record.status === "approved" && canPay && <form action={markPayrollPaid}><input type="hidden" name="payrollId" value={record.id}/><button className="action-button pay">Pagar</button></form>}
            {!actionsAvailable && <span className="no-actions">Solo lectura</span>}
          </div>,
        ];
      })}
    /></div>
  </>;
}

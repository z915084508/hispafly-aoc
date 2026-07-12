import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { SelectAllCheckbox } from "@/components/bulk-select";
import { canMutatePayroll, getPayrollRows } from "@/lib/workflow-data";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { staffHasPermission } from "@/lib/staff/permissions";
import { approvePayroll, bulkApprovePayroll, bulkMarkPayrollPaid, bulkRejectPayroll, markPayrollPaid, recalculatePayroll, rejectPayroll } from "./actions";
import { generateMissingPayroll } from "./backfill-actions";

const credits = (cents: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(cents / 100);
const statusLabels: Record<string, string> = { pending: "Pendiente", approved: "Aprobado", rejected: "Rechazado", paid: "Pagado" };
const statusTones = { pending: "amber", approved: "blue", rejected: "red", paid: "green" } as const;

type PayrollSearchParams = { success?: string; error?: string; q?: string; status?: string; month?: string; aircraft?: string };

function includesText(value: unknown, query: string) {
  return String(value ?? "").toLowerCase().includes(query);
}

export default async function PayrollPage({ searchParams }: { searchParams: Promise<PayrollSearchParams> }) {
  const [payroll, staff, filters] = await Promise.all([getPayrollRows(), getCurrentStaff(), searchParams]);
  const canReview = Boolean(canMutatePayroll && staff?.active && staffHasPermission(staff, "PAYROLL_APPROVE"));
  const canPay = Boolean(canMutatePayroll && staff?.active && staffHasPermission(staff, "PAYROLL_MARK_PAID"));
  const canBackfill = Boolean(canMutatePayroll && staff?.active && staffHasPermission(staff, "PAYROLL_RECALCULATE"));
  const bulkEnabled = canReview || canPay || canBackfill;
  const q = (filters.q ?? "").trim().toLowerCase();
  const selectedStatus = filters.status ?? "";
  const selectedMonth = filters.month ?? "";
  const selectedAircraft = filters.aircraft ?? "";
  const monthOptions = [...new Set(payroll.map((record) => record.settlementMonth).filter(Boolean))].sort().reverse();
  const aircraftOptions = [...new Set(payroll.map((record) => record.aircraftType).filter(Boolean))].sort();
  const filteredPayroll = payroll.filter((record) => {
    const textMatch = !q || includesText(record.pilot, q) || includesText(record.pilotReference, q) || includesText(record.flightNumber, q) || includesText(record.aircraftType, q);
    const statusMatch = !selectedStatus || record.status === selectedStatus;
    const monthMatch = !selectedMonth || record.settlementMonth === selectedMonth;
    const aircraftMatch = !selectedAircraft || record.aircraftType === selectedAircraft;
    return textMatch && statusMatch && monthMatch && aircraftMatch;
  });

  return <>
    <style>{`
      .staff-data-tools { display: grid; gap: 14px; margin-bottom: 18px; }
      .filter-card { display: grid; grid-template-columns: minmax(220px, 1.4fr) repeat(3, minmax(150px, .7fr)) auto auto; gap: 12px; align-items: end; }
      .filter-field { display: grid; gap: 7px; }
      .filter-field label { color: var(--muted); font-size: 10px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
      .filter-field input, .filter-field select { width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: 11px 12px; background: #fbfcfe; color: var(--ink); }
      .filter-meta { color: var(--muted); font-size: 12px; }
      .bulk-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 18px; padding: 14px 16px; }
      .bulk-toolbar-main { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .bulk-toolbar-title { font-size: 12px; font-weight: 850; color: #152238; }
      .bulk-toolbar-hint { color: var(--muted); font-size: 11px; }
      .bulk-check { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 850; color: #152238; white-space: nowrap; }
      .bulk-check input, .row-check input { width: 16px; height: 16px; accent-color: #d71920; }
      .row-check { display: inline-flex; align-items: center; justify-content: center; width: 22px; }
      .row-check input:disabled { opacity: .3; cursor: not-allowed; }
      .bulk-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .data-card { overflow: hidden; padding: 0; }
      .data-card .table-wrap { width: 100%; max-width: 100%; overflow-x: auto; padding: 18px 20px 20px; }
      .data-card table { min-width: 1320px; }
      .data-card th, .data-card td { padding-left: 10px; padding-right: 10px; }
      .actions { flex-wrap: wrap; }
      .calculation-panel { right: auto; left: 0; }
      .empty-state { padding: 24px; color: var(--muted); font-size: 13px; }
      @media (max-width: 1280px) { .content { padding: 28px 24px; max-width: none; } .data-card table { min-width: 1240px; } .bulk-toolbar { align-items: flex-start; flex-direction: column; } }
      @media (max-width: 1180px) { .app-shell { grid-template-columns: 1fr; } .sidebar { position: static; height: auto; } .nav-list { grid-template-columns: repeat(3, minmax(0, 1fr)); } .sidebar-note { display: none; } .filter-card { grid-template-columns: 1fr 1fr; } }
      @media (max-width: 720px) { .filter-card { grid-template-columns: 1fr; } .content { padding: 22px 14px; } .topbar { height: auto; padding: 16px; align-items: flex-start; gap: 14px; flex-direction: column; } .data-card .table-wrap { padding: 14px; } .bulk-actions { width: 100%; } .bulk-actions .action-button { flex: 1; text-align: center; justify-content: center; } }
    `}</style>
    <PageHeading eyebrow="NÓMINA EUR" title="Nóminas" copy="Importes en euros, acciones protegidas por rol y registradas para auditoría." />
    {filters.success && <div className="feedback success">{filters.success}</div>}
    {filters.error && <div className="feedback error">{filters.error}</div>}
    {!canMutatePayroll && <div className="notice">Vista de demostración: configura PostgreSQL y ejecuta la semilla para activar las acciones de nómina.</div>}
    <div className="staff-data-tools">
      <form className="card filter-card" method="get">
        <div className="filter-field"><label>Buscar</label><input name="q" defaultValue={filters.q ?? ""} placeholder="Piloto, indicativo, vAMSYS ID, vuelo..." /></div>
        <div className="filter-field"><label>Estado</label><select name="status" defaultValue={selectedStatus}><option value="">Todos</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
        <div className="filter-field"><label>Mes</label><select name="month" defaultValue={selectedMonth}><option value="">Todos</option>{monthOptions.map((month) => <option value={month} key={month}>{month}</option>)}</select></div>
        <div className="filter-field"><label>Aeronave</label><select name="aircraft" defaultValue={selectedAircraft}><option value="">Todas</option>{aircraftOptions.map((aircraft) => <option value={aircraft} key={aircraft}>{aircraft}</option>)}</select></div>
        <button className="action-button approve" type="submit">Filtrar</button>
        <a className="action-button" href="?">Limpiar</a>
      </form>
      <div className="filter-meta">Mostrando {filteredPayroll.length} de {payroll.length} nóminas.</div>
    </div>
    {bulkEnabled && <form id="bulk-payroll-form" className="card bulk-toolbar" action={bulkApprovePayroll}>
      <div>
        <div className="bulk-toolbar-title">Acciones en lote</div>
        <div className="bulk-toolbar-hint">Selecciona varias nóminas para aprobar, pagar o rechazar. Si faltan nóminas de PIREPs aceptados, genera las pendientes desde vAMSYS ya sincronizado.</div>
      </div>
      <div className="bulk-actions">
        {canBackfill && <button className="action-button recalculate" formAction={generateMissingPayroll}>Generar nóminas faltantes</button>}
        {canReview && <button className="action-button approve" formAction={bulkApprovePayroll}>Aprobar seleccionadas</button>}
        {canPay && <button className="action-button pay" formAction={bulkMarkPayrollPaid}>Pagar seleccionadas</button>}
        {canReview && <button className="action-button reject" formAction={bulkRejectPayroll}>Rechazar seleccionadas</button>}
      </div>
    </form>}
    <div className="card data-card">{filteredPayroll.length ? <DataTable
      headers={[bulkEnabled ? <SelectAllCheckbox key="select-all" group="payroll" label="Todos" /> : "", "Piloto", "Vuelo", "Aeronave", "Base", "Bonificación", "Penalización", "Importe final", "Estado", "Mes", "Cálculo y acciones"]}
      rows={filteredPayroll.map((record) => {
        const actionsAvailable = (record.status === "pending" && canReview) || (record.status === "approved" && canPay);
        const isBulkSelectable = (record.status === "pending" && canReview) || (record.status === "approved" && canPay);
        return [
          bulkEnabled ? <label className="row-check" key="select"><input form="bulk-payroll-form" data-select-group="payroll" type="checkbox" name="payrollIds" value={record.id} disabled={!isBulkSelectable} aria-label={`Seleccionar nómina ${record.flightNumber}`} /></label> : null,
          <Identity key="pilot" primary={record.pilot} secondary={record.pilotReference} />,
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
    /> : <div className="empty-state">No hay nóminas que coincidan con los filtros.</div>}</div>
  </>;
}

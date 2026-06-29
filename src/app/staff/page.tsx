import { PageHeading } from "@/components/page-heading";
import { getDashboardSummary } from "@/lib/workflow-data";

const credits = (cents: number) => `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(cents / 100)} cr`;
const integer = (value: number) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value);
const decimal = (value: number) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value);

export default async function StaffDashboard() {
  const summary = await getDashboardSummary();
  const annual = summary.annualCompany;
  const monthlyStats = [
    ["PIREPs aceptados este mes", String(summary.acceptedPireps), "Solo registros aceptados"],
    ["Pendiente total", credits(summary.pendingCents), "Pendiente de revisión"],
    ["Aprobada total", credits(summary.approvedCents), "Lista para pagar"],
    ["Pagado este mes", credits(summary.paidCents), "Según fecha de pago"],
    ["Pagado hoy", credits(summary.paidTodayCents), `${summary.paidTodayCount} nóminas pagadas hoy`],
    ["Coste periodo actual", credits(summary.totalCostCents), "Según mes de liquidación"],
  ];
  const annualStats = [
    ["Ingresos anuales", credits(annual.revenueCents), "Revenue virtual por pasajeros"],
    ["Gastos anuales", credits(annual.expenseCents), "Coste de nóminas generadas"],
    ["Beneficio anual", credits(annual.profitCents), annual.profitCents >= 0 ? "Resultado operativo positivo" : "Resultado operativo negativo"],
    ["Vuelos anuales", integer(annual.flightCount), `${decimal(annual.flightHours)} h voladas`],
    ["Pasajeros transportados", integer(annual.passengers), `${integer(annual.distanceNm)} NM acumuladas`],
    ["Carga transportada", `${integer(annual.cargoKg)} kg`, annual.cargoDataAvailable ? "Datos reales Operations API" : "Pendiente de mapear cargo API"],
  ];
  return <>
    <style>{`
      .dashboard-section { margin-top: 18px; }
      .annual-company-card { margin-top: 18px; }
      .annual-company-card .card-header { margin-bottom: 18px; }
      .annual-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .annual-stats .stat-value { font-size: 25px; }
      .stat-note.warn { color: #926200; }
      @media (max-width: 1180px) { .annual-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 720px) { .annual-stats { grid-template-columns: 1fr; } }
    `}</style>
    <PageHeading eyebrow="RESUMEN DE OPERACIONES" title="Panel AOC" copy="PIREPs aceptados, estado de nóminas y clasificación mensual." />

    <section className="grid stats">{monthlyStats.map(([label, value, note]) => <div className="card" key={label}><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>)}</section>

    <section className="card annual-company-card">
      <div className="card-header"><h2 className="card-title">Resumen económico anual de compañía</h2><span className="meta">Año {annual.year}</span></div>
      <div className="grid annual-stats">{annualStats.map(([label, value, note]) => <div className="card" key={label}><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className={`stat-note ${String(note).startsWith("Pendiente") ? "warn" : ""}`}>{note}</div></div>)}</div>
    </section>

    <section className="card workflow-card dashboard-section">
      <div className="card-header"><h2 className="card-title">Cola de trabajo por rol</h2><span className="meta">Estado actual</span></div>
      <div className="workflow-summary">
        <div><strong>{summary.pendingReviewCount}</strong><span>Pendientes de revisión OPS</span></div>
        <div><strong>{summary.approvedPaymentCount}</strong><span>Aprobadas para pago FINANCE</span></div>
        <div><strong>{summary.paidThisMonthCount}</strong><span>Pagadas este mes por fecha de pago</span></div>
      </div>
    </section>
    <section className="card ranking-card">
      <div className="card-header"><h2 className="card-title">Top 5 pilotos por nómina pagada</h2><span className="meta">Mes actual</span></div>
      <div className="ranking-list">{summary.topPilots.map(([pilot, amount], index) => <div className="ranking-row" key={pilot}><span className="ranking-position">{index + 1}</span><span className="primary">{pilot}</span><strong>{credits(amount)}</strong></div>)}</div>
    </section>
  </>;
}

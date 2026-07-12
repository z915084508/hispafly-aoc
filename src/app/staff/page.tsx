import { PageHeading } from "@/components/page-heading";
import { getDashboardSummary } from "@/lib/workflow-data";
import { prisma } from "@/lib/prisma";
import { getTranslations } from "@/lib/i18n/server";
import { formatCurrency, formatNumber } from "@/lib/i18n/core";
import {requireStaffPermission} from "@/lib/staff/authorization";

export const dynamic = "force-dynamic";

export default async function StaffDashboard() {
  await requireStaffPermission("DASHBOARD_VIEW",{entityType:"StaffDashboard",attemptedAction:"view dashboard"});
  const { t, locale } = await getTranslations();
  const money = (cents: number) => formatCurrency(cents, locale);
  const integer = (value: number) => formatNumber(value, locale, { maximumFractionDigits: 0 });
  const decimal = (value: number) => formatNumber(value, locale, { maximumFractionDigits: 1 });
  const [summary, activeOffers, dispatchedOffers, completedDispatches, rewardTotal] = await Promise.all([
    getDashboardSummary(),
    prisma.flightOffer.count({ where: { status: "PUBLISHED", validUntil: { gt: new Date() } } }),
    prisma.flightOffer.count({ where: { status: "DISPATCHED" } }),
    prisma.flightDispatch.count({ where: { status: { in: ["FLOWN", "REWARDED"] } } }),
    prisma.walletTransaction.aggregate({ where: { flightDispatchId: { not: null } }, _sum: { amountCents: true } }),
  ]);
  const annual = summary.annualCompany;
  const monthlyStats = [
    ["PIREPs aceptados este mes", String(summary.acceptedPireps), "Solo registros aceptados"],
    ["Pendiente total", money(summary.pendingCents), "Pendiente de revisión"],
    ["Aprobada total", money(summary.approvedCents), "Lista para pagar"],
    ["Pagado este mes", money(summary.paidCents), "Según fecha de pago"],
    ["Pagado hoy", money(summary.paidTodayCents), `${summary.paidTodayCount} nóminas pagadas hoy`],
    ["Coste periodo actual", money(summary.totalCostCents), "Según mes de liquidación"],
  ];
  const annualStats = [
    ["Ingresos anuales", money(annual.revenueCents), "Revenue por pasajeros"],
    ["Gastos anuales", money(annual.expenseCents), "Nómina + fuel + CompanyExpense"],
    ["Beneficio anual", money(annual.profitCents), annual.profitCents >= 0 ? "Resultado operativo positivo" : "Resultado operativo negativo"],
    ["Coste nóminas", money(annual.payrollExpenseCents), "PayrollRecord anual"],
    ["Coste fuel", money(annual.fuelExpenseCents), "Snapshot guardado en PIREP"],
    ["Airport / ATC / handling", money(annual.companyExpenseCents), "CompanyExpense generado"],
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
    <PageHeading eyebrow={t("dashboard.staffEyebrow")} title={t("dashboard.staffTitle")} copy={t("dashboard.staffCopy")} />

    <section className="grid stats">{monthlyStats.map(([label, value, note]) => <div className="card" key={label}><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>)}</section>
    <section className="grid stats dashboard-section">
      <div className="card"><div className="stat-label">Ofertas activas</div><div className="stat-value">{activeOffers}</div><div className="stat-note">Publicadas y vigentes</div></div>
      <div className="card"><div className="stat-label">Ofertas despachadas</div><div className="stat-value">{dispatchedOffers}</div><div className="stat-note">Booking creado en vAMSYS</div></div>
      <div className="card"><div className="stat-label">Misiones completadas</div><div className="stat-value">{completedDispatches}</div><div className="stat-note">PIREP accepted emparejado</div></div>
      <div className="card"><div className="stat-label">Mission rewards</div><div className="stat-value">{money(rewardTotal._sum.amountCents ?? 0)}</div><div className="stat-note">Bonificaciones abonadas</div></div>
    </section>

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
      <div className="ranking-list">{summary.topPilots.map(([pilot, amount], index) => <div className="ranking-row" key={pilot}><span className="ranking-position">{index + 1}</span><span className="primary">{pilot}</span><strong>{money(amount)}</strong></div>)}</div>
    </section>
  </>;
}

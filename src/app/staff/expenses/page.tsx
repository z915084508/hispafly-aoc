import Link from "next/link";
import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const money = (cents: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(cents / 100);
const expenseLabels: Record<string, string> = {
  airport_landing: "Landing fee",
  airport_passenger: "Passenger fee",
  airport_service: "Passenger service",
  airport_parking: "Parking",
  handling: "Handling",
  cargo_handling: "Cargo handling",
  atc_enroute: "ATC enroute",
  atc_terminal: "ATC terminal",
};

function route(departure: string | null, arrival: string | null) {
  return departure || arrival ? `${departure ?? "—"}-${arrival ?? "—"}` : "—";
}

function detailSummary(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "—";
  const row = value as Record<string, unknown>;
  const parts = [
    row.airportIcao ? `Airport ${row.airportIcao}` : null,
    row.region ? `Region ${row.region}` : null,
    typeof row.passengers === "number" ? `${row.passengers} pax` : null,
    typeof row.cargoKg === "number" ? `${row.cargoKg} kg cargo` : null,
    typeof row.distanceNm === "number" ? `${row.distanceNm} NM` : null,
    typeof row.mtowKg === "number" ? `${Math.round(row.mtowKg / 1000)} t MTOW` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Configured rule";
}

async function getExpenses() {
  if (!process.env.DATABASE_URL) return [];
  return prisma.companyExpense.findMany({
    include: { pirep: { select: { flightNumber: true, departure: true, arrival: true, aircraftType: true, flownAt: true, createdAt: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  }).catch(() => []);
}

export default async function StaffExpensesPage() {
  const expenses = await getExpenses();
  const total = expenses.reduce((sum, row) => sum + row.amountCents, 0);
  const airportTotal = expenses.filter((row) => row.type.startsWith("airport") || row.type.includes("handling")).reduce((sum, row) => sum + row.amountCents, 0);
  const atcTotal = expenses.filter((row) => row.type.startsWith("atc")).reduce((sum, row) => sum + row.amountCents, 0);

  return <>
    <div className="card-header">
      <PageHeading eyebrow="COMPANY EXPENSES" title="Gastos de compañía" copy="Airport expenses y ATC expenses calculados desde PIREPs aceptados y reglas económicas AOC." />
      <Link className="action-button approve" href="/staff/expenses/rules">Gestionar reglas</Link>
    </div>
    <section className="grid stats">
      <div className="card"><div className="stat-label">Total gastos</div><div className="stat-value">{money(total)}</div><div className="stat-note">Airport + ATC</div></div>
      <div className="card"><div className="stat-label">Airport / handling</div><div className="stat-value">{money(airportTotal)}</div><div className="stat-note">Landing, passenger, service, parking, handling</div></div>
      <div className="card"><div className="stat-label">ATC</div><div className="stat-value">{money(atcTotal)}</div><div className="stat-note">Enroute + terminal</div></div>
      <div className="card"><div className="stat-label">Registros</div><div className="stat-value">{expenses.length}</div><div className="stat-note">Sin duplicados por PIREP/tipo</div></div>
    </section>
    <div className="card settings-link">
      {expenses.length === 0
        ? <div className="empty-state">Todavía no hay gastos calculados. Se generarán al sincronizar PIREPs aceptados.</div>
        : <DataTable headers={["Vuelo", "Ruta", "Aeronave", "Tipo", "Importe", "Detalle", "Fecha"]} rows={expenses.map((row) => [
          row.pirep.flightNumber ?? row.pirepId,
          route(row.pirep.departure, row.pirep.arrival),
          row.pirep.aircraftType ?? "—",
          <Badge key="type" tone={row.type.startsWith("atc") ? "blue" : "amber"}>{expenseLabels[row.type] ?? row.type}</Badge>,
          <strong key="amount">{money(row.amountCents)}</strong>,
          <span key="details" className="audit-message">{detailSummary(row.calculationDetails)}</span>,
          new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(row.pirep.flownAt ?? row.pirep.createdAt),
        ])} />}
    </div>
  </>;
}

import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { prisma } from "@/lib/prisma";

type CompanyMovement = {
  id: string;
  concept: string;
  type: "income" | "expense";
  amountCents: number;
  date: Date;
  status: string;
};

const money = (cents: number) => `${new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(Math.abs(cents) / 100)}`;

async function getCompanyMovements(): Promise<CompanyMovement[]> {
  if (!process.env.DATABASE_URL) return [];

  try {
    const [passengerRevenuePireps, fuelCostPireps, payroll] = await Promise.all([
      prisma.pirep.findMany({
        where: { status: "accepted", passengerRevenueCents: { gt: 0 } },
        select: { id: true, flightNumber: true, passengerRevenueCents: true, flownAt: true, createdAt: true },
        orderBy: [{ flownAt: "desc" }, { createdAt: "desc" }],
        take: 250,
      }),
      prisma.pirep.findMany({
        where: { status: "accepted", fuelCostCents: { gt: 0 } },
        select: { id: true, flightNumber: true, fuelCostCents: true, fuelPriceRegion: true, fuelPriceSource: true, flownAt: true, createdAt: true },
        orderBy: [{ flownAt: "desc" }, { createdAt: "desc" }],
        take: 250,
      }),
      prisma.payrollRecord.findMany({
        where: { status: "paid" },
        select: { id: true, amountCents: true, paidAt: true, createdAt: true },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        take: 250,
      }),
    ]);

    return [
      ...passengerRevenuePireps.map((row) => ({
        id: row.id,
        concept: `Ingresos de pasajeros · ${row.flightNumber ?? "Vuelo"}`,
        type: "income" as const,
        amountCents: row.passengerRevenueCents ?? 0,
        date: row.flownAt ?? row.createdAt,
        status: "Contabilizado",
      })),
      ...fuelCostPireps.map((row) => ({
        id: `${row.id}-fuel`,
        concept: `Coste combustible · ${row.flightNumber ?? "Vuelo"}${row.fuelPriceRegion ? ` · ${row.fuelPriceRegion}` : ""}`,
        type: "expense" as const,
        amountCents: -(row.fuelCostCents ?? 0),
        date: row.flownAt ?? row.createdAt,
        status: row.fuelPriceSource ?? "IATA Jet Fuel Price Monitor",
      })),
      ...payroll.map((row) => ({
        id: row.id,
        concept: "Pago de nómina",
        type: "expense" as const,
        amountCents: -row.amountCents,
        date: row.paidAt ?? row.createdAt,
        status: "Contabilizado",
      })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 500);
  } catch (error) {
    console.error("Unable to load company economy movements.", error);
    return [];
  }
}

export default async function EconomyPage() {
  const movements = await getCompanyMovements();
  const incomeCents = movements.filter((row) => row.type === "income").reduce((sum, row) => sum + row.amountCents, 0);
  const expenseCents = Math.abs(movements.filter((row) => row.type === "expense").reduce((sum, row) => sum + row.amountCents, 0));
  const resultCents = incomeCents - expenseCents;

  return <>
    <PageHeading eyebrow="ECONOMÍA DE LA COMPAÑÍA" title="Movimientos económicos" copy="Ingresos de pasajeros, costes de combustible y nóminas pagadas desde la base de datos AOC." />
    <section className="grid stats">
      <div className="card"><div className="stat-label">Ingresos</div><div className="stat-value">{money(incomeCents)}</div><div className="stat-note">Passenger revenue desde PIREPs aceptados</div></div>
      <div className="card"><div className="stat-label">Gastos</div><div className="stat-value">{money(expenseCents)}</div><div className="stat-note">Fuel cost + nóminas pagadas</div></div>
      <div className="card"><div className="stat-label">Resultado</div><div className="stat-value">{resultCents < 0 ? "−" : ""}{money(resultCents)}</div><div className="stat-note">Resultado operativo virtual en EUR</div></div>
    </section>
    <div className="card">
      {movements.length === 0
        ? <div className="empty-state">Todavía no hay movimientos económicos.</div>
        : <DataTable headers={["Referencia", "Concepto", "Tipo", "Importe", "Fecha", "Estado"]} rows={movements.map((row) => [
          row.id,
          <span className="primary" key="concept">{row.concept}</span>,
          <Badge key="type" tone={row.type === "income" ? "green" : "amber"}>{row.type === "income" ? "Ingreso" : "Gasto"}</Badge>,
          <strong key="amount" className={row.amountCents >= 0 ? "amount-positive" : "amount-negative"}>{row.amountCents >= 0 ? "+" : "−"}{money(row.amountCents)}</strong>,
          new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(row.date),
          row.status,
        ])} />}
    </div>
  </>;
}

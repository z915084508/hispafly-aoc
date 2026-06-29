import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { prisma } from "@/lib/prisma";

type CompanyMovement = { id: string; concept: string; type: "income" | "expense"; amountCents: number; date: Date; status: string };

async function getCompanyMovements(): Promise<CompanyMovement[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const [pireps, payroll] = await Promise.all([
      prisma.pirep.findMany({ where: { status: "accepted", passengerRevenueCents: { gt: 0 } }, select: { id: true, flightNumber: true, passengerRevenueCents: true, flownAt: true, createdAt: true } }),
      prisma.payrollRecord.findMany({ where: { status: "paid" }, select: { id: true, amountCents: true, paidAt: true, createdAt: true } }),
    ]);
    return [
      ...pireps.map((row) => ({ id: row.id, concept: `Ingresos de pasajeros · ${row.flightNumber ?? "Vuelo"}`, type: "income" as const, amountCents: row.passengerRevenueCents ?? 0, date: row.flownAt ?? row.createdAt, status: "Contabilizado" })),
      ...payroll.map((row) => ({ id: row.id, concept: "Pago de nómina virtual", type: "expense" as const, amountCents: -row.amountCents, date: row.paidAt ?? row.createdAt, status: "Contabilizado" })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());
  } catch (error) { console.error("Unable to load company economy movements.", error); return []; }
}

export default async function EconomyPage() {
  const movements = await getCompanyMovements();
  return <>
    <PageHeading eyebrow="ECONOMÍA DE LA COMPAÑÍA" title="Movimientos económicos" copy="Ingresos operativos y costes contabilizados de HISPAFLY." />
    <div className="card"><DataTable headers={["Referencia", "Concepto", "Tipo", "Importe", "Fecha", "Estado"]} rows={movements.map((row) => [
      row.id,
      <span className="primary" key="concept">{row.concept}</span>,
      <Badge key="type" tone={row.type === "income" ? "green" : "amber"}>{row.type === "income" ? "Ingreso" : "Gasto"}</Badge>,
      <strong key="amount" className={row.amountCents >= 0 ? "amount-positive" : "amount-negative"}>{row.amountCents >= 0 ? "+" : "−"}{new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(Math.abs(row.amountCents) / 100)} cr</strong>,
      new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(row.date),
      row.status,
    ])} /></div>
  </>;
}

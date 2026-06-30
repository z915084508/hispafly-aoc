import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { getPilotPayrollDetail } from "@/lib/pilot/portalData";
import { requirePilotSession } from "@/lib/pilot/session";

export const dynamic = "force-dynamic";

const credits = (cents: number | null | undefined) => `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format((cents ?? 0) / 100)} cr`;
const statusLabels: Record<string, string> = { pending: "Pendiente", approved: "Aprobado", rejected: "Rechazado", paid: "Pagado" };
const statusTones = { pending: "amber", approved: "blue", rejected: "red", paid: "green" } as const;
const route = (departure: string | null, arrival: string | null) => departure || arrival ? `${departure ?? "—"}-${arrival ?? "—"}` : "—";
const minutes = (value: number | null) => value === null ? "—" : `${Math.floor(value / 60)} h ${String(value % 60).padStart(2, "0")} min`;

function calculationLines(details: unknown): string[] {
  if (!details || typeof details !== "object" || Array.isArray(details)) return [];
  const value = details as Record<string, unknown>;
  return Array.isArray(value.explanation) ? value.explanation.filter((line): line is string => typeof line === "string") : [];
}

function calculationNumber(details: unknown, key: string) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const value = (details as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export default async function PilotPayrollDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const pilot = await requirePilotSession();
  const { id } = await params;
  const payroll = await getPilotPayrollDetail(pilot.id, id);
  if (!payroll) notFound();

  const lines = calculationLines(payroll.calculationDetails);
  const bonusCredits = calculationNumber(payroll.calculationDetails, "totalBonus");
  const penaltyCredits = calculationNumber(payroll.calculationDetails, "totalPenalty");

  return <PilotPortalShell>
    <PageHeading eyebrow="NÓMINA DETAIL" title={`Nómina ${payroll.pirep.flightNumber ?? payroll.settlementMonth}`} copy="Desglose de compensación virtual generado desde tu PIREP aceptado." />
    <p className="meta"><Link href="/pilot/payroll">← Volver a nóminas</Link></p>

    <section className="grid stats">
      <div className="card"><div className="stat-label">Base</div><div className="stat-value">{credits(payroll.basePayCents)}</div><div className="stat-note">Pago base calculado</div></div>
      <div className="card"><div className="stat-label">Bonificación</div><div className="stat-value amount-positive">+{credits(payroll.bonusCents)}</div><div className="stat-note">{bonusCredits === null ? "Detalle guardado" : `${bonusCredits.toFixed(2)} créditos`}</div></div>
      <div className="card"><div className="stat-label">Penalización</div><div className="stat-value amount-negative">−{credits(payroll.penaltyCents)}</div><div className="stat-note">{penaltyCredits === null ? "Detalle guardado" : `${penaltyCredits.toFixed(2)} créditos`}</div></div>
      <div className="card"><div className="stat-label">Importe final</div><div className="stat-value">{credits(payroll.amountCents)}</div><div className="stat-note"><Badge tone={statusTones[payroll.status as keyof typeof statusTones] ?? "gray"}>{statusLabels[payroll.status] ?? payroll.status}</Badge></div></div>
    </section>

    <div className="card">
      <div className="card-header"><h2 className="card-title">Vuelo asociado</h2><span className="meta">{payroll.pirep.vamsysPirepId}</span></div>
      <DataTable headers={["Campo", "Valor"]} rows={[
        ["Vuelo", payroll.pirep.flightNumber ?? "—"],
        ["Ruta", route(payroll.pirep.departure, payroll.pirep.arrival)],
        ["Aeronave", payroll.pirep.aircraftType ?? "—"],
        ["Red", payroll.pirep.network ?? "—"],
        ["Tiempo vuelo", minutes(payroll.pirep.flightTimeMinutes)],
        ["Landing rate", payroll.pirep.landingRate === null ? "—" : `${payroll.pirep.landingRate} fpm`],
        ["Puntuación", payroll.pirep.score ?? "—"],
        ["Passenger revenue", credits(payroll.pirep.passengerRevenueCents)],
        ["Fuel cost", credits(payroll.pirep.fuelCostCents)],
        ["Mes liquidación", payroll.settlementMonth],
        ["Pagado", payroll.paidAt ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(payroll.paidAt) : "—"],
      ]} />
    </div>

    <div className="card">
      <div className="card-header"><h2 className="card-title">Cálculo y explicación</h2><span className="meta">Payroll rule snapshot</span></div>
      {lines.length === 0
        ? <div className="empty-state">No hay explicación detallada guardada para esta nómina.</div>
        : <ul className="detail-list">{lines.map((line) => <li key={line}>{line}</li>)}</ul>}
    </div>
  </PilotPortalShell>;
}

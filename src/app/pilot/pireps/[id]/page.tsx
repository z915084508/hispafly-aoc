import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { getPilotPirepDetail } from "@/lib/pilot/portalData";
import { requirePilotSession } from "@/lib/pilot/session";

export const dynamic = "force-dynamic";

const credits = (cents: number | null) => cents === null ? "—" : `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(cents / 100)} cr`;
const number = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value);
const route = (departure: string | null, arrival: string | null) => departure || arrival ? `${departure ?? "—"}-${arrival ?? "—"}` : "—";
const minutes = (value: number | null) => value === null ? "—" : `${Math.floor(value / 60)} h ${String(value % 60).padStart(2, "0")} min`;

export default async function PilotPirepDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const pilot = await requirePilotSession();
  const { id } = await params;
  const pirep = await getPilotPirepDetail(pilot.id, id);
  if (!pirep) notFound();

  const revenue = pirep.passengerRevenueCents ?? 0;
  const fuelCost = pirep.fuelCostCents ?? 0;
  const net = revenue - fuelCost;

  return <PilotPortalShell>
    <PageHeading eyebrow="PIREP DETAIL" title={pirep.flightNumber ?? "Detalle del vuelo"} copy="Ingresos y datos operativos calculados desde tu PIREP aceptado." />
    <p className="meta"><Link href="/pilot/dashboard">← Volver al panel</Link></p>

    <section className="grid stats">
      <div className="card"><div className="stat-label">Ingresos pasajeros</div><div className="stat-value">{credits(pirep.passengerRevenueCents)}</div><div className="stat-note">Passenger revenue calculado</div></div>
      <div className="card"><div className="stat-label">Coste combustible</div><div className="stat-value">{credits(pirep.fuelCostCents)}</div><div className="stat-note">{pirep.fuelPriceSource ?? "Sin precio fuel guardado"}</div></div>
      <div className="card"><div className="stat-label">Resultado vuelo</div><div className="stat-value">{net < 0 ? "−" : ""}{credits(Math.abs(net))}</div><div className="stat-note">Ingresos pasajeros menos fuel cost</div></div>
      <div className="card"><div className="stat-label">Nómina asociada</div><div className="stat-value">{pirep.payrollRecord ? <Badge tone="blue">Sí</Badge> : <Badge tone="gray">No</Badge>}</div><div className="stat-note">{pirep.payrollRecord ? credits(pirep.payrollRecord.amountCents) : "Sin registro generado"}</div></div>
    </section>

    <div className="card">
      <DataTable headers={["Campo", "Valor"]} rows={[
        ["vAMSYS PIREP ID", pirep.vamsysPirepId],
        ["Ruta", route(pirep.departure, pirep.arrival)],
        ["Aeronave", pirep.aircraftType ?? "—"],
        ["Red", pirep.network ?? "—"],
        ["Tiempo vuelo", minutes(pirep.flightTimeMinutes)],
        ["Pasajeros", number(pirep.passengers)],
        ["Carga", pirep.cargoKg === null ? "—" : `${number(pirep.cargoKg)} kg`],
        ["Fuel usado", pirep.fuelUsed === null ? "—" : `${number(pirep.fuelUsed)} kg`],
        ["Precio fuel", pirep.fuelPricePerKgCents === null ? "—" : `${(pirep.fuelPricePerKgCents / 100).toFixed(3)} €/kg`],
        ["Región fuel", pirep.fuelPriceRegion ?? "—"],
        ["Aterrizaje", pirep.landingRate === null ? "—" : `${pirep.landingRate} fpm`],
        ["Puntuación", pirep.score ?? "—"],
        ["Fecha", pirep.flownAt ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(pirep.flownAt) : "—"],
      ]} />
    </div>
  </PilotPortalShell>;
}

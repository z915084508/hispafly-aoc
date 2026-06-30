import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { formatDateTime, formatMinutes, formatMoney, formatNumber, PirepHero, PirepMetric, PirepReportStyles, PirepSection } from "@/components/pirep-report";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { getPilotPirepDetail } from "@/lib/pilot/portalData";
import { requirePilotSession } from "@/lib/pilot/session";

export const dynamic = "force-dynamic";

export default async function PilotPirepDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const pilot = await requirePilotSession();
  const { id } = await params;
  const pirep = await getPilotPirepDetail(pilot.id, id);
  if (!pirep) notFound();

  return <PilotPortalShell><div className="pirep-report">
    <PirepReportStyles />
    <PageHeading eyebrow="PIREP REPORT · PILOT" title={pirep.flightNumber ?? pirep.callsign ?? "Informe de vuelo"} copy="Tu informe operativo, nómina y movimiento de cartera asociados a este vuelo." />
    <div className="pirep-toolbar"><Link className="action-button" href="/pilot/dashboard">← Volver al panel</Link></div>
    <PirepHero departure={pirep.departure} arrival={pirep.arrival}>
      <span>{pirep.flightNumber ?? "Sin número de vuelo"}</span><span>{pirep.aircraftType ?? "Aeronave —"}</span><span>{formatDateTime(pirep.flownAt)}</span>
    </PirepHero>
    <PirepSection title="Resumen del vuelo">
      <PirepMetric label="Estado" value={<Badge tone="green">Aceptado</Badge>} />
      <PirepMetric label="Indicativo" value={pirep.callsign ?? "—"} />
      <PirepMetric label="Aeronave" value={pirep.aircraftType ?? "—"} />
      <PirepMetric label="Red" value={pirep.network ?? "—"} />
      <PirepMetric label="Tiempo de vuelo" value={formatMinutes(pirep.flightTimeMinutes)} />
      <PirepMetric label="Tiempo de bloque" value={formatMinutes(pirep.blockTimeMinutes)} />
      <PirepMetric label="Distancia" value={pirep.flightDistanceNm == null ? "—" : `${formatNumber(pirep.flightDistanceNm)} NM`} />
      <PirepMetric label="Fecha" value={formatDateTime(pirep.flownAt)} />
    </PirepSection>
    <PirepSection title="Carga y rendimiento">
      <PirepMetric label="Pasajeros" value={formatNumber(pirep.passengers)} />
      <PirepMetric label="Carga" value={pirep.cargoKg == null ? "—" : `${formatNumber(pirep.cargoKg)} kg`} />
      <PirepMetric label="Combustible usado" value={pirep.fuelUsed == null ? "—" : `${formatNumber(pirep.fuelUsed)} kg`} />
      <PirepMetric label="Coste combustible" value={formatMoney(pirep.fuelCostCents)} note={pirep.fuelPriceSource ?? "Sin precio guardado"} />
      <PirepMetric label="Landing rate" value={pirep.landingRate == null ? "—" : `${formatNumber(pirep.landingRate)} fpm`} />
      <PirepMetric label="Score" value={formatNumber(pirep.score)} />
      <PirepMetric label="Points" value={formatNumber(pirep.points)} />
    </PirepSection>
    <PirepSection title="Tu nómina y cartera">
      <PirepMetric label="Nómina" value={pirep.payrollRecord ? formatMoney(pirep.payrollRecord.amountCents, pirep.payrollRecord.currency) : "Sin nómina"} note={pirep.payrollRecord?.status ?? "No se ha generado un registro"} />
      <PirepMetric label="Pago base" value={pirep.payrollRecord ? formatMoney(pirep.payrollRecord.basePayCents, pirep.payrollRecord.currency) : "—"} />
      <PirepMetric label="Bonificación" value={pirep.payrollRecord ? formatMoney(pirep.payrollRecord.bonusCents, pirep.payrollRecord.currency) : "—"} />
      <PirepMetric label="Penalización" value={pirep.payrollRecord ? formatMoney(pirep.payrollRecord.penaltyCents, pirep.payrollRecord.currency) : "—"} />
      <PirepMetric label="Movimiento de cartera" value={pirep.payrollRecord?.walletTransaction ? formatMoney(pirep.payrollRecord.walletTransaction.amountCents, pirep.payrollRecord.walletTransaction.currency) : "Sin movimiento"} note={pirep.payrollRecord?.walletTransaction?.description} />
      <PirepMetric label="Fecha del movimiento" value={formatDateTime(pirep.payrollRecord?.walletTransaction?.createdAt)} />
    </PirepSection>
  </div></PilotPortalShell>;
}

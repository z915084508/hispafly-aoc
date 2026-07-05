import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { formatDateTime, formatMinutes, formatMoney, formatNumber, PirepHero, PirepMetric, PirepReportStyles, PirepSection } from "@/components/pirep-report";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { getPilotPirepDetail } from "@/lib/pilot/portalData";
import { requirePilotSession } from "@/lib/pilot/session";

export const dynamic = "force-dynamic";

const expenseLabels = {
  airport_landing: "Aterrizaje", airport_passenger: "Tasa pasajeros",
  airport_service: "Servicio aeropuerto", airport_parking: "Estacionamiento",
  handling: "Handling", cargo_handling: "Handling carga",
  atc_enroute: "ATC en ruta", atc_terminal: "ATC terminal",
} as const;

export default async function PilotPirepDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const pilot = await requirePilotSession();
  const { id } = await params;
  const pirep = await getPilotPirepDetail(pilot.id, id);
  if (!pirep) notFound();
  const byType = new Map(pirep.companyExpenses.map((row) => [row.type, row.amountCents]));
  const sum = (...types: (keyof typeof expenseLabels)[]) => types.reduce((total, type) => total + (byType.get(type) ?? 0), 0);
  const airportExpense = sum("airport_landing", "airport_passenger", "airport_service", "airport_parking");
  const atcExpense = sum("atc_enroute", "atc_terminal");
  const handlingExpense = sum("handling", "cargo_handling");
  const companyExpenses = pirep.companyExpenses.reduce((total, row) => total + row.amountCents, 0);
  const revenue = pirep.passengerRevenueCents ?? 0;
  const payrollCost = pirep.payrollRecord?.amountCents ?? 0;
  const totalExpense = (pirep.fuelCostCents ?? 0) + companyExpenses + payrollCost;
  const flightResult = revenue - totalExpense;

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
      <PirepMetric label="Equipaje" value={pirep.luggageKg == null && pirep.cargoKg == null ? "—" : `${formatNumber(pirep.luggageKg ?? pirep.cargoKg ?? 0)} kg`} />
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
    <PirepSection title="Economía del vuelo" className="pirep-economy-total">
      <PirepMetric label="Ingresos pasajeros" value={formatMoney(pirep.passengerRevenueCents)} />
      <PirepMetric label="Coste combustible" value={formatMoney(pirep.fuelCostCents)} note={pirep.fuelPriceSource ?? "Sin precio guardado"} />
      <PirepMetric label="Gastos aeropuerto" value={formatMoney(airportExpense)} />
      <PirepMetric label="Gastos ATC" value={formatMoney(atcExpense)} />
      <PirepMetric label="Servicios handling" value={formatMoney(handlingExpense)} />
      <PirepMetric label="Coste nómina" value={formatMoney(payrollCost)} />
      <PirepMetric label="Ingreso total" value={formatMoney(revenue)} />
      <PirepMetric label="Gasto total" value={formatMoney(totalExpense)} />
      <PirepMetric label="Resultado del vuelo" value={formatMoney(flightResult)} valueClassName={flightResult >= 0 ? "pirep-positive" : "pirep-negative"} />
    </PirepSection>
    <PirepSection title="Desglose de ingresos y gastos">
      <PirepMetric label="Ingreso pasajeros" value={formatMoney(pirep.passengerRevenueCents)} />
      <PirepMetric label="Combustible" value={formatMoney(pirep.fuelCostCents)} />
      {pirep.companyExpenses.map((row) => <PirepMetric key={row.id} label={expenseLabels[row.type] ?? row.type} value={formatMoney(row.amountCents, row.currency)} />)}
    </PirepSection>
  </div></PilotPortalShell>;
}

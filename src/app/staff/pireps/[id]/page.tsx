import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { formatDateTime, formatMinutes, formatMoney, formatNumber, PirepHero, PirepMetric, PirepReportStyles, PirepSection } from "@/components/pirep-report";
import { getStaffPirepDetail } from "@/lib/pirep/detail";
import { refreshVamsysPirepDetail, reprocessPirepEconomy } from "./actions";
import { OperationalAnalysis } from "@/components/operational-analysis";

export const dynamic = "force-dynamic";

type SearchParams = { success?: string; error?: string };
const expenseTypes = {
  airport_landing: "Aterrizaje",
  airport_passenger: "Tasa pasajeros",
  airport_service: "Servicio aeropuerto",
  airport_parking: "Estacionamiento",
  handling: "Handling",
  cargo_handling: "Handling carga", MAINTENANCE: "Maintenance", AOG_RECOVERY: "AOG recovery", MAINTENANCE_FERRY_SUPPORT: "Maintenance ferry support",
  atc_enroute: "ATC en ruta",
  atc_terminal: "ATC terminal",
} as const;

export default async function StaffPirepDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, feedback] = await Promise.all([params, searchParams]);
  const pirep = await getStaffPirepDetail(id);
  if (!pirep) notFound();

  const byType = new Map(pirep.companyExpenses.map((row) => [row.type, row.amountCents]));
  const sum = (...types: (keyof typeof expenseTypes)[]) => types.reduce((total, type) => total + (byType.get(type) ?? 0), 0);
  const airportExpense = sum("airport_landing", "airport_passenger", "airport_service", "airport_parking");
  const atcExpense = sum("atc_enroute", "atc_terminal");
  const handlingExpense = sum("handling", "cargo_handling");
  const otherCompanyExpense = pirep.companyExpenses.reduce((total, row) => total + row.amountCents, 0);
  const revenue = pirep.passengerRevenueCents ?? 0;
  const payrollCost = pirep.payrollRecord?.amountCents ?? 0;
  const totalExpense = (pirep.fuelCostCents ?? 0) + otherCompanyExpense + payrollCost;
  const profit = revenue - totalExpense;

  return <div className="pirep-report">
    <PirepReportStyles />
    <PageHeading eyebrow="PIREP REPORT · STAFF" title={pirep.flightNumber ?? pirep.callsign ?? "Informe de vuelo"} copy="Detalle operativo y económico guardado en HISPAFLY AOC." />
    <div className="pirep-toolbar">
      <Link className="action-button" href="/staff/pireps">← Volver a PIREPs</Link>
      <button className="action-button pay" type="button" disabled title="vAMSYS is disconnected; historical PIREPs are read-only.">Legacy detail read-only</button>
      <form action={reprocessPirepEconomy.bind(null, id)}><button className="action-button recalculate" type="submit">Reprocess economy</button></form>
    </div>
    {feedback.success && <div className="feedback success">{feedback.success}</div>}
    {feedback.error && <div className="feedback error">{feedback.error}</div>}

    <PirepHero departure={pirep.departure} arrival={pirep.arrival}>
      <span>{pirep.flightNumber ?? "Sin número de vuelo"}</span><span>{pirep.aircraftType ?? "Aeronave —"}</span><span>{pirep.pilot.displayName}</span><span>{formatDateTime(pirep.flownAt)}</span>
    </PirepHero>

    <PirepSection title="Resumen del vuelo">
      <PirepMetric label="Estado vAMSYS" value={<Badge tone="green">{pirep.status}</Badge>} note={pirep.vamsysPirepId} />
      <PirepMetric label="Indicativo" value={pirep.callsign ?? "—"} />
      <PirepMetric label="Aeronave" value={pirep.aircraftType ?? "—"} />
      <PirepMetric label="Red" value={pirep.network ?? "—"} />
      <PirepMetric label="Tiempo de vuelo" value={formatMinutes(pirep.flightTimeMinutes)} />
      <PirepMetric label="Tiempo de bloque" value={formatMinutes(pirep.blockTimeMinutes)} />
      <PirepMetric label="Distancia" value={pirep.flightDistanceNm == null ? "—" : `${formatNumber(pirep.flightDistanceNm)} NM`} />
      <PirepMetric label="Aceptado" value={formatDateTime(pirep.acceptedAt)} />
    </PirepSection>

    <PirepSection title="Carga y rendimiento">
      <PirepMetric label="Pasajeros" value={formatNumber(pirep.passengers)} />
      <PirepMetric label="Equipaje" value={pirep.luggageKg == null && pirep.cargoKg == null ? "—" : `${formatNumber(pirep.luggageKg ?? pirep.cargoKg ?? 0)} kg`} />
      <PirepMetric label="Combustible usado" value={pirep.fuelUsed == null ? "—" : `${formatNumber(pirep.fuelUsed)} kg`} />
      <PirepMetric label="Landing rate" value={pirep.landingRate == null ? "—" : `${formatNumber(pirep.landingRate)} fpm`} />
      <PirepMetric label="Score" value={formatNumber(pirep.score)} />
      <PirepMetric label="Points" value={formatNumber(pirep.points)} />
    </PirepSection>

    <OperationalAnalysis analysis={pirep.flightAnalysisReport} staff/>
    <PirepSection title="Economía de compañía" className="pirep-economy-total">
      <PirepMetric label="Ingresos pasajeros" value={formatMoney(pirep.passengerRevenueCents)} />
      <PirepMetric label="Coste combustible" value={formatMoney(pirep.fuelCostCents)} note={pirep.fuelPriceSource ?? "Sin precio guardado"} />
      <PirepMetric label="Gastos aeropuerto" value={formatMoney(airportExpense)} />
      <PirepMetric label="Gastos ATC" value={formatMoney(atcExpense)} />
      <PirepMetric label="Handling" value={formatMoney(handlingExpense)} />
      <PirepMetric label="Coste nómina" value={formatMoney(payrollCost)} />
      <PirepMetric label="Ingreso total" value={formatMoney(revenue)} />
      <PirepMetric label="Gasto total" value={formatMoney(totalExpense)} />
      <PirepMetric label="Beneficio del vuelo" value={formatMoney(profit)} valueClassName={profit >= 0 ? "pirep-positive" : "pirep-negative"} />
    </PirepSection>

    <PirepSection title="Desglose de gastos">
      {pirep.companyExpenses.map((row) => <PirepMetric key={row.id} label={expenseTypes[row.type] ?? row.type} value={formatMoney(row.amountCents, row.currency)} />)}
      {pirep.companyExpenses.length === 0 && <PirepMetric label="Gastos" value="Sin gastos generados" />}
    </PirepSection>

    <details className="card pirep-raw"><summary>Raw vAMSYS payload · Staff debug only</summary><pre>{JSON.stringify(pirep.rawData, null, 2) ?? "No rawData stored."}</pre></details>
  </div>;
}

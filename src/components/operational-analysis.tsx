import { Badge } from "@/components/data-table";
import { formatMinutes, formatNumber, PirepMetric, PirepSection } from "@/components/pirep-report";

interface Analysis {
  plannedBlockMinutes: number | null; actualBlockMinutes: number | null; blockTimeDiffMinutes: number | null;
  plannedFlightMinutes: number | null; actualFlightMinutes: number | null; flightTimeDiffMinutes: number | null;
  plannedTripFuelKg: number | null; actualFuelUsedKg: number | null; fuelDiffKg: number | null; fuelDiffPercent: number | null;
  plannedRoute: string | null; actualDistanceNm: number | null; landingRate: number | null; landingG: number | null; summary: unknown;
}

const signed = (value: number | null, suffix: string) => value === null ? "—" : `${value > 0 ? "+" : ""}${formatNumber(value)}${suffix}`;
const summaryScore = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) && typeof (value as { efficiencyScore?: unknown }).efficiencyScore === "number" ? (value as { efficiencyScore: number }).efficiencyScore : null;
const summaryNumber = (value: unknown, key: string) => value && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>)[key] === "number" ? (value as Record<string, number>)[key] : null;

export function OperationalAnalysis({ analysis, staff = false }: { analysis: Analysis | null; staff?: boolean }) {
  if (!analysis) return <PirepSection title="Operational Analysis"><PirepMetric label="Status" value={<Badge tone="amber">Pending / no signed OFP match</Badge>} /></PirepSection>;
  const score = summaryScore(analysis.summary);
  const plannedDistanceNm = summaryNumber(analysis.summary, "plannedDistanceNm"), distanceDiffNm = summaryNumber(analysis.summary, "distanceDiffNm");
  return <PirepSection title="Operational Analysis">
    <PirepMetric label="Efficiency score" value={score === null ? "—" : `${score} / 100`} valueClassName={score !== null && score >= 80 ? "pirep-positive" : "pirep-negative"}/>
    <PirepMetric label="Planned block time" value={formatMinutes(analysis.plannedBlockMinutes)}/><PirepMetric label="Actual block time" value={formatMinutes(analysis.actualBlockMinutes)}/><PirepMetric label="Block difference" value={signed(analysis.blockTimeDiffMinutes, " min")}/>
    <PirepMetric label="Planned flight time" value={formatMinutes(analysis.plannedFlightMinutes)}/><PirepMetric label="Actual flight time" value={formatMinutes(analysis.actualFlightMinutes)}/><PirepMetric label="Flight time difference" value={signed(analysis.flightTimeDiffMinutes, " min")}/>
    <PirepMetric label="Planned trip fuel" value={analysis.plannedTripFuelKg === null ? "—" : `${formatNumber(analysis.plannedTripFuelKg)} kg`}/><PirepMetric label="Actual fuel used" value={analysis.actualFuelUsedKg === null ? "—" : `${formatNumber(analysis.actualFuelUsedKg)} kg`}/><PirepMetric label="Fuel difference" value={`${signed(analysis.fuelDiffKg, " kg")}${analysis.fuelDiffPercent === null ? "" : ` (${signed(analysis.fuelDiffPercent, "%")})`}`}/>
    <PirepMetric label="Landing summary" value={`${analysis.landingRate === null ? "—" : `${formatNumber(analysis.landingRate)} fpm`} · ${analysis.landingG === null ? "—" : `${analysis.landingG.toFixed(2)} G`}`}/>
    {staff && <><PirepMetric label="Planned route" value={analysis.plannedRoute ?? "—"}/><PirepMetric label="Planned distance" value={plannedDistanceNm === null ? "—" : `${formatNumber(plannedDistanceNm)} NM`}/><PirepMetric label="Actual distance" value={analysis.actualDistanceNm === null ? "—" : `${formatNumber(analysis.actualDistanceNm)} NM`}/><PirepMetric label="Distance difference" value={signed(distanceDiffNm, " NM")}/></>}
  </PirepSection>;
}

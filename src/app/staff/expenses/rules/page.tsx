import Link from "next/link";
import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/prisma";
import { saveAircraftProfileAction, saveAirportChargeProfileAction, saveAirspaceChargeProfileAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { success?: string; error?: string };

const money = (cents: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(cents / 100);
const decimal = (cents: number | null | undefined) => ((cents ?? 0) / 100).toFixed(2);

async function getRules() {
  if (!process.env.DATABASE_URL) return { airports: [], airspaces: [], aircraft: [] };
  const [airports, airspaces, aircraft] = await Promise.all([
    prisma.airportChargeProfile.findMany({ orderBy: { airportIcao: "asc" } }).catch(() => []),
    prisma.airspaceChargeProfile.findMany({ orderBy: { region: "asc" } }).catch(() => []),
    prisma.aircraftProfile.findMany({ orderBy: { aircraftType: "asc" } }).catch(() => []),
  ]);
  return { airports, airspaces, aircraft };
}

function AirportRuleForm({ rule }: { rule?: Awaited<ReturnType<typeof getRules>>["airports"][number] }) {
  return <form action={saveAirportChargeProfileAction} className="expense-rule-form">
    <label>ICAO<input name="airportIcao" defaultValue={rule?.airportIcao ?? ""} placeholder="LEMD" maxLength={4} required /></label>
    <label>Categoría<input name="airportCategory" defaultValue={rule?.airportCategory ?? "standard"} placeholder="standard" /></label>
    <label>Landing €/t<input name="landingRatePerTonne" type="number" min="0" step="0.01" defaultValue={rule ? decimal(rule.landingRatePerTonneCents) : ""} placeholder="8.50" /></label>
    <label>Pax fee €<input name="passengerFee" type="number" min="0" step="0.01" defaultValue={rule ? decimal(rule.passengerFeeCents) : ""} placeholder="12.00" /></label>
    <label>Service €<input name="passengerServiceFee" type="number" min="0" step="0.01" defaultValue={rule ? decimal(rule.passengerServiceFeeCents) : ""} placeholder="6.50" /></label>
    <label>Parking €/h<input name="parkingRatePerHour" type="number" min="0" step="0.01" defaultValue={rule ? decimal(rule.parkingRatePerHourCents) : ""} placeholder="25.00" /></label>
    <label>Terminal ATC €<input name="terminalAtcUnitRate" type="number" min="0" step="0.01" defaultValue={rule ? decimal(rule.terminalAtcUnitRateCents) : ""} placeholder="9.00" /></label>
    <SubmitButton className="action-button approve" pendingChildren="Guardando...">Guardar</SubmitButton>
  </form>;
}

function AirspaceRuleForm({ rule }: { rule?: Awaited<ReturnType<typeof getRules>>["airspaces"][number] }) {
  return <form action={saveAirspaceChargeProfileAction} className="expense-rule-form compact">
    <label>Región<input name="region" defaultValue={rule?.region ?? ""} placeholder="EUROPE" required /></label>
    <label>Unit rate €<input name="unitRate" type="number" min="0" step="0.01" defaultValue={rule ? decimal(rule.unitRateCents) : ""} placeholder="78.00" /></label>
    <SubmitButton className="action-button approve" pendingChildren="Guardando...">Guardar</SubmitButton>
  </form>;
}

function AircraftRuleForm({ rule }: { rule?: Awaited<ReturnType<typeof getRules>>["aircraft"][number] }) {
  return <form action={saveAircraftProfileAction} className="expense-rule-form compact aircraft-rule-form">
    <label>Tipo ICAO<input name="aircraftType" defaultValue={rule?.aircraftType ?? ""} placeholder="B738" required /></label>
    <label>Seats<input name="seatCapacity" type="number" min="0" step="1" defaultValue={rule?.seatCapacity ?? ""} placeholder="189" /></label>
    <label>Cargo kg<input name="cargoCapacityKg" type="number" min="0" step="1" defaultValue={rule?.cargoCapacityKg ?? ""} placeholder="5000" /></label>
    <label>MTOW kg<input name="mtowKg" type="number" min="0" step="1" defaultValue={rule?.mtowKg ?? ""} placeholder="79000" /></label>
    <SubmitButton className="action-button approve" pendingChildren="Guardando...">Guardar</SubmitButton>
  </form>;
}

export default async function StaffExpenseRulesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [filters, rules] = await Promise.all([searchParams, getRules()]);

  return <>
    <style>{`
      .expense-rules-header { display: flex; justify-content: space-between; gap: 16px; align-items: center; margin-bottom: 18px; }
      .expense-rules-grid { display: grid; grid-template-columns: 1.4fr .9fr; gap: 18px; align-items: start; }
      .expense-rule-form { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)) auto; gap: 12px; align-items: end; }
      .expense-rule-form.compact { grid-template-columns: repeat(2, minmax(140px, 1fr)) auto; }
      .expense-rule-form.aircraft-rule-form { grid-template-columns: repeat(4, minmax(120px, 1fr)) auto; }
      .expense-rule-form label { display: grid; gap: 7px; color: var(--muted); font-size: 10px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
      .expense-rule-form input { width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: 11px 12px; background: #fbfcfe; color: var(--ink); }
      .rule-section { margin-top: 18px; }
      .rule-help { color: var(--muted); font-size: 12px; line-height: 1.6; }
      @media (max-width: 1180px) { .expense-rules-grid { grid-template-columns: 1fr; } .expense-rule-form, .expense-rule-form.compact, .expense-rule-form.aircraft-rule-form { grid-template-columns: 1fr 1fr; } }
      @media (max-width: 720px) { .expense-rule-form, .expense-rule-form.compact, .expense-rule-form.aircraft-rule-form { grid-template-columns: 1fr; } .expense-rules-header { align-items: flex-start; flex-direction: column; } }
    `}</style>
    <div className="expense-rules-header">
      <PageHeading eyebrow="ECONOMY RULES" title="Reglas de gastos" copy="Mantén airport charges, ATC unit rates y perfiles fallback de aeronave para calcular CompanyExpense desde PIREPs aceptados." />
      <Link className="action-button" href="/staff/expenses">Ver gastos</Link>
    </div>
    {filters.success && <div className="feedback success">{filters.success}</div>}
    {filters.error && <div className="feedback error">{filters.error}</div>}

    <section className="card rule-section">
      <div className="card-header"><h2 className="card-title">Nueva / actualizar regla de aeropuerto</h2><span className="meta">AirportChargeProfile</span></div>
      <p className="rule-help">Introduce importes en euros. El sistema los guarda internamente como céntimos EUR.</p>
      <AirportRuleForm />
    </section>

    <div className="expense-rules-grid rule-section">
      <section className="card">
        <div className="card-header"><h2 className="card-title">Regla ATC por región</h2><span className="meta">AirspaceChargeProfile</span></div>
        <AirspaceRuleForm />
      </section>
      <section className="card">
        <div className="card-header"><h2 className="card-title">Fallback aeronave</h2><span className="meta">AircraftProfile</span></div>
        <AircraftRuleForm />
      </section>
    </div>

    <section className="card rule-section">
      <div className="card-header"><h2 className="card-title">Airport charge profiles</h2><span className="meta">{rules.airports.length} reglas</span></div>
      {rules.airports.length === 0 ? <div className="empty-state">Todavía no hay reglas de aeropuerto.</div> : <DataTable headers={["ICAO", "Categoría", "Landing", "Pax", "Service", "Parking", "Terminal ATC", "Editar"]} rows={rules.airports.map((rule) => [
        <strong key="icao">{rule.airportIcao}</strong>,
        <Badge key="cat" tone="blue">{rule.airportCategory}</Badge>,
        money(rule.landingRatePerTonneCents),
        money(rule.passengerFeeCents),
        money(rule.passengerServiceFeeCents),
        money(rule.parkingRatePerHourCents),
        money(rule.terminalAtcUnitRateCents),
        <AirportRuleForm key="edit" rule={rule} />,
      ])} />}
    </section>

    <section className="card rule-section">
      <div className="card-header"><h2 className="card-title">ATC airspace profiles</h2><span className="meta">{rules.airspaces.length} reglas</span></div>
      {rules.airspaces.length === 0 ? <div className="empty-state">Todavía no hay reglas ATC.</div> : <DataTable headers={["Región", "Unit rate", "Editar"]} rows={rules.airspaces.map((rule) => [
        <strong key="region">{rule.region}</strong>,
        money(rule.unitRateCents),
        <AirspaceRuleForm key="edit" rule={rule} />,
      ])} />}
    </section>

    <section className="card rule-section">
      <div className="card-header"><h2 className="card-title">Aircraft fallback profiles</h2><span className="meta">{rules.aircraft.length} reglas</span></div>
      {rules.aircraft.length === 0 ? <div className="empty-state">Todavía no hay perfiles fallback de aeronave.</div> : <DataTable headers={["Tipo", "Seats", "Cargo kg", "MTOW kg", "Fuente", "Editar"]} rows={rules.aircraft.map((rule) => [
        <strong key="type">{rule.aircraftType}</strong>,
        rule.seatCapacity ?? "—",
        rule.cargoCapacityKg ?? "—",
        rule.mtowKg ?? "—",
        rule.source,
        <AircraftRuleForm key="edit" rule={rule} />,
      ])} />}
    </section>
  </>;
}

import { PageHeading } from "@/components/page-heading";
import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/prisma";
import { IATA_JET_FUEL_PRICE_URL, FUEL_REGIONS } from "@/lib/economy/fuel";
import { isOperationsConfigured } from "@/lib/vamsys/operations";
import { backfillCompanyEconomyAction, saveFuelPriceAction, syncFleetDataAction } from "./actions";

type SearchParams = { success?: string; error?: string };

const money = (cents: number) => `${(cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €/kg`;
const decimal = (cents: number) => (cents / 100).toFixed(3);

export default async function StaffOperationsSettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [filters, fleetCount, aircraftCount, airportCount, state, fuelPriceRows] = await Promise.all([
    searchParams,
    prisma.fleet.count().catch(() => 0),
    prisma.aircraft.count().catch(() => 0),
    prisma.airport.count().catch(() => 0),
    prisma.operationsApiState.findUnique({ where: { id: "vamsys" } }).catch(() => null),
    prisma.fuelPrice.findMany({ orderBy: { effectiveFrom: "desc" }, take: 20 }).catch(() => []),
  ]);
  const configured = isOperationsConfigured();
  const latestFuelPrices = fuelPriceRows.filter((row, index, rows) => rows.findIndex((candidate) => candidate.region === row.region) === index);

  return <>
    <PageHeading eyebrow="OPERATIONS API" title="Operations API" copy="Estado, flota, aeropuertos y economía de la integración vAMSYS Operations." />
    {filters.success && <div className="feedback success">{filters.success}</div>}
    {filters.error && <div className="feedback error">{filters.error}</div>}

    <section className="grid stats">
      <div className="card"><div className="stat-label">Estado Operations API</div><div className="stat-value">{configured ? "OK" : "OFF"}</div><div className="stat-note">{configured ? "Credenciales configuradas" : "Faltan credenciales"}</div></div>
      <div className="card"><div className="stat-label">Flotas sincronizadas</div><div className="stat-value">{fleetCount}</div><div className="stat-note">Desde vAMSYS Fleet</div></div>
      <div className="card"><div className="stat-label">Aeronaves sincronizadas</div><div className="stat-value">{aircraftCount}</div><div className="stat-note">Matrícula, tipo, fleet, capacidad y MTOW si existe</div></div>
      <div className="card"><div className="stat-label">Aeropuertos sincronizados</div><div className="stat-value">{airportCount}</div><div className="stat-note">Operations API o fallback desde PIREPs</div></div>
    </section>

    <div className="card settings-link">
      <div className="card-header"><h2 className="card-title">Fleet / Aircraft / Airport sync</h2><span className="meta">vAMSYS Operations</span></div>
      <p className="page-copy">Sincroniza flota, aeronaves y aeropuertos desde vAMSYS para usar matrícula, fleet ID, tipo ICAO, capacidad, MTOW y datos ICAO/IATA como fuente prioritaria.</p>
      <div className="workflow-summary">
        <div><strong>{state?.status ?? "—"}</strong><span>Último estado</span></div>
        <div><strong>{state?.lastSuccessAt ? new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(state.lastSuccessAt) : "Nunca"}</strong><span>Última sincronización Operations</span></div>
        <div><strong>{state?.lastAirportSyncAt ? new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(state.lastAirportSyncAt) : "Nunca"}</strong><span>Última sincronización airport</span></div>
      </div>
      {state?.lastError && <div className="feedback error">Último error Operations: {state.lastError}</div>}
      <form action={syncFleetDataAction} className="settings-link">
        <SubmitButton className="button" disabled={!configured} pendingChildren="Sincronizando con vAMSYS...">Sincronizar flota, aeronaves y aeropuertos</SubmitButton>
      </form>
    </div>

    <div className="card settings-link">
      <div className="card-header"><h2 className="card-title">Company economy backfill</h2><span className="meta">PIREPs aceptados</span></div>
      <p className="page-copy">Recalcula snapshots de fuel pendientes y genera o actualiza CompanyExpense para PIREPs aceptados ya sincronizados. Úsalo después de cambiar reglas económicas o importar datos históricos.</p>
      <form action={backfillCompanyEconomyAction} className="settings-link">
        <SubmitButton className="button" pendingChildren="Recalculando economía...">Backfill company economy</SubmitButton>
      </form>
    </div>

    <div className="card settings-link">
      <div className="card-header"><h2 className="card-title">Fuel price reference</h2><span className="meta">IATA Jet Fuel Price Monitor</span></div>
      <p className="page-copy">Mantén aquí el precio de referencia observado en IATA. El coste de combustible se calcula y se guarda como snapshot cuando entra el PIREP; los históricos no cambian al actualizar el precio.</p>
      <p className="meta"><a href={IATA_JET_FUEL_PRICE_URL} target="_blank" rel="noreferrer">Abrir IATA Jet Fuel Price Monitor</a></p>
      <form action={saveFuelPriceAction} className="filter-card settings-link">
        <label className="filter-field">Región
          <select name="region" defaultValue="EUROPE">
            {FUEL_REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}
          </select>
        </label>
        <label className="filter-field">Precio €/kg
          <input name="pricePerKg" type="number" min="0" step="0.001" placeholder="0.820" required />
        </label>
        <SubmitButton className="button" pendingChildren="Guardando...">Guardar precio</SubmitButton>
      </form>
      <div className="table-wrap settings-link">
        <table>
          <thead><tr><th>Región</th><th>Precio actual</th><th>Fuente</th><th>Vigente desde</th><th>Modificar precio</th></tr></thead>
          <tbody>
            {latestFuelPrices.length === 0 ? <tr><td colSpan={5} className="meta">Todavía no hay precios de combustible guardados.</td></tr> : latestFuelPrices.map((price) => <tr key={price.id}>
              <td>{price.region}</td>
              <td>{money(price.pricePerKgCents)}</td>
              <td>{price.source}</td>
              <td>{new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(price.effectiveFrom)}</td>
              <td>
                <form action={saveFuelPriceAction} className="inline-action-form">
                  <input type="hidden" name="region" value={price.region} />
                  <input name="pricePerKg" type="number" min="0" step="0.001" defaultValue={decimal(price.pricePerKgCents)} aria-label={`Nuevo precio ${price.region}`} required />
                  <SubmitButton className="action-button" pendingChildren="Actualizando...">Actualizar</SubmitButton>
                </form>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  </>;
}

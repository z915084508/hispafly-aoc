import { PageHeading } from "@/components/page-heading";
import { SubmitButton } from "@/components/submit-button";
import { EconomyBackfillRunner } from "@/components/economy-backfill-runner";
import { prisma } from "@/lib/prisma";
import { IATA_JET_FUEL_PRICE_URL, FUEL_REGIONS } from "@/lib/economy/fuel";
import { isOperationsConfigured } from "@/lib/vamsys/operations";
import { saveFuelPriceAction, syncFleetDataAction } from "./actions";
import { getTranslations } from "@/lib/i18n/server";
import { formatDate, formatNumber } from "@/lib/i18n/core";

type SearchParams = { success?: string; error?: string };

const decimal = (cents: number) => (cents / 100).toFixed(3);
const percent = (ready: number, total: number) => total > 0 ? `${Math.round((ready / total) * 100)}%` : "0%";

export default async function StaffOperationsSettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { t, locale } = await getTranslations();
  const money = (cents: number) => `${formatNumber(cents / 100, locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €/kg`;
  const when = (value: Date | null | undefined) => value ? formatDate(value, locale, { dateStyle: "short", timeStyle: "short" }) : t("settings.never");
  const [filters, fleetCount, aircraftCount, airportCount, state, fuelPriceRows, acceptedPirepCount, expensesReadyCount, fuelSnapshotCount, fuelPendingCount] = await Promise.all([
    searchParams,
    prisma.fleet.count().catch(() => 0),
    prisma.aircraft.count().catch(() => 0),
    prisma.airport.count().catch(() => 0),
    prisma.operationsApiState.findUnique({ where: { id: "vamsys" } }).catch(() => null),
    prisma.fuelPrice.findMany({ orderBy: { effectiveFrom: "desc" }, take: 20 }).catch(() => []),
    prisma.pirep.count({ where: { status: "accepted" } }).catch(() => 0),
    prisma.pirep.count({ where: { status: "accepted", companyExpenses: { some: {} } } }).catch(() => 0),
    prisma.pirep.count({ where: { status: "accepted", fuelCostCents: { not: null } } }).catch(() => 0),
    prisma.pirep.count({ where: { status: "accepted", fuelUsed: { gt: 0 }, fuelCostCents: null } }).catch(() => 0),
  ]);
  const configured = isOperationsConfigured();
  const latestFuelPrices = fuelPriceRows.filter((row, index, rows) => rows.findIndex((candidate) => candidate.region === row.region) === index);
  const expensesPendingCount = Math.max(0, acceptedPirepCount - expensesReadyCount);

  return <>
    <PageHeading eyebrow={t("operationsApi.eyebrow")} title={t("operationsApi.title")} copy={t("operationsApi.copy")} />
    {filters.success && <div className="feedback success">{filters.success}</div>}
    {filters.error && <div className="feedback error">{filters.error}</div>}

    <section className="grid stats">
      <div className="card"><div className="stat-label">{t("operationsApi.status")}</div><div className="stat-value">{configured ? "OK" : "OFF"}</div><div className="stat-note">{configured ? t("operationsApi.configured") : t("operationsApi.missing")}</div></div>
      <div className="card"><div className="stat-label">{t("operationsApi.fleets")}</div><div className="stat-value">{fleetCount}</div><div className="stat-note">vAMSYS Fleet</div></div>
      <div className="card"><div className="stat-label">{t("operationsApi.aircraft")}</div><div className="stat-value">{aircraftCount}</div></div>
      <div className="card"><div className="stat-label">{t("operationsApi.airports")}</div><div className="stat-value">{airportCount}</div></div>
    </section>

    <div className="card settings-link">
      <div className="card-header"><h2 className="card-title">{t("operationsApi.syncTitle")}</h2><span className="meta">vAMSYS Operations</span></div>
      <p className="page-copy">Sincroniza flota, aeronaves y aeropuertos desde vAMSYS para usar matrícula, fleet ID, tipo ICAO, capacidad, MTOW y datos ICAO/IATA como fuente prioritaria.</p>
      <div className="workflow-summary">
        <div><strong>{state?.status ?? "—"}</strong><span>{t("operationsApi.lastStatus")}</span></div>
        <div><strong>{when(state?.lastSuccessAt)}</strong><span>{t("operationsApi.lastOperations")}</span></div>
        <div><strong>{when(state?.lastAirportSyncAt)}</strong><span>{t("operationsApi.lastAirport")}</span></div>
      </div>
      {state?.lastError && <div className="feedback error">Último error Operations: {state.lastError}</div>}
      <form action={syncFleetDataAction} className="settings-link">
        <SubmitButton className="button" disabled={!configured} pendingChildren={t("operationsApi.syncing")}>{t("operationsApi.sync")}</SubmitButton>
      </form>
    </div>

    <div className="card settings-link">
      <div className="card-header"><h2 className="card-title">Company economy backfill</h2><span className="meta">PIREPs aceptados</span></div>
      <p className="page-copy">Recalcula snapshots de fuel pendientes y genera o actualiza CompanyExpense para PIREPs aceptados ya sincronizados. Ahora se procesa en lotes pequeños para evitar timeouts.</p>
      <div className="workflow-summary">
        <div><strong>{acceptedPirepCount}</strong><span>PIREPs aceptados</span></div>
        <div><strong>{expensesReadyCount} / {acceptedPirepCount}</strong><span>CompanyExpense listo ({percent(expensesReadyCount, acceptedPirepCount)})</span></div>
        <div><strong>{expensesPendingCount}</strong><span>Pendientes de CompanyExpense</span></div>
        <div><strong>{fuelSnapshotCount}</strong><span>Fuel snapshots guardados</span></div>
        <div><strong>{fuelPendingCount}</strong><span>Fuel usados sin coste</span></div>
      </div>
      <EconomyBackfillRunner total={acceptedPirepCount} />
    </div>

    <div className="card settings-link">
      <div className="card-header"><h2 className="card-title">{t("operationsApi.fuelTitle")}</h2><span className="meta">IATA Jet Fuel Price Monitor</span></div>
      <p className="page-copy">Mantén aquí el precio de referencia observado en IATA. El coste de combustible se calcula y se guarda como snapshot cuando entra el PIREP; los históricos no cambian al actualizar el precio.</p>
      <p className="meta"><a href={IATA_JET_FUEL_PRICE_URL} target="_blank" rel="noreferrer">Abrir IATA Jet Fuel Price Monitor</a></p>
      <form action={saveFuelPriceAction} className="filter-card settings-link">
        <label className="filter-field">{t("operationsApi.region")}
          <select name="region" defaultValue="EUROPE">
            {FUEL_REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}
          </select>
        </label>
        <label className="filter-field">{t("operationsApi.price")}
          <input name="pricePerKg" type="number" min="0" step="0.001" placeholder="0.820" required />
        </label>
        <SubmitButton className="button" pendingChildren={t("common.save")}>{t("operationsApi.savePrice")}</SubmitButton>
      </form>
      <div className="table-wrap settings-link">
        <table>
          <thead><tr><th>{t("operationsApi.region")}</th><th>{t("operationsApi.currentPrice")}</th><th>{t("operationsApi.source")}</th><th>{t("operationsApi.effective")}</th><th>{t("operationsApi.modify")}</th></tr></thead>
          <tbody>
            {latestFuelPrices.length === 0 ? <tr><td colSpan={5} className="meta">{t("operationsApi.noPrices")}</td></tr> : latestFuelPrices.map((price) => <tr key={price.id}>
              <td>{price.region}</td>
              <td>{money(price.pricePerKgCents)}</td>
              <td>{price.source}</td>
              <td>{formatDate(price.effectiveFrom, locale, { dateStyle: "short", timeStyle: "short" })}</td>
              <td>
                <form action={saveFuelPriceAction} className="inline-action-form">
                  <input type="hidden" name="region" value={price.region} />
                  <input name="pricePerKg" type="number" min="0" step="0.001" defaultValue={decimal(price.pricePerKgCents)} aria-label={`Nuevo precio ${price.region}`} required />
                  <SubmitButton className="action-button" pendingChildren={t("operationsApi.updating")}>{t("common.update")}</SubmitButton>
                </form>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  </>;
}

import { PageHeading } from "@/components/page-heading";
import { StaffFleetExplorer } from "@/components/fleet/staff-fleet-explorer";
import { getTranslations } from "@/lib/i18n/server";
import { getAircraftLocationList, getAircraftLocationSummary } from "@/lib/aircraft-location/tracker";
import { prisma } from "@/lib/prisma";
import { setAircraftLocationAction, syncAircraftLocationsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function StaffFleetPage() {
  const [{ t, locale }, summary, locations, aircraft] = await Promise.all([
    getTranslations(), getAircraftLocationSummary(), getAircraftLocationList(),
    prisma.aircraft.findMany({ orderBy: { registration: "asc" }, select: { vamsysAircraftId: true, registration: true, aircraftType: true } }),
  ]);
  const mapItems = locations.map((item) => ({ ...item, updatedAt: item.updatedAt.toISOString(), latitude: item.lastLatitude, longitude: item.lastLongitude }));
  const noCoordinates = mapItems.filter((item) => item.latitude === null || item.longitude === null).length;
  const statusValues = { AVAILABLE: t("fleet.status.available"), RESERVED: t("fleet.status.reserved"), IN_FLIGHT: t("fleet.status.inFlight"), MAINTENANCE: t("fleet.status.maintenance"), UNKNOWN: t("fleet.status.unknown") };
  const sourceValues = { MANUAL: t("fleet.source.manual"), PIREP: t("fleet.source.pirep"), DISPATCH: t("fleet.source.dispatch"), ACARS: t("fleet.source.acars"), VAMSYS_EXTERNAL: t("fleet.source.vamsysExternal"), IMPORTED: t("fleet.source.imported") };
  const explorerLabels = {
    empty: t("fleet.map.empty"), aircraftAtAirport: t("fleet.map.aircraftAtAirport"), createRepositionOffer: t("fleet.map.createRepositionOffer"), staleLocation: t("fleet.map.staleLocation"), externalMovement: t("fleet.map.externalMovement"), unavailable: t("fleet.map.repositionUnavailable"),
    registration: t("aircraftLocation.registration"), aircraftType: t("aircraftLocation.type"), status: t("common.status"), source: t("aircraftLocation.source"), updatedAt: t("fleet.table.updatedAt"), lastBooking: t("fleet.table.lastBooking"), lastPirep: t("fleet.table.lastPirep"), statusValues, sourceValues,
    mapTitle: t("fleet.map.title"), filters: t("fleet.filters.title"), all: t("common.all"), statusFilter: t("fleet.filters.status"), typeFilter: t("fleet.filters.aircraftType"), airportFilter: t("fleet.filters.airport"), sourceFilter: t("fleet.filters.source"), onlyAvailable: t("fleet.filters.onlyAvailable"), onlyExternal: t("fleet.filters.onlyExternalMoved"), onlyNoCoordinates: t("fleet.filters.onlyNoCoordinates"), onlyStale: t("fleet.filters.onlyStale"), coordinates: t("fleet.table.coordinates"), coordinatesOk: t("fleet.table.coordinatesOk"), noCoordinates: t("fleet.map.noCoordinates"), actions: t("common.actions"),
  };
  return <>
    <PageHeading eyebrow={t("aircraftLocation.eyebrow")} title={t("aircraftLocation.staffTitle")} copy={t("aircraftLocation.staffCopy")} />
    <section className="grid stats fleet-kpis">
      {[["totalAircraft", summary.total], ["available", summary.available], ["reserved", summary.reserved], ["inFlight", summary.inFlight], ["maintenance", summary.maintenance], ["unknown", summary.unknown], ["airportsWithAircraft", summary.airportsWithAircraft], ["externalMovedAircraft", summary.externalMovedAircraft], ["noCoordinates", noCoordinates]].map(([key, value]) => <div className="card" key={key}><div className="stat-label">{t(`fleet.kpi.${key}`)}</div><div className="stat-value">{value}</div></div>)}
    </section>
    <StaffFleetExplorer aircraft={mapItems} labels={explorerLabels} locale={locale} />
    <div className="card settings-link">
      <div className="card-header"><h2>{t("aircraftLocation.manualTitle")}</h2><form action={syncAircraftLocationsAction}><button className="action-button approve" type="submit">{t("aircraftLocation.sync")}</button></form></div>
      <form action={setAircraftLocationAction} className="settings-grid">
        <label>{t("aircraftLocation.aircraft")}<input name="vamsysAircraftId" list="aircraft-location-options" required /><datalist id="aircraft-location-options">{aircraft.map((item) => <option key={item.vamsysAircraftId} value={item.vamsysAircraftId}>{item.registration ?? item.vamsysAircraftId} · {item.aircraftType ?? "—"}</option>)}</datalist></label>
        <label>{t("aircraftLocation.registration")}<input name="registration" /></label>
        <label>{t("aircraftLocation.type")}<input name="aircraftType" /></label>
        <label>{t("aircraftLocation.airport")}<input name="airportIcao" maxLength={4} /></label>
        <label>{t("common.status")}<select name="status" defaultValue="AVAILABLE">{["AVAILABLE", "RESERVED", "IN_FLIGHT", "MAINTENANCE", "UNKNOWN"].map((status) => <option key={status}>{status}</option>)}</select></label>
        <label>{t("aircraftLocation.notes")}<input name="notes" /></label>
        <button className="action-button approve" type="submit">{t("common.save")}</button>
      </form>
    </div>
  </>;
}

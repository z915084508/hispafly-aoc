import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { PilotFleetMapView } from "@/components/fleet/pilot-fleet-map-view";
import { PageHeading } from "@/components/page-heading";
import { getTranslations } from "@/lib/i18n/server";
import { getAircraftLocationList } from "@/lib/aircraft-location/tracker";

export const dynamic = "force-dynamic";

export default async function PilotFleetPage() {
  const [{ t, locale }, locations] = await Promise.all([getTranslations(), getAircraftLocationList()]);
  const aircraft = locations.map((item) => ({ ...item, updatedAt: item.updatedAt.toISOString(), latitude: item.lastLatitude, longitude: item.lastLongitude }));
  const labels = {
    empty: t("fleet.map.empty"), aircraftAtAirport: t("fleet.map.aircraftAtAirport"), createRepositionOffer: t("fleet.map.createRepositionOffer"), staleLocation: t("fleet.map.staleLocation"), externalMovement: t("fleet.map.externalMovement"), unavailable: t("fleet.map.repositionUnavailable"), registration: t("aircraftLocation.registration"), aircraftType: t("aircraftLocation.type"), status: t("common.status"), source: t("aircraftLocation.source"), updatedAt: t("fleet.table.updatedAt"), lastBooking: t("fleet.table.lastBooking"), lastPirep: t("fleet.table.lastPirep"),
    statusValues: { AVAILABLE: t("fleet.status.available"), RESERVED: t("fleet.status.reserved"), IN_FLIGHT: t("fleet.status.inFlight"), MAINTENANCE: t("fleet.status.maintenance"), UNKNOWN: t("fleet.status.unknown") },
    sourceValues: { MANUAL: t("fleet.source.manual"), PIREP: t("fleet.source.pirep"), DISPATCH: t("fleet.source.dispatch"), ACARS: t("fleet.source.acars"), VAMSYS_EXTERNAL: t("fleet.source.vamsysExternal"), IMPORTED: t("fleet.source.imported") },
  };
  return <PilotPortalShell><PageHeading eyebrow={t("aircraftLocation.eyebrow")} title={t("aircraftLocation.pilotTitle")} copy={t("fleet.map.pilotCopy")} /><PilotFleetMapView aircraft={aircraft} labels={labels} locale={locale} title={t("fleet.map.title")} /></PilotPortalShell>;
}

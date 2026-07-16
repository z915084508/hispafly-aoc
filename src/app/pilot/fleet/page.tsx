import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { PilotFleetMapView } from "@/components/fleet/pilot-fleet-map-view";
import { PilotFleetList } from "@/components/fleet/pilot-fleet-list";
import { PageHeading } from "@/components/page-heading";
import { getTranslations } from "@/lib/i18n/server";
import { getAircraftLocationList } from "@/lib/aircraft-location/tracker";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PilotFleetPage() {
  const [{ t, locale }, locations, conditions] = await Promise.all([getTranslations(), getAircraftLocationList(), prisma.aircraftConditionSnapshot.findMany({orderBy:{conditionPercent:"asc"}})]);
  const aircraft = locations.map((item) => ({ ...item, updatedAt: item.updatedAt.toISOString(), latitude: item.lastLatitude, longitude: item.lastLongitude }));
  const conditionMap = new Map(conditions.map((condition) => [condition.vamsysAircraftId, condition]));
  const rows = locations.map((location) => {
    const condition = conditionMap.get(location.vamsysAircraftId);
    return {
      id: location.vamsysAircraftId,
      registration: location.registration ?? condition?.registration ?? location.vamsysAircraftId,
      aircraftType: location.aircraftType ?? condition?.aircraftType ?? null,
      airport: location.currentAirportIcao,
      availability: location.status,
      conditionPercent: condition ? Number(condition.conditionPercent) : null,
      operationalStatus: condition?.operationalStatus ?? null,
    };
  });
  const labels = {
    empty: t("fleet.map.empty"), aircraftAtAirport: t("fleet.map.aircraftAtAirport"), createRepositionOffer: t("fleet.map.createRepositionOffer"), staleLocation: t("fleet.map.staleLocation"), externalMovement: t("fleet.map.externalMovement"), unavailable: t("fleet.map.repositionUnavailable"), registration: t("aircraftLocation.registration"), aircraftType: t("aircraftLocation.type"), status: t("common.status"), source: t("aircraftLocation.source"), updatedAt: t("fleet.table.updatedAt"), lastBooking: t("fleet.table.lastBooking"), lastPirep: t("fleet.table.lastPirep"),
    statusValues: { AVAILABLE: t("fleet.status.available"), RESERVED: t("fleet.status.reserved"), IN_FLIGHT: t("fleet.status.inFlight"), MAINTENANCE: t("fleet.status.maintenance"), UNKNOWN: t("fleet.status.unknown") },
    sourceValues: { MANUAL: t("fleet.source.manual"), PIREP: t("fleet.source.pirep"), DISPATCH: t("fleet.source.dispatch"), ACARS: t("fleet.source.acars"), NATIVE_DISPATCH: "Native Dispatch", NATIVE_ACARS: "Native ACARS", NATIVE_PIREP: "Native PIREP", VAMSYS_LEGACY: "vAMSYS Legacy", VAMSYS_EXTERNAL: t("fleet.source.vamsysExternal"), IMPORTED: t("fleet.source.imported") },
  };
  return <PilotPortalShell><PageHeading eyebrow={t("aircraftLocation.eyebrow")} title={t("aircraftLocation.pilotTitle")} copy={t("fleet.map.pilotCopy")} /><PilotFleetList rows={rows} labels={{title:t("maintenance.aircraftCondition"),search:t("fleet.search"),clear:t("common.clear"),registration:t("aircraftLocation.registration"),type:t("aircraftLocation.type"),airport:t("aircraftLocation.airport"),availability:t("common.status"),condition:t("maintenance.condition"),operationalStatus:t("maintenance.operationalStatus"),empty:t("aircraftLocation.empty"),notInitialized:t("maintenance.conditionNotInitialized"),statusValues:labels.statusValues}}/><PilotFleetMapView aircraft={aircraft} labels={labels} locale={locale} title={t("fleet.map.title")} /></PilotPortalShell>;
}

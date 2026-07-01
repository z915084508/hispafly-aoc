import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { getTranslations } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/core";
import { getAircraftLocationList } from "@/lib/aircraft-location/tracker";

export const dynamic = "force-dynamic";
const tone = (status: string) => status === "AVAILABLE" ? "green" : status === "RESERVED" ? "amber" : status === "MAINTENANCE" ? "red" : "gray";

export default async function PilotFleetPage() {
  const [{ t, locale }, locations] = await Promise.all([getTranslations(), getAircraftLocationList()]);
  return <PilotPortalShell><PageHeading eyebrow={t("aircraftLocation.eyebrow")} title={t("aircraftLocation.pilotTitle")} copy={t("aircraftLocation.pilotCopy")} />
    <div className="card">{locations.length === 0 ? <div className="empty-state">{t("aircraftLocation.empty")}</div> : <DataTable headers={[t("aircraftLocation.registration"), t("aircraftLocation.type"), t("aircraftLocation.airport"), t("common.status"), t("aircraftLocation.lastReport")]} rows={locations.map((item) => [item.registration ?? item.vamsysAircraftId, item.aircraftType ?? "—", item.currentAirportIcao ?? "—", <Badge key="s" tone={tone(item.status)}>{t(`aircraftLocation.status.${item.status}`)}</Badge>, item.lastReportAt ? formatDate(item.lastReportAt, locale, { dateStyle: "medium", timeStyle: "short" }) : "—"])} />}</div>
  </PilotPortalShell>;
}

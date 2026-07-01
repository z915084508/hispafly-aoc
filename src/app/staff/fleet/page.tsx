import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { getTranslations } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/core";
import { getAircraftLocationList, getAircraftLocationSummary } from "@/lib/aircraft-location/tracker";
import { prisma } from "@/lib/prisma";
import { setAircraftLocationAction, syncAircraftLocationsAction } from "./actions";

export const dynamic = "force-dynamic";
const tone = (status: string) => status === "AVAILABLE" ? "green" : status === "RESERVED" ? "amber" : status === "MAINTENANCE" ? "red" : "gray";

export default async function StaffFleetPage() {
  const [{ t, locale }, summary, locations, aircraft] = await Promise.all([getTranslations(), getAircraftLocationSummary(), getAircraftLocationList(), prisma.aircraft.findMany({ orderBy: { registration: "asc" }, select: { vamsysAircraftId: true, registration: true, aircraftType: true } })]);
  return <>
    <PageHeading eyebrow={t("aircraftLocation.eyebrow")} title={t("aircraftLocation.staffTitle")} copy={t("aircraftLocation.staffCopy")} />
    <section className="grid stats">
      {[["total", summary.total], ["available", summary.available], ["reserved", summary.reserved], ["maintenance", summary.maintenance], ["unknown", summary.unknown], ["airports", summary.airportsWithAircraft], ["external", summary.externalMovedAircraft]].map(([key, value]) => <div className="card" key={key}><div className="stat-label">{t(`aircraftLocation.${key}`)}</div><div className="stat-value">{value}</div></div>)}
    </section>
    <div className="card settings-link">
      <div className="card-header"><h2>{t("aircraftLocation.manualTitle")}</h2><form action={syncAircraftLocationsAction}><button className="action-button approve" type="submit">{t("aircraftLocation.sync")}</button></form></div>
      <form action={setAircraftLocationAction} className="settings-grid">
        <label>{t("aircraftLocation.aircraft")}<input name="vamsysAircraftId" list="aircraft-location-options" required /><datalist id="aircraft-location-options">{aircraft.map((a) => <option key={a.vamsysAircraftId} value={a.vamsysAircraftId}>{a.registration ?? a.vamsysAircraftId} · {a.aircraftType ?? "—"}</option>)}</datalist></label>
        <label>{t("aircraftLocation.registration")}<input name="registration" /></label>
        <label>{t("aircraftLocation.type")}<input name="aircraftType" /></label>
        <label>{t("aircraftLocation.airport")}<input name="airportIcao" maxLength={4} /></label>
        <label>{t("common.status")}<select name="status" defaultValue="AVAILABLE">{["AVAILABLE", "RESERVED", "IN_FLIGHT", "MAINTENANCE", "UNKNOWN"].map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>{t("aircraftLocation.notes")}<input name="notes" /></label>
        <button className="action-button approve" type="submit">{t("common.save")}</button>
      </form>
    </div>
    <div className="card settings-link">{locations.length === 0 ? <div className="empty-state">{t("aircraftLocation.empty")}</div> : <DataTable headers={[t("aircraftLocation.registration"), t("aircraftLocation.type"), t("aircraftLocation.airport"), t("common.status"), t("aircraftLocation.source"), t("aircraftLocation.lastReport")]} rows={locations.map((item) => [item.registration ?? item.vamsysAircraftId, item.aircraftType ?? "—", item.currentAirportIcao ?? "—", <Badge key="s" tone={tone(item.status)}>{t(`aircraftLocation.status.${item.status}`)}</Badge>, t(`aircraftLocation.sourceValue.${item.source}`), item.lastReportAt ? formatDate(item.lastReportAt, locale, { dateStyle: "medium", timeStyle: "short" }) : "—"])} />}</div>
  </>;
}

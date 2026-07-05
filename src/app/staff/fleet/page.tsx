import { PageHeading } from "@/components/page-heading";
import { StaffFleetExplorer } from "@/components/fleet/staff-fleet-explorer";
import { getTranslations } from "@/lib/i18n/server";
import { getAircraftLocationList, getAircraftLocationSummary } from "@/lib/aircraft-location/tracker";
import { prisma } from "@/lib/prisma";
import { initializeAircraftConditionsAction, setAircraftLocationAction, syncAircraftLocationsAction } from "./actions";
import { maintenanceAction } from "./actions";
import { DataTable, Badge } from "@/components/data-table";
import { UnifiedFleetConditionTable } from "@/components/fleet/unified-condition-table";

export const dynamic = "force-dynamic";

export default async function StaffFleetPage({searchParams}:{searchParams:Promise<{created?:string;existing?:string;skipped?:string;errors?:string}>}) {
  const feedback=await searchParams;
  const [{ t, locale }, summary, locations, aircraft, conditions, orders, monthlyCost] = await Promise.all([
    getTranslations(), getAircraftLocationSummary(), getAircraftLocationList(),
    prisma.aircraft.findMany({ orderBy: { registration: "asc" }, select: { vamsysAircraftId: true, registration: true, aircraftType: true } }),
    prisma.aircraftConditionSnapshot.findMany({orderBy:{conditionPercent:"asc"}}),
    prisma.aircraftMaintenanceOrder.findMany({where:{status:{notIn:["COMPLETED","CANCELLED"]}},orderBy:{createdAt:"desc"}}),
    prisma.companyExpense.aggregate({where:{type:{in:["MAINTENANCE","AOG_RECOVERY"]},createdAt:{gte:new Date(new Date().getFullYear(),new Date().getMonth(),1)}},_sum:{amountCents:true}}),
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
  const conditionByAircraft=new Map(conditions.map(c=>[c.vamsysAircraftId,c]));const unifiedRows=locations.map(loc=>{const c=conditionByAircraft.get(loc.vamsysAircraftId);return{vamsysAircraftId:loc.vamsysAircraftId,registration:loc.registration,aircraftType:loc.aircraftType,currentAirportIcao:loc.currentAirportIcao,locationStatus:loc.status,source:loc.source,lastPirep:loc.lastVamsysPirepId,updatedAt:loc.updatedAt,conditionPercent:c?Number(c.conditionPercent):null,operationalStatus:c?.operationalStatus??null,maintenanceStatus:c?.maintenanceStatus??null}});
  return <>
    <PageHeading eyebrow={t("aircraftLocation.eyebrow")} title={t("aircraftLocation.staffTitle")} copy={t("aircraftLocation.staffCopy")} />
    {feedback.created&&<div className={Number(feedback.errors)?"feedback error":"feedback success"}>Created: {feedback.created} · Existing: {feedback.existing??0} · Skipped: {feedback.skipped??0} · Errors: {feedback.errors??0}</div>}
    <section className="grid stats fleet-kpis">
      {[["totalAircraft", summary.total], ["available", summary.available], ["reserved", summary.reserved], ["inFlight", summary.inFlight], ["maintenance", summary.maintenance], ["unknown", summary.unknown], ["airportsWithAircraft", summary.airportsWithAircraft], ["externalMovedAircraft", summary.externalMovedAircraft], ["noCoordinates", noCoordinates]].map(([key, value]) => <div className="card" key={key}><div className="stat-label">{t(`fleet.kpi.${key}`)}</div><div className="stat-value">{value}</div></div>)}
    </section>
    <section className="grid stats fleet-kpis">{[["maintenance.needing",conditions.filter(x=>Number(x.conditionPercent)<40).length],["maintenance.ferryOnly",conditions.filter(x=>x.operationalStatus==="FERRY_ONLY").length],["maintenance.aog",conditions.filter(x=>x.operationalStatus==="AOG").length],["maintenance.inMaintenance",conditions.filter(x=>x.operationalStatus==="IN_MAINTENANCE").length],["maintenance.monthlyCost",`${((monthlyCost._sum.amountCents??0)/100).toLocaleString()} €`]].map(([key,value])=><div className="card" key={key}><div className="stat-label">{t(String(key))}</div><div className="stat-value">{value}</div></div>)}</section>
    <section className="card"><div className="card-header"><h2>{t("maintenance.aircraftCondition")}</h2></div><DataTable headers={[t("aircraftLocation.registration"),t("maintenance.condition"),t("common.status"),t("maintenance.cycles"),t("maintenance.blockHours"),t("common.actions")]} rows={conditions.map(c=>{const order=orders.find(o=>o.vamsysAircraftId===c.vamsysAircraftId);const pct=Number(c.conditionPercent);return [c.registration??c.vamsysAircraftId,<div key="condition"><strong>{pct}%</strong><div style={{height:8,background:"#e5e7eb",borderRadius:8}}><div style={{height:8,width:`${pct}%`,background:pct>=80?"#16a34a":pct>=60?"#84cc16":pct>=40?"#f59e0b":pct>=20?"#dc2626":"#7f1d1d",borderRadius:8}}/></div></div>,<Badge key="status" tone={pct>=60?"green":pct>=30?"amber":"red"}>{c.operationalStatus}</Badge>,c.cyclesSinceMaintenance,(c.blockMinutesSinceMaintenance/60).toFixed(1),<div key="actions" className="offer-actions">{order&&order.status!=="IN_PROGRESS"&&<form action={maintenanceAction}><input type="hidden" name="action" value="start"/><input type="hidden" name="aircraftId" value={c.vamsysAircraftId}/><input type="hidden" name="orderId" value={order.id}/><button className="action-button">{t("maintenance.start")}</button></form>}{order?.status==="IN_PROGRESS"&&<form action={maintenanceAction}><input type="hidden" name="action" value="complete"/><input type="hidden" name="aircraftId" value={c.vamsysAircraftId}/><input type="hidden" name="orderId" value={order.id}/><button className="action-button approve">{t("maintenance.complete")}</button></form>}<form action={maintenanceAction}><input type="hidden" name="action" value="aog"/><input type="hidden" name="aircraftId" value={c.vamsysAircraftId}/><button className="action-button reject">AOG</button></form></div>];})}/></section>
    <section className="card"><div className="card-header"><div><h2>{t("maintenance.initializeConditions")}</h2><p className="meta">{t("maintenance.initializeConditionsDescription")}</p></div><form action={initializeAircraftConditionsAction}><button className="action-button approve">{t("maintenance.initializeConditions")}</button></form></div>{conditions.length===0&&<div className="empty-state">{t("maintenance.noConditionRecords")}</div>}</section>
    <UnifiedFleetConditionTable rows={unifiedRows} labels={{title:t("maintenance.aircraftCondition"),registration:t("aircraftLocation.registration"),type:t("aircraftLocation.type"),airport:t("aircraftLocation.airport"),locationStatus:t("common.status"),condition:t("maintenance.condition"),operationalStatus:t("maintenance.operationalStatus"),maintenanceStatus:t("maintenance.maintenanceStatus"),source:t("aircraftLocation.source"),lastPirep:t("fleet.table.lastPirep"),updated:t("fleet.table.updatedAt"),actions:t("common.actions"),notInitialized:t("maintenance.conditionNotInitialized"),ferry:t("maintenance.createMaintenanceFerryOffer"),setAog:t("maintenance.setAog"),manual:t("maintenance.manualConditionUpdate"),initialize:t("maintenance.initializeConditions")}} />
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

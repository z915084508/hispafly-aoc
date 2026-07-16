import { PageHeading } from "@/components/page-heading";
import { FleetLocationMapOnly } from "@/components/fleet/fleet-location-map-only";
import { UnifiedFleetConditionTable } from "@/components/fleet/unified-condition-table";
import { getTranslations } from "@/lib/i18n/server";
import {
  getAircraftLocationList,
  getAircraftLocationSummary,
} from "@/lib/aircraft-location/tracker";
import { prisma } from "@/lib/prisma";
import {
  initializeAircraftConditionsAction,
  setAircraftLocationAction,
  syncAircraftLocationsAction,
  updatePublicFleetAircraftAction,
} from "./actions";
export const dynamic = "force-dynamic";
export default async function StaffFleetPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    existing?: string;
    skipped?: string;
    errors?: string;
  }>;
}) {
  const feedback = await searchParams;
  const [
    { t, locale },
    summary,
    locations,
    aircraft,
    conditions,
    orders,
    monthlyCost,
  ] = await Promise.all([
    getTranslations(),
    getAircraftLocationSummary(),
    getAircraftLocationList(),
    prisma.aircraft.findMany({
      orderBy: [{ publicDisplayOrder: "asc" }, { registration: "asc" }],
      select: {
        id: true,
        vamsysAircraftId: true,
        registration: true,
        aircraftType: true,
        fleetName: true,
        seatCapacity: true,
        cargoCapacityKg: true,
        publicVisible: true,
        publicDisplayName: true,
        publicDescription: true,
        publicImageUrl: true,
        publicBaseIcao: true,
        publicStatus: true,
        publicDisplayOrder: true,
        publicPublishedAt: true,
      },
    }),
    prisma.aircraftConditionSnapshot.findMany(),
    prisma.aircraftMaintenanceOrder.findMany({
      where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
    }),
    prisma.companyExpense.aggregate({
      where: {
        type: { in: ["MAINTENANCE", "AOG_RECOVERY"] },
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
      _sum: { amountCents: true },
    }),
  ]);
  const mapItems = locations.map((item) => ({
    ...item,
    updatedAt: item.updatedAt.toISOString(),
    latitude: item.lastLatitude,
    longitude: item.lastLongitude,
  }));
  const statusValues = {
    AVAILABLE: t("fleet.status.available"),
    RESERVED: t("fleet.status.reserved"),
    IN_FLIGHT: t("fleet.status.inFlight"),
    MAINTENANCE: t("fleet.status.maintenance"),
    UNKNOWN: t("fleet.status.unknown"),
  };
  const sourceValues = {
    MANUAL: t("fleet.source.manual"),
    PIREP: t("fleet.source.pirep"),
    DISPATCH: t("fleet.source.dispatch"),
    ACARS: t("fleet.source.acars"),
    NATIVE_DISPATCH: "Native Dispatch",
    NATIVE_ACARS: "Native ACARS",
    NATIVE_PIREP: "Native PIREP",
    VAMSYS_LEGACY: "vAMSYS Legacy",
    VAMSYS_EXTERNAL: t("fleet.source.vamsysExternal"),
    IMPORTED: t("fleet.source.imported"),
  };
  const mapLabels = {
    empty: t("fleet.map.empty"),
    aircraftAtAirport: t("fleet.map.aircraftAtAirport"),
    createRepositionOffer: t("fleet.map.createRepositionOffer"),
    staleLocation: t("fleet.map.staleLocation"),
    externalMovement: t("fleet.map.externalMovement"),
    unavailable: t("fleet.map.repositionUnavailable"),
    registration: t("aircraftLocation.registration"),
    aircraftType: t("aircraftLocation.type"),
    status: t("common.status"),
    source: t("aircraftLocation.source"),
    updatedAt: t("fleet.table.updatedAt"),
    lastBooking: t("fleet.table.lastBooking"),
    lastPirep: t("fleet.table.lastPirep"),
    statusValues,
    sourceValues,
  };
  const conditionMap = new Map(conditions.map((c) => [c.vamsysAircraftId, c]));
  const orderMap = new Map(orders.map((o) => [o.vamsysAircraftId, o]));
  const rows = locations.map((loc) => {
    const c = conditionMap.get(loc.vamsysAircraftId),
      o = orderMap.get(loc.vamsysAircraftId);
    return {
      vamsysAircraftId: loc.vamsysAircraftId,
      registration: loc.registration,
      aircraftType: loc.aircraftType,
      currentAirportIcao: loc.currentAirportIcao,
      locationStatus: loc.status,
      source: loc.source,
      lastPirep: loc.lastVamsysPirepId,
      updatedAt: loc.updatedAt.toISOString(),
      conditionPercent: c ? Number(c.conditionPercent) : null,
      operationalStatus: c?.operationalStatus ?? null,
      maintenanceStatus: c?.maintenanceStatus ?? null,
      orderId: o?.id ?? null,
      orderStatus: o?.status ?? null,
    };
  });
  const noCoordinates = mapItems.filter(
    (x) => x.latitude === null || x.longitude === null,
  ).length;
  return (
    <>
      <PageHeading
        eyebrow={t("aircraftLocation.eyebrow")}
        title={t("aircraftLocation.staffTitle")}
        copy={t("aircraftLocation.staffCopy")}
      />
      {feedback.created && (
        <div
          className={
            Number(feedback.errors) ? "feedback error" : "feedback success"
          }
        >
          Created: {feedback.created} · Existing: {feedback.existing ?? 0} ·
          Skipped: {feedback.skipped ?? 0} · Errors: {feedback.errors ?? 0}
        </div>
      )}
      <section className="grid stats fleet-kpis">
        {[
          ["fleet.kpi.totalAircraft", summary.total],
          ["fleet.kpi.available", summary.available],
          ["fleet.kpi.reserved", summary.reserved],
          ["fleet.kpi.inFlight", summary.inFlight],
          ["fleet.kpi.maintenance", summary.maintenance],
          ["fleet.kpi.unknown", summary.unknown],
          ["fleet.kpi.airportsWithAircraft", summary.airportsWithAircraft],
          ["fleet.kpi.externalMovedAircraft", summary.externalMovedAircraft],
          ["fleet.kpi.noCoordinates", noCoordinates],
          [
            "maintenance.needing",
            conditions.filter((x) => Number(x.conditionPercent) < 40).length,
          ],
          [
            "maintenance.ferryOnly",
            conditions.filter((x) => x.operationalStatus === "FERRY_ONLY")
              .length,
          ],
          [
            "maintenance.aog",
            conditions.filter((x) => x.operationalStatus === "AOG").length,
          ],
          [
            "maintenance.inMaintenance",
            conditions.filter((x) => x.operationalStatus === "IN_MAINTENANCE")
              .length,
          ],
          [
            "maintenance.monthlyCost",
            `${((monthlyCost._sum.amountCents ?? 0) / 100).toLocaleString()} €`,
          ],
        ].map(([key, value]) => (
          <div className="card" key={key}>
            <div className="stat-label">{t(String(key))}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </section>
      <div className="card">
        <div className="card-header">
          <div>
            <h2>{t("maintenance.initializeConditions")}</h2>
            <p className="meta">
              {t("maintenance.initializeConditionsDescription")}
            </p>
          </div>
          <form action={initializeAircraftConditionsAction}>
            <button className="action-button approve">
              {t("maintenance.initializeConditions")}
            </button>
          </form>
        </div>
        {conditions.length === 0 && (
          <div className="empty-state">
            {t("maintenance.noConditionRecords")}
          </div>
        )}
      </div>
      <UnifiedFleetConditionTable
        rows={rows}
        labels={{
          title: t("maintenance.aircraftCondition"),
          search: t("fleet.search"),
          clear: t("common.clear"),
          registration: t("aircraftLocation.registration"),
          type: t("aircraftLocation.type"),
          airport: t("aircraftLocation.airport"),
          locationStatus: t("common.status"),
          condition: t("maintenance.condition"),
          operationalStatus: t("maintenance.operationalStatus"),
          maintenanceStatus: t("maintenance.maintenanceStatus"),
          source: t("aircraftLocation.source"),
          lastPirep: t("fleet.table.lastPirep"),
          updated: t("fleet.table.updatedAt"),
          actions: t("common.actions"),
          notInitialized: t("maintenance.conditionNotInitialized"),
          ferry: t("maintenance.createMaintenanceFerryOffer"),
          setAog: t("maintenance.setAog"),
          manual: t("maintenance.manualConditionUpdate"),
          initialize: t("maintenance.initializeConditions"),
          start: t("maintenance.start"),
          complete: t("maintenance.complete"),
        }}
      />
      <div className="card">
        <div className="card-header">
          <div>
            <h2>{t("fleet.public.title")}</h2>
            <p className="meta">{t("fleet.public.copy")}</p>
          </div>
          <code>/api/public/fleet</code>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>{t("fleet.public.visible")}</th>
                <th>{t("aircraftLocation.registration")}</th>
                <th>{t("aircraftLocation.type")}</th>
                <th>{t("fleet.public.websiteName")}</th>
                <th>{t("fleet.public.base")}</th>
                <th>{t("common.status")}</th>
                <th>{t("fleet.public.imageUrl")}</th>
                <th>{t("common.description")}</th>
                <th>{t("fleet.public.order")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {aircraft.map((item) => (
                <tr key={item.id}>
                  <td colSpan={10}>
                    <form
                      action={updatePublicFleetAircraftAction}
                      className="settings-grid"
                    >
                      <input type="hidden" name="aircraftId" value={item.id} />
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          name="publicVisible"
                          defaultChecked={item.publicVisible}
                        />{" "}
                        {t("fleet.public.showOnWebsite")}
                      </label>
                      <div>
                        <strong>
                          {item.registration ?? item.vamsysAircraftId}
                        </strong>
                        <div className="meta">{item.fleetName ?? "—"}</div>
                      </div>
                      <div>
                        {item.aircraftType ?? "—"}
                        <div className="meta">
                          {item.seatCapacity
                            ? `${item.seatCapacity} seats`
                            : ""}
                        </div>
                      </div>
                      <label>
                        {t("fleet.public.websiteName")}
                        <input
                          name="publicDisplayName"
                          defaultValue={item.publicDisplayName ?? ""}
                          placeholder={item.registration ?? ""}
                        />
                      </label>
                      <label>
                        {t("fleet.public.base")}
                        <input
                          name="publicBaseIcao"
                          defaultValue={item.publicBaseIcao ?? ""}
                          placeholder="LEVC"
                          maxLength={4}
                        />
                      </label>
                      <label>
                        {t("common.status")}
                        <input
                          name="publicStatus"
                          defaultValue={item.publicStatus ?? ""}
                          placeholder="Active"
                        />
                      </label>
                      <label>
                        {t("fleet.public.imageUrl")}
                        <input
                          name="publicImageUrl"
                          defaultValue={item.publicImageUrl ?? ""}
                          placeholder="https://..."
                        />
                      </label>
                      <label>
                        {t("common.description")}
                        <textarea
                          name="publicDescription"
                          defaultValue={item.publicDescription ?? ""}
                          rows={2}
                        />
                      </label>
                      <label>
                        {t("fleet.public.order")}
                        <input
                          name="publicDisplayOrder"
                          type="number"
                          min={0}
                          defaultValue={item.publicDisplayOrder}
                        />
                      </label>
                      <button className="action-button approve">
                        {t("common.save")}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <FleetLocationMapOnly
        aircraft={mapItems}
        labels={mapLabels}
        locale={locale}
        title={t("fleet.map.title")}
      />
      <div className="card settings-link">
        <div className="card-header">
          <h2>{t("aircraftLocation.manualTitle")}</h2>
          <form action={syncAircraftLocationsAction}>
            <button className="action-button approve">
              {t("aircraftLocation.sync")}
            </button>
          </form>
        </div>
        <form action={setAircraftLocationAction} className="settings-grid">
          <label>
            {t("aircraftLocation.aircraft")}
            <input
              name="vamsysAircraftId"
              list="aircraft-location-options"
              required
            />
            <datalist id="aircraft-location-options">
              {aircraft.filter((x) => x.vamsysAircraftId).map((x) => (
                <option key={x.id} value={x.vamsysAircraftId!}>
                  {x.registration ?? x.vamsysAircraftId} ·{" "}
                  {x.aircraftType ?? "—"}
                </option>
              ))}
            </datalist>
          </label>
          <label>
            {t("aircraftLocation.registration")}
            <input name="registration" />
          </label>
          <label>
            {t("aircraftLocation.type")}
            <input name="aircraftType" />
          </label>
          <label>
            {t("aircraftLocation.airport")}
            <input name="airportIcao" maxLength={4} />
          </label>
          <label>
            {t("common.status")}
            <select name="status" defaultValue="AVAILABLE">
              {[
                "AVAILABLE",
                "RESERVED",
                "IN_FLIGHT",
                "MAINTENANCE",
                "UNKNOWN",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            {t("aircraftLocation.notes")}
            <input name="notes" />
          </label>
          <button className="action-button approve">{t("common.save")}</button>
        </form>
      </div>
    </>
  );
}

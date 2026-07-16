import { PageHeading } from "@/components/page-heading";
import { prisma } from "@/lib/prisma";
import {
  VAMSYS_DISCONNECTED_AT,
  VAMSYS_LEGACY_MESSAGE,
} from "@/lib/vamsys/legacy-policy";

const formatWhen = (value: Date | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("es-ES", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(value) + " UTC"
    : "No recorded successful sync";

export default async function VamsysSettingsPage() {
  const [
    state,
    legacyPilots,
    legacyPireps,
    legacyFleets,
    legacyAircraft,
    legacyRoutes,
    nativePilots,
    nativePireps,
    nativeFleets,
    nativeAircraft,
    nativeRoutes,
  ] = await Promise.all([
    prisma.operationsApiState.findUnique({ where: { id: "vamsys" } }).catch(() => null),
    prisma.pilot.count({ where: { dataOrigin: "VAMSYS_LEGACY" } }).catch(() => 0),
    prisma.pirep.count({ where: { dataOrigin: "VAMSYS_LEGACY" } }).catch(() => 0),
    prisma.fleet.count({ where: { dataOrigin: "VAMSYS_LEGACY" } }).catch(() => 0),
    prisma.aircraft.count({ where: { dataOrigin: "VAMSYS_LEGACY" } }).catch(() => 0),
    prisma.route.count({ where: { dataOrigin: "VAMSYS_LEGACY" } }).catch(() => 0),
    prisma.pilot.count({ where: { dataOrigin: "HISPAFLY_NATIVE" } }).catch(() => 0),
    prisma.pirep.count({ where: { dataOrigin: "HISPAFLY_NATIVE" } }).catch(() => 0),
    prisma.fleet.count({ where: { dataOrigin: "HISPAFLY_NATIVE" } }).catch(() => 0),
    prisma.aircraft.count({ where: { dataOrigin: "HISPAFLY_NATIVE" } }).catch(() => 0),
    prisma.route.count({ where: { dataOrigin: "HISPAFLY_NATIVE" } }).catch(() => 0),
  ]);

  const lastSuccess = [
    state?.lastSuccessAt,
    state?.lastPirepSyncAt,
    state?.lastPilotSyncAt,
    state?.lastRouteSyncAt,
    state?.lastAirportSyncAt,
  ].filter((date): date is Date => Boolean(date)).sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <>
      <PageHeading
        eyebrow="SYSTEM INTEGRATION STATUS"
        title="vAMSYS — Disconnected / Legacy"
        copy="Historical vAMSYS data is retained locally. The AOC no longer sends requests or attempts automatic reconnection."
      />

      <div className="feedback error">{VAMSYS_LEGACY_MESSAGE}</div>

      <section className="grid stats">
        <div className="card">
          <div className="stat-label">Connection</div>
          <div className="stat-value">OFF</div>
          <div className="stat-note">Frozen on {VAMSYS_DISCONNECTED_AT}</div>
        </div>
        <div className="card">
          <div className="stat-label">Last successful sync</div>
          <div className="stat-value">Legacy</div>
          <div className="stat-note">{formatWhen(lastSuccess)}</div>
        </div>
        <div className="card">
          <div className="stat-label">Legacy records</div>
          <div className="stat-value">{legacyPilots + legacyPireps + legacyFleets + legacyAircraft + legacyRoutes}</div>
          <div className="stat-note">Protected and read-only</div>
        </div>
        <div className="card">
          <div className="stat-label">HispaFly Native</div>
          <div className="stat-value">{nativePilots + nativePireps + nativeFleets + nativeAircraft + nativeRoutes}</div>
          <div className="stat-note">Current primary-system records</div>
        </div>
      </section>

      <div className="card settings-link">
        <div className="card-header">
          <h2 className="card-title">Disabled automatic tasks</h2>
          <span className="meta">Fail closed</span>
        </div>
        <p className="page-copy">
          PIREP cron, Pilot cron, Fleet/Aircraft/Route synchronization, webhook
          processing, OAuth connection and token refresh are disabled. They do
          not retry in the background and cannot block local AOC features.
        </p>
        <button className="button" type="button" disabled>
          Automatic reconnection disabled
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Retained data by source</h2>
          <span className="meta">Migration evidence</span>
        </div>
        <div className="workflow-summary">
          <div><strong>{legacyPilots}</strong><span>Legacy pilots</span></div>
          <div><strong>{legacyPireps}</strong><span>Historical PIREPs</span></div>
          <div><strong>{legacyFleets}</strong><span>Legacy fleets</span></div>
          <div><strong>{legacyAircraft}</strong><span>Legacy aircraft</span></div>
          <div><strong>{legacyRoutes}</strong><span>Legacy routes</span></div>
        </div>
        <p className="page-copy">
          External IDs, raw payloads, payroll, wallet and audit records are
          retained only for traceability and TASK 5 migration. They are not the
          identity authority for new HispaFly records.
        </p>
      </div>
    </>
  );
}

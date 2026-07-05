import Link from "next/link";
import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { requirePilotSession } from "@/lib/pilot/session";
import { getPilotDashboardData } from "@/lib/pilot/portalData";
import { prisma } from "@/lib/prisma";
import { getTranslations } from "@/lib/i18n/server";
import { formatCurrency, formatDate, formatNumber } from "@/lib/i18n/core";
import { savePilotSimbriefIdAction } from "@/app/pilot/profile/actions";

export const dynamic = "force-dynamic";

const route = (departure: string | null, arrival: string | null) => departure || arrival ? `${departure ?? "—"}-${arrival ?? "—"}` : "—";

export default async function PilotDashboardPage({ searchParams }: { searchParams: Promise<{ simbrief?: string }> }) {
  const pilot = await requirePilotSession();
  const messages = await searchParams;
  const { t, locale } = await getTranslations();
  const number = (value: number) => formatNumber(value, locale, { maximumFractionDigits: 0 });
  const money = (cents: number | null) => cents === null ? "—" : formatCurrency(cents, locale);
  const [summary, availableOffers, activeDispatches, earnedRewards] = await Promise.all([
    getPilotDashboardData(pilot.id),
    prisma.flightOffer.count({ where: { status: "PUBLISHED", validUntil: { gt: new Date() }, dispatches: { none: {} } } }),
    prisma.flightDispatch.count({ where: { pilotId: pilot.id, status: { in: ["DISPATCHING", "DISPATCHED"] } } }),
    prisma.walletTransaction.aggregate({ where: { pilotId: pilot.id, flightDispatchId: { not: null } }, _sum: { amountCents: true } }),
  ]);

  return <PilotPortalShell>
    <PageHeading eyebrow={t("dashboard.pilotEyebrow")} title={t("dashboard.pilotTitle")} copy={t("dashboard.pilotCopy")} />
    {messages.simbrief === "saved" && <div className="feedback success">{t("pilot.profile.simbriefIdSaved")}</div>}
    {messages.simbrief === "invalid" && <div className="feedback error">{t("pilot.profile.simbriefIdInvalid")}</div>}
    <div className="grid stats">
      <div className="card"><div className="stat-label">{t("dashboard.acceptedPireps")}</div><div className="stat-value">{summary.acceptedPireps}</div></div>
      <div className="card"><div className="stat-label">{t("dashboard.passengers")}</div><div className="stat-value">{number(summary.totalPassengers)}</div></div>
      <div className="card"><div className="stat-label">{t("dashboard.cargo")}</div><div className="stat-value">{number(summary.totalCargo)}</div></div>
      <div className="card"><div className="stat-label">{t("dashboard.profileStatus")}</div><div className="stat-value"><Badge tone={pilot.status === "active" ? "green" : "amber"}>{t(`status.${pilot.status}`)}</Badge></div><div className="stat-note">{pilot.callsign ?? pilot.vamsysPilotId}</div></div>
    </div>
    <div className="grid stats">
      <div className="card"><div className="stat-label">{t("dashboard.availableOffers")}</div><div className="stat-value">{availableOffers}</div><div className="stat-note"><Link href="/pilot/flight-offers">Self Dispatch</Link></div></div>
      <div className="card"><div className="stat-label">{t("dashboard.activeDispatches")}</div><div className="stat-value">{activeDispatches}</div></div>
      <div className="card"><div className="stat-label">{t("dashboard.missionRewards")}</div><div className="stat-value">{money(earnedRewards._sum.amountCents ?? 0)}</div></div>
    </div>

    <section className="card ranking-card" id="simbrief-profile"><div className="card-header"><div><h2 className="card-title">{t("pilot.profile.simbriefId")}</h2><p className="meta">{t("pilot.profile.simbriefIdHelp")}</p></div></div><form action={savePilotSimbriefIdAction} className="inline-action-form"><input type="hidden" name="returnTo" value="/pilot/dashboard"/><label>{t("pilot.profile.simbriefId")}<input name="simbriefUserId" defaultValue={pilot.simbriefUserId ?? ""} maxLength={64} pattern="[A-Za-z0-9_-]*" autoComplete="off"/></label><button className="button" type="submit">{t("pilot.profile.saveSimbriefId")}</button></form></section>

    <div className="card ranking-card">
      <div className="card-header"><h2 className="card-title">{t("dashboard.latestPireps")}</h2></div>
      {summary.latestPireps.length === 0
        ? <div className="empty-state">{t("dashboard.noPireps")}</div>
        : <DataTable headers={["Vuelo", "Ruta", "Aeronave", "Pasajeros", "Carga", "Ingresos", "Fuel cost", "Fecha", "Detalle"]} rows={summary.latestPireps.map((row) => [
          row.flightNumber ?? row.vamsysPirepId,
          route(row.departure, row.arrival),
          row.aircraftType ?? "—",
          row.passengers ?? "—",
          row.cargoKg === null ? "—" : `${number(row.cargoKg)} kg`,
          money(row.passengerRevenueCents),
          money(row.fuelCostCents),
          formatDate(row.flownAt ?? row.createdAt, locale),
          <Link key="detail" className="action-button" href={`/pilot/pireps/${row.id}`}>{t("common.viewDetail")}</Link>,
        ])} />}
    </div>

    <div className="card ranking-card">
      <div className="card-header"><h2 className="card-title">{t("dashboard.topPilots")}</h2><span className="meta">{t("dashboard.allPilots")}</span></div>
      {summary.topPilots.length === 0
        ? <div className="empty-state">{t("dashboard.noPireps")}</div>
        : <DataTable headers={["#", "Piloto", "PIREPs aceptados"]} rows={summary.topPilots.map((row, index) => [
          <span className="ranking-position" key="pos">{index + 1}</span>,
          <Identity key="pilot" primary={row.name} secondary={row.callsign ?? row.pilotId} />,
          row.count,
        ])} />}
    </div>
  </PilotPortalShell>;
}

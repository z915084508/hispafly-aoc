import Link from "next/link";
import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { formatDateTime, formatMinutes, formatNumber } from "@/components/pirep-report";
import { PilotFilterBar, PilotListStyles } from "@/components/pilot-list-tools";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { getPilotPirepRows } from "@/lib/pilot/portalData";
import { requirePilotSession } from "@/lib/pilot/session";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; month?: string; network?: string; sort?: string };

export default async function PilotPirepsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const pilot = await requirePilotSession();
  const [rows, filters, { t, locale }] = await Promise.all([getPilotPirepRows(pilot.id), searchParams, getTranslations()]);
  const q = (filters.q ?? "").trim().toLowerCase();
  const filtered = rows.filter((row) => {
    const date = row.flownAt ?? row.createdAt;
    const haystack = [row.flightNumber, row.callsign, row.departure, row.arrival, row.aircraftType, row.vamsysPirepId].join(" ").toLowerCase();
    return (!q || haystack.includes(q))
      && (!filters.month || date.toISOString().slice(0, 7) === filters.month)
      && (!filters.network || row.network === filters.network);
  }).sort((a, b) => {
    const direction = filters.sort?.endsWith("asc") ? 1 : -1;
    if (filters.sort?.startsWith("amount")) return direction * ((a.passengerRevenueCents ?? 0) - (b.passengerRevenueCents ?? 0));
    return direction * ((a.flownAt ?? a.createdAt).getTime() - (b.flownAt ?? b.createdAt).getTime());
  });
  const networks = [...new Set(rows.map((row) => row.network).filter((value): value is string => Boolean(value)))].sort();
  return <PilotPortalShell>
    <PilotListStyles />
    <PageHeading eyebrow={t("pirepsPilot.eyebrow")} title={t("pirepsPilot.title")} copy={t("pirepsPilot.copy")} />
    <div className="pilot-list-tools">
      <PilotFilterBar q={filters.q} month={filters.month} sort={filters.sort} clearHref="/pilot/pireps" extra={{ name: "network", label: "Red", value: filters.network, options: networks.map((value) => ({ value, label: value })) }} />
      <div className="pilot-filter-meta">{t("pirepsPilot.showing", { shown: filtered.length, total: rows.length })}</div>
    </div>
    <div className="card data-card">
      {filtered.length === 0 ? <div className="empty-state">{t("pirepsPilot.empty")}</div> : <DataTable
        headers={[t("pirepsPilot.flight"), t("pirepsPilot.route"), t("pirepsPilot.aircraft"), t("common.status"), t("pirepsPilot.reason"), t("pirepsPilot.network"), t("pirepsPilot.time"), t("pirepsPilot.passengers"), t("common.date"), t("pirepsPilot.detail")]}
        rows={filtered.map((row) => [
          row.flightNumber ?? row.callsign ?? row.vamsysPirepId,
          <span key="route">{row.departure ?? "—"}–{row.arrival ?? "—"} {row.diverted && <Badge tone="amber">DIVERTED</Badge>}</span>,
          row.aircraftType ?? "—",
          <Badge key="status" tone={row.status === "accepted" ? "green" : "amber"}>{row.status.toUpperCase().replace("_", " ")}</Badge>,
          row.rejectCode ? `${row.rejectCode}${row.staffComment ? ` · ${row.staffComment}` : ""}` : "—",
          <Badge key="network" tone={row.network === "OFFLINE" ? "amber" : "blue"}>{row.network ?? "—"}</Badge>,
          formatMinutes(row.flightTimeMinutes),
          formatNumber(row.passengers, locale),
          formatDateTime(row.flownAt ?? row.createdAt, locale),
          <Link key="detail" className="action-button" href={`/pilot/pireps/${row.id}`}>{t("pirepsPilot.view")}</Link>,
        ])}
      />}
    </div>
  </PilotPortalShell>;
}

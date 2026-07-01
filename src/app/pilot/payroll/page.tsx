import Link from "next/link";
import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { PilotFilterBar, PilotListStyles } from "@/components/pilot-list-tools";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { getPilotPayrollRows } from "@/lib/pilot/portalData";
import { requirePilotSession } from "@/lib/pilot/session";
import { getTranslations } from "@/lib/i18n/server";
import { formatCurrency, formatDate } from "@/lib/i18n/core";

export const dynamic = "force-dynamic";

const statusTones = { pending: "amber", approved: "blue", rejected: "red", paid: "green" } as const;
type SearchParams = { q?: string; month?: string; status?: string; sort?: string };

function isoWeek(date: Date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((day.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekDates(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
  return { start, end };
}

export default async function PilotPayrollPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const pilot = await requirePilotSession();
  const { t, locale } = await getTranslations();
  const money = (cents: number) => formatCurrency(cents, locale);
  const statusLabels: Record<string, string> = { pending: t("status.pending"), approved: t("status.approved"), rejected: t("status.rejected"), paid: t("status.paid") };
  const [payroll, filters] = await Promise.all([getPilotPayrollRows(pilot.id), searchParams]);
  const q = (filters.q ?? "").trim().toLowerCase();
  const filtered = payroll.filter((row) => {
    const date = row.pirep.flownAt ?? row.createdAt;
    const haystack = [row.pirep.flightNumber, row.pirep.aircraftType, row.status, row.settlementMonth].join(" ").toLowerCase();
    return (!q || haystack.includes(q))
      && (!filters.month || date.toISOString().slice(0, 7) === filters.month)
      && (!filters.status || row.status === filters.status);
  });

  const grouped = new Map<string, { date: Date; rows: typeof filtered }>();
  for (const row of filtered) {
    const date = row.pirep.flownAt ?? row.createdAt;
    const key = isoWeek(date);
    const group = grouped.get(key) ?? { date, rows: [] };
    group.rows.push(row);
    if (date < group.date) group.date = date;
    grouped.set(key, group);
  }
  const direction = filters.sort?.endsWith("asc") ? 1 : -1;
  const weeks = [...grouped.entries()].sort(([, a], [, b]) => filters.sort?.startsWith("amount")
    ? direction * (a.rows.reduce((sum, row) => sum + row.amountCents, 0) - b.rows.reduce((sum, row) => sum + row.amountCents, 0))
    : direction * (a.date.getTime() - b.date.getTime()));

  return <PilotPortalShell>
    <PilotListStyles />
    <PageHeading eyebrow={t("payroll.eyebrow")} title={t("payroll.title")} copy={t("payroll.copy")} />
    <div className="pilot-list-tools">
      <PilotFilterBar q={filters.q} month={filters.month} sort={filters.sort} clearHref="/pilot/payroll" extra={{ name: "status", label: "Estado", value: filters.status, options: Object.entries(statusLabels).map(([value, label]) => ({ value, label })) }} />
      <div className="pilot-filter-meta">{t("payroll.records", { records: filtered.length, weeks: weeks.length })}</div>
    </div>
    {weeks.length === 0 ? <div className="card empty-state">{t("payroll.empty")}</div> : <div className="weekly-payroll">
      {weeks.map(([key, group]) => {
        const base = group.rows.reduce((sum, row) => sum + row.basePayCents, 0);
        const bonus = group.rows.reduce((sum, row) => sum + row.bonusCents, 0);
        const penalty = group.rows.reduce((sum, row) => sum + row.penaltyCents, 0);
        const total = group.rows.reduce((sum, row) => sum + row.amountCents, 0);
        const paid = group.rows.filter((row) => row.status === "paid").length;
        return <details className="card" key={key}>
          <summary className="weekly-summary">
            <div><strong>{key}</strong><span>{formatDate(weekDates(group.date).start, locale, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })} – {formatDate(weekDates(group.date).end, locale, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</span></div>
            <div><strong>{group.rows.length}</strong><span>{t("payroll.flights")}</span></div>
            <div><strong>{money(base)}</strong><span>{t("payroll.base")}</span></div>
            <div><strong className="amount-positive">+{money(bonus)}</strong><span>{t("payroll.bonus")}</span></div>
            <div><strong className={penalty ? "amount-negative" : ""}>−{money(penalty)}</strong><span>{t("payroll.penalty")}</span></div>
            <div><strong>{money(total)}</strong><span>{t("payroll.total")} · {t("payroll.paidCount", { paid, total: group.rows.length })}</span></div>
          </summary>
          <DataTable headers={["Flight", t("payroll.aircraft"), t("payroll.base"), t("payroll.bonus"), t("payroll.penalty"), t("common.amount"), t("common.status"), t("common.viewDetail")]} rows={group.rows.map((row) => [
            row.pirep.flightNumber ?? "—", row.pirep.aircraftType ?? "—", money(row.basePayCents),
            <span key="bonus" className="amount-positive">+{money(row.bonusCents)}</span>,
            <span key="penalty" className={row.penaltyCents ? "amount-negative" : ""}>−{money(row.penaltyCents)}</span>,
            <strong key="amount">{money(row.amountCents)}</strong>,
            <Badge key="status" tone={statusTones[row.status as keyof typeof statusTones] ?? "gray"}>{statusLabels[row.status] ?? row.status}</Badge>,
            <Link key="detail" className="action-button" href={`/pilot/payroll/${row.id}`}>{t("common.viewDetail")}</Link>,
          ])} />
        </details>;
      })}
    </div>}
  </PilotPortalShell>;
}

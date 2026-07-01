import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { PilotFilterBar, PilotListStyles } from "@/components/pilot-list-tools";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { getPilotWalletRows } from "@/lib/pilot/portalData";
import { requirePilotSession } from "@/lib/pilot/session";
import { getTranslations } from "@/lib/i18n/server";
import { formatCurrency, formatDate } from "@/lib/i18n/core";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; month?: string; type?: string; sort?: string };

export default async function PilotWalletPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const pilot = await requirePilotSession();
  const { t, locale } = await getTranslations();
  const money = (cents: number) => `${cents >= 0 ? "+" : "−"}${formatCurrency(Math.abs(cents), locale)}`;
  const [transactions, filters] = await Promise.all([getPilotWalletRows(pilot.id), searchParams]);
  const q = (filters.q ?? "").trim().toLowerCase();
  const filtered = transactions.filter((row) => {
    const haystack = [row.reference, row.description, row.type, row.id].join(" ").toLowerCase();
    return (!q || haystack.includes(q))
      && (!filters.month || row.createdAt.toISOString().slice(0, 7) === filters.month)
      && (!filters.type || row.type === filters.type);
  }).sort((a, b) => {
    const direction = filters.sort?.endsWith("asc") ? 1 : -1;
    return filters.sort?.startsWith("amount")
      ? direction * (a.amountCents - b.amountCents)
      : direction * (a.createdAt.getTime() - b.createdAt.getTime());
  });
  const types = [...new Set(transactions.map((row) => row.type))].sort();

  return <PilotPortalShell>
    <PilotListStyles />
    <PageHeading eyebrow={t("wallet.eyebrow")} title={t("wallet.title")} copy={t("wallet.copy")} />
    <div className="pilot-list-tools">
      <PilotFilterBar q={filters.q} month={filters.month} sort={filters.sort} clearHref="/pilot/wallet" extra={{ name: "type", label: "Tipo", value: filters.type, options: types.map((value) => ({ value, label: value })) }} />
      <div className="pilot-filter-meta">{t("wallet.showing", { shown: filtered.length, total: transactions.length })}</div>
    </div>
    <div className="card">
      {filtered.length === 0
        ? <div className="empty-state">{t("wallet.empty")}</div>
        : <DataTable headers={[t("common.reference"), t("common.description"), t("common.type"), t("common.amount"), t("common.date")]} rows={filtered.map((row) => [
          row.reference ?? row.id,
          row.description,
          <Badge key="type" tone={row.amountCents >= 0 ? "green" : "red"}>{row.type}</Badge>,
          <strong key="amount" className={row.amountCents >= 0 ? "amount-positive" : "amount-negative"}>{money(row.amountCents)}</strong>,
          formatDate(row.createdAt, locale),
        ])} />}
    </div>
  </PilotPortalShell>;
}

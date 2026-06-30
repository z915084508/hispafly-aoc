import Link from "next/link";
import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { formatDateTime, formatMinutes, formatMoney, formatNumber } from "@/components/pirep-report";
import { PilotFilterBar, PilotListStyles } from "@/components/pilot-list-tools";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { getPilotPirepRows } from "@/lib/pilot/portalData";
import { requirePilotSession } from "@/lib/pilot/session";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; month?: string; network?: string; sort?: string };

export default async function PilotPirepsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const pilot = await requirePilotSession();
  const [rows, filters] = await Promise.all([getPilotPirepRows(pilot.id), searchParams]);
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
    <PageHeading eyebrow="MIS PIREPS" title="Informes de vuelo" copy="Consulta tus PIREPs aceptados y abre el informe operativo y económico de cada vuelo." />
    <div className="pilot-list-tools">
      <PilotFilterBar q={filters.q} month={filters.month} sort={filters.sort} clearHref="/pilot/pireps" extra={{ name: "network", label: "Red", value: filters.network, options: networks.map((value) => ({ value, label: value })) }} />
      <div className="pilot-filter-meta">Mostrando {filtered.length} de {rows.length} PIREPs.</div>
    </div>
    <div className="card data-card">
      {filtered.length === 0 ? <div className="empty-state">No hay PIREPs que coincidan con los filtros.</div> : <DataTable
        headers={["Vuelo", "Ruta", "Aeronave", "Red", "Tiempo", "Pasajeros", "Fuel", "Ingresos", "Fuel cost", "Fecha", "Detalle"]}
        rows={filtered.map((row) => [
          row.flightNumber ?? row.callsign ?? row.vamsysPirepId,
          `${row.departure ?? "—"}–${row.arrival ?? "—"}`,
          row.aircraftType ?? "—",
          <Badge key="network" tone={row.network === "OFFLINE" ? "amber" : "blue"}>{row.network ?? "—"}</Badge>,
          formatMinutes(row.flightTimeMinutes),
          formatNumber(row.passengers),
          row.fuelUsed == null ? "—" : `${formatNumber(row.fuelUsed)} kg`,
          formatMoney(row.passengerRevenueCents),
          formatMoney(row.fuelCostCents),
          formatDateTime(row.flownAt ?? row.createdAt),
          <Link key="detail" className="action-button" href={`/pilot/pireps/${row.id}`}>Ver informe</Link>,
        ])}
      />}
    </div>
  </PilotPortalShell>;
}

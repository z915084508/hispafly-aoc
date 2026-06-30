import Link from "next/link";
import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { formatDateTime, formatMinutes, formatMoney, formatNumber } from "@/components/pirep-report";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { getPilotPirepRows } from "@/lib/pilot/portalData";
import { requirePilotSession } from "@/lib/pilot/session";

export const dynamic = "force-dynamic";

export default async function PilotPirepsPage() {
  const pilot = await requirePilotSession();
  const rows = await getPilotPirepRows(pilot.id);
  return <PilotPortalShell>
    <PageHeading eyebrow="MIS PIREPS" title="Informes de vuelo" copy="Consulta tus PIREPs aceptados y abre el informe operativo y económico de cada vuelo." />
    <div className="card data-card">
      {rows.length === 0 ? <div className="empty-state">Todavía no hay PIREPs aceptados.</div> : <DataTable
        headers={["Vuelo", "Ruta", "Aeronave", "Red", "Tiempo", "Pasajeros", "Fuel", "Ingresos", "Fuel cost", "Fecha", "Detalle"]}
        rows={rows.map((row) => [
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

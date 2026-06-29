import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { getPilotWalletRows } from "@/lib/pilot/portalData";
import { requirePilotSession } from "@/lib/pilot/session";

export const dynamic = "force-dynamic";

const credits = (cents: number) => `${cents >= 0 ? "+" : "−"}${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(Math.abs(cents) / 100)} cr`;

export default async function PilotWalletPage() {
  const pilot = await requirePilotSession();
  const transactions = await getPilotWalletRows(pilot.id);

  return <PilotPortalShell>
    <PageHeading eyebrow="MOVIMIENTO DE CARTERA" title="Tu cartera" copy="Solo se muestran movimientos asociados a tu cuenta de piloto." />
    <div className="card">
      {transactions.length === 0
        ? <div className="empty-state">Todavía no hay transacciones de cartera.</div>
        : <DataTable headers={["Referencia", "Descripción", "Tipo", "Importe", "Fecha"]} rows={transactions.map((row) => [
          row.reference ?? row.id,
          row.description,
          <Badge key="type" tone={row.amountCents >= 0 ? "green" : "red"}>{row.type}</Badge>,
          <strong key="amount" className={row.amountCents >= 0 ? "amount-positive" : "amount-negative"}>{credits(row.amountCents)}</strong>,
          new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(row.createdAt),
        ])} />}
    </div>
  </PilotPortalShell>;
}

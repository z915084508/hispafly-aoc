import Link from "next/link";
import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { getPilotPayrollRows } from "@/lib/pilot/portalData";
import { requirePilotSession } from "@/lib/pilot/session";

export const dynamic = "force-dynamic";

const money = (cents: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(cents / 100);
const statusLabels: Record<string, string> = { pending: "Pendiente", approved: "Aprobado", rejected: "Rechazado", paid: "Pagado" };
const statusTones = { pending: "amber", approved: "blue", rejected: "red", paid: "green" } as const;

export default async function PilotPayrollPage() {
  const pilot = await requirePilotSession();
  const payroll = await getPilotPayrollRows(pilot.id);

  return <PilotPortalShell>
    <PageHeading eyebrow="NÓMINA" title="Tus nóminas" copy="Registros de compensación en euros generados desde tus PIREPs aceptados." />
    <div className="card">
      {payroll.length === 0
        ? <div className="empty-state">Todavía no hay registros de nómina.</div>
        : <DataTable headers={["Vuelo", "Aeronave", "Base", "Bonificación", "Penalización", "Importe", "Estado", "Mes", "Detalle"]} rows={payroll.map((row) => [
          row.pirep.flightNumber ?? "—",
          row.pirep.aircraftType ?? "—",
          money(row.basePayCents),
          <span key="bonus" className="amount-positive">+{money(row.bonusCents)}</span>,
          <span key="penalty" className={row.penaltyCents ? "amount-negative" : ""}>−{money(row.penaltyCents)}</span>,
          <strong key="amount">{money(row.amountCents)}</strong>,
          <Badge key="status" tone={statusTones[row.status as keyof typeof statusTones] ?? "gray"}>{statusLabels[row.status] ?? row.status}</Badge>,
          row.settlementMonth,
          <Link key="detail" className="action-button" href={`/pilot/payroll/${row.id}`}>Ver detalle</Link>,
        ])} />}
    </div>
  </PilotPortalShell>;
}

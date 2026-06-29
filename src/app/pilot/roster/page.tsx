import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { getPilotRosterRows } from "@/lib/pilot/portalData";

export const dynamic = "force-dynamic";

export default async function PilotRosterPage() {
  const pilots = await getPilotRosterRows();

  return <PilotPortalShell>
    <PageHeading eyebrow="ROSTER PILOTO" title="Pilot List" copy="Directorio básico visible para pilotos. No incluye datos administrativos." />
    <div className="card">
      {pilots.length === 0
        ? <div className="empty-state">Todavía no hay pilotos sincronizados.</div>
        : <DataTable headers={["Nombre", "Rango", "Base", "Estado"]} rows={pilots.map((pilot) => [
          pilot.displayName,
          pilot.rankName ?? pilot.rankAbbreviation ?? pilot.rank ?? "—",
          pilot.base ?? "—",
          <Badge key="status" tone={pilot.status === "active" ? "green" : "amber"}>{pilot.status === "active" ? "Activo" : "Inactivo"}</Badge>,
        ])} />}
    </div>
  </PilotPortalShell>;
}

import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { getPilotRows } from "@/lib/workflow-data";

export default async function PilotsPage() {
  const pilots = await getPilotRows();
  return <>
    <PageHeading eyebrow="DIRECTORIO DE TRIPULACIONES" title="Pilotos" copy="Directorio operativo de pilotos de HISPAFLY." />
    <div className="card"><DataTable headers={["Piloto", "Rango", "Base", "Estado"]} rows={pilots.map((pilot) => [
      <Identity key="identity" primary={pilot.name} secondary={pilot.callsign ?? pilot.externalId} />,
      pilot.rank,
      pilot.base,
      <Badge key="status" tone={pilot.status === "active" ? "green" : "amber"}>{pilot.status === "active" ? "Activo" : "Inactivo"}</Badge>,
    ])} /></div>
  </>;
}

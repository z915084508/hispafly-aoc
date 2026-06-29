import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { getPirepRows } from "@/lib/workflow-data";

const value = (item: string | number | null) => item ?? "—";
const formatMinutes = (minutes: number | null) => minutes === null ? "—" : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;

export default async function PirepsPage() {
  const pireps = await getPirepRows();
  return <>
    <PageHeading eyebrow="REGISTROS DE VUELO · SOLO LECTURA" title="PIREPs" copy="Registro operativo de vuelos aceptados de HISPAFLY." />
    <div className="notice">PEGASUS ACARS y vAMSYS siguen siendo las fuentes oficiales. AOC solo consulta PIREPs aceptados; nunca los envía ni modifica.</div>
    <div className="card"><DataTable
      headers={["Piloto", "Vuelo", "Indicativo", "Ruta", "Aeronave", "Red", "Tiempo", "Aterrizaje", "Puntuación", "Estado", "Fecha"]}
      rows={pireps.map((pirep) => [
        <Identity key="pilot" primary={pirep.pilot} secondary={pirep.id} />,
        <span className="primary" key="flight">{value(pirep.flightNumber)}</span>, value(pirep.callsign), pirep.route, value(pirep.aircraftType),
        <Badge key="network" tone={pirep.network === "OFFLINE" ? "amber" : "blue"}>{value(pirep.network)}</Badge>,
        formatMinutes(pirep.flightTimeMinutes), pirep.landingRate === null ? "—" : `${pirep.landingRate} fpm`, value(pirep.score),
        <Badge key="status" tone={pirep.status === "accepted" ? "green" : "amber"}>{pirep.status === "accepted" ? "Aceptado" : "Rechazado"}</Badge>,
        pirep.flownAt ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(pirep.flownAt) : "—",
      ])}
    /></div>
  </>;
}

import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { getPirepRows } from "@/lib/workflow-data";

const formatMinutes = (minutes: number) => `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;

export default async function PirepsPage() {
  const pireps = await getPirepRows();
  return <>
    <PageHeading eyebrow="REGISTROS DE VUELO · SOLO LECTURA" title="PIREPs" copy="Datos simulados con la misma forma que los PIREPs aceptados de vAMSYS." />
    <div className="notice">PEGASUS ACARS y vAMSYS siguen siendo las fuentes oficiales. Esta versión no realiza llamadas reales ni acepta PIREPs.</div>
    <div className="card"><DataTable
      headers={["Piloto", "Vuelo", "Indicativo", "Ruta", "Aeronave", "Red", "Tiempo", "Aterrizaje", "Puntuación", "Estado", "Fecha"]}
      rows={pireps.map((pirep) => [
        <Identity key="pilot" primary={pirep.pilot} secondary={pirep.id} />,
        <span className="primary" key="flight">{pirep.flightNumber}</span>,
        pirep.callsign,
        pirep.route,
        pirep.aircraftType,
        <Badge key="network" tone={pirep.network === "OFFLINE" ? "amber" : "blue"}>{pirep.network}</Badge>,
        formatMinutes(pirep.flightTimeMinutes),
        `${pirep.landingRate} fpm`,
        pirep.score,
        <Badge key="status" tone={pirep.status === "accepted" ? "green" : "amber"}>{pirep.status === "accepted" ? "Aceptado" : "Rechazado"}</Badge>,
        new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(pirep.flownAt),
      ])}
    /></div>
  </>;
}
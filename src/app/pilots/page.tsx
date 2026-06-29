import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function statusLabel(status: string) {
  if (status === "active") return { label: "Activo", tone: "green" as const };
  if (status === "on_leave") return { label: "De permiso", tone: "amber" as const };
  return { label: "Inactivo", tone: "gray" as const };
}

function formatBalance(cents: number) {
  return `${(cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export default async function PilotsPage() {
  const pilots = await prisma.pilot.findMany({
    orderBy: [{ status: "asc" }, { displayName: "asc" }],
    take: 500,
  });

  return <>
    <PageHeading eyebrow="DIRECTORIO DE TRIPULACIONES" title="Pilotos" copy="Consulta el estado, la asignación y el saldo virtual de cada piloto." action="Añadir piloto" />
    <div className="card">
      {pilots.length === 0 ? <p className="meta">Todavía no hay pilotos sincronizados desde vAMSYS.</p> : <DataTable
        headers={["Piloto", "Rango", "Base", "Estado", "Saldo"]}
        rows={pilots.map((pilot) => {
          const status = statusLabel(pilot.status);
          return [
            <Identity key="i" primary={pilot.displayName} secondary={pilot.callsign ?? pilot.vamsysPilotId} />,
            pilot.rankName ?? pilot.rank ?? "—",
            pilot.base ?? "—",
            <Badge key="b" tone={status.tone}>{status.label}</Badge>,
            formatBalance(pilot.walletBalanceCents),
          ];
        })}
      />}
    </div>
  </>;
}

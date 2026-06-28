import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { pilots } from "@/lib/mock-data";

export default function PilotsPage() { return <><PageHeading eyebrow="DIRECTORIO DE TRIPULACIONES" title="Pilotos" copy="Consulta el estado, la asignación y el saldo virtual de cada piloto." action="Añadir piloto"/><div className="card"><DataTable headers={["Piloto", "Rango", "Base", "Estado", "Saldo"]} rows={pilots.map((p) => [<Identity key="i" primary={p.name} secondary={p.id}/>, p.rank === "Captain" ? "Comandante" : "Primer oficial", p.base, <Badge key="b" tone={p.status === "Active" ? "green" : "amber"}>{p.status === "Active" ? "Activo" : "De permiso"}</Badge>, `${p.balance.toLocaleString("es-ES")} €`])}/></div></> }

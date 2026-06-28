import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { pireps } from "@/lib/mock-data";

export default function PirepsPage() { return <><PageHeading eyebrow="REGISTROS DE VUELO DE SOLO LECTURA" title="PIREPs" copy="PIREPs aceptados y sincronizados desde el registro oficial de vAMSYS." action="Ejecutar sincronización simulada"/><div className="notice">Este portal no detecta vuelos ni acepta PIREPs. PEGASUS ACARS y vAMSYS siguen siendo las fuentes oficiales; AOC solo lee registros aceptados para informes y nóminas.</div><div className="card"><DataTable headers={["PIREP", "Vuelo", "Piloto", "Ruta", "Tiempo de bloque", "Aceptado", "Nómina"]} rows={pireps.map((p) => [p.id, <span className="primary" key="f">{p.flight}</span>, p.pilot, p.route, `${p.hours.toFixed(2)} h`, p.accepted, <Badge key="b" tone={p.payroll === "Review" ? "amber" : "green"}>{p.payroll === "Review" ? "Revisar" : "Calculado"}</Badge>])}/></div></> }

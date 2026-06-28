import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { pireps } from "@/lib/mock-data";

export default function Dashboard() {
  const stats = [["PIREPs aceptados", "184", "+12 esta semana"], ["Pilotos activos", "47", "3 bases operativas"], ["Horas de vuelo en junio", "1.286,4", "+8,2 % respecto a mayo"], ["Nómina acumulada", "92.480 €", "Moneda virtual"]];
  return <><PageHeading eyebrow="RESUMEN DE OPERACIONES" title="Buenas tardes, Operaciones" copy="Una visión clara de la actividad aceptada y la nómina virtual de HISPAFLY." />
    <section className="grid stats">{stats.map(([label, value, note]) => <div className="card" key={label}><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>)}</section>
    <section className="grid two-column"><div className="card"><div className="card-header"><h2 className="card-title">PIREPs aceptados recientes</h2><span className="meta">Sincronización simulada</span></div><DataTable headers={["Vuelo", "Piloto", "Ruta", "Bloque", "Nómina"]} rows={pireps.slice(0,3).map((p) => [<Identity key="i" primary={p.flight} secondary={p.id} />, p.pilot, p.route, `${p.hours.toFixed(2)} h`, <Badge key="b">Calculado</Badge>])} /></div>
      <div className="card"><div className="card-header"><h2 className="card-title">Actividad operativa</h2><span className="meta">Últimas 24 horas</span></div><div className="activity">{[["Sincronización de PIREPs completada", "Se han leído 42 registros aceptados del feed simulado de vAMSYS."], ["Nómina de junio recalculada", "Tres PIREPs aceptados han actualizado los saldos de pilotos."], ["Ajuste manual registrado", "El personal AOC añadió un crédito de 125 € con una nota de auditoría."]].map(([t,c]) => <div className="activity-row" key={t}><div className="dot"/><div><div className="activity-title">{t}</div><div className="activity-copy">{c}</div></div></div>)}</div></div></section></>;
}

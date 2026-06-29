import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { getPirepRows } from "@/lib/workflow-data";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { hasStaffPermission } from "@/lib/staff/permissions";
import { isOperationsConfigured } from "@/lib/vamsys/operations";
import { syncAllPireps } from "./actions";

const formatMinutes = (minutes: number) => `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;

type PirepSearchParams = { success?: string; error?: string; q?: string; status?: string; month?: string; network?: string };

function includesText(value: unknown, query: string) {
  return String(value ?? "").toLowerCase().includes(query);
}

function routeMatches(route: string, query: string) {
  return route.toLowerCase().replace("-", " ").includes(query) || route.toLowerCase().includes(query);
}

export default async function PirepsPage({ searchParams }: { searchParams: Promise<PirepSearchParams> }) {
  const [pireps, staff, filters] = await Promise.all([getPirepRows(), getCurrentStaff(), searchParams]);
  const canSync = Boolean(staff?.active && hasStaffPermission(staff.role, "VAMSYS_PIREP_SYNC") && isOperationsConfigured());
  const q = (filters.q ?? "").trim().toLowerCase();
  const selectedStatus = filters.status ?? "";
  const selectedMonth = filters.month ?? "";
  const selectedNetwork = filters.network ?? "";
  const monthOptions = [...new Set(pireps.map((pirep) => pirep.flownAt.toISOString().slice(0, 7)))].sort().reverse();
  const networkOptions = [...new Set(pireps.map((pirep) => pirep.network).filter(Boolean))].sort();
  const filteredPireps = pireps.filter((pirep) => {
    const month = pirep.flownAt.toISOString().slice(0, 7);
    const textMatch = !q || includesText(pirep.pilot, q) || includesText(pirep.flightNumber, q) || includesText(pirep.callsign, q) || routeMatches(pirep.route, q) || includesText(pirep.aircraftType, q);
    const statusMatch = !selectedStatus || pirep.status === selectedStatus;
    const monthMatch = !selectedMonth || month === selectedMonth;
    const networkMatch = !selectedNetwork || pirep.network === selectedNetwork;
    return textMatch && statusMatch && monthMatch && networkMatch;
  });

  return <>
    <style>{`
      .staff-data-tools { display: grid; gap: 14px; margin-bottom: 18px; }
      .filter-card { display: grid; grid-template-columns: minmax(220px, 1.4fr) repeat(3, minmax(150px, .7fr)) auto auto; gap: 12px; align-items: end; }
      .filter-field { display: grid; gap: 7px; }
      .filter-field label { color: var(--muted); font-size: 10px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
      .filter-field input, .filter-field select { width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: 11px 12px; background: #fbfcfe; color: var(--ink); }
      .filter-meta { color: var(--muted); font-size: 12px; }
      .data-card { overflow: hidden; padding: 0; }
      .data-card .table-wrap { width: 100%; max-width: 100%; overflow-x: auto; padding: 18px 20px 20px; }
      .data-card table { min-width: 1180px; }
      .data-card th, .data-card td { padding-left: 10px; padding-right: 10px; }
      .empty-state { padding: 24px; color: var(--muted); font-size: 13px; }
      @media (max-width: 1280px) { .content { padding: 28px 24px; max-width: none; } .data-card table { min-width: 1120px; } }
      @media (max-width: 1180px) { .app-shell { grid-template-columns: 1fr; } .sidebar { position: static; height: auto; } .nav-list { grid-template-columns: repeat(3, minmax(0, 1fr)); } .sidebar-note { display: none; } .filter-card { grid-template-columns: 1fr 1fr; } }
      @media (max-width: 720px) { .filter-card { grid-template-columns: 1fr; } .content { padding: 22px 14px; } .topbar { height: auto; padding: 16px; align-items: flex-start; gap: 14px; flex-direction: column; } .data-card .table-wrap { padding: 14px; } }
    `}</style>
    <PageHeading eyebrow="REGISTROS DE VUELO · SOLO LECTURA" title="PIREPs" copy="Datos aceptados de vAMSYS. AOC solo consulta y calcula nómina desde PIREPs aceptados." />
    <div className="notice">PEGASUS ACARS y vAMSYS siguen siendo las fuentes oficiales. Esta página solo sincroniza PIREPs aceptados; nunca los envía ni modifica.</div>
    {filters.success && <div className="feedback success">{filters.success}</div>}
    {filters.error && <div className="feedback error">{filters.error}</div>}
    <div className="staff-data-tools">
      <form className="card filter-card" method="get">
        <div className="filter-field"><label>Buscar</label><input name="q" defaultValue={filters.q ?? ""} placeholder="Piloto, vuelo, callsign, ruta..." /></div>
        <div className="filter-field"><label>Estado</label><select name="status" defaultValue={selectedStatus}><option value="">Todos</option><option value="accepted">Aceptado</option><option value="rejected">Rechazado</option></select></div>
        <div className="filter-field"><label>Mes</label><select name="month" defaultValue={selectedMonth}><option value="">Todos</option>{monthOptions.map((month) => <option value={month} key={month}>{month}</option>)}</select></div>
        <div className="filter-field"><label>Red</label><select name="network" defaultValue={selectedNetwork}><option value="">Todas</option>{networkOptions.map((network) => <option value={network} key={network}>{network}</option>)}</select></div>
        <button className="action-button approve" type="submit">Filtrar</button>
        <a className="action-button" href="?">Limpiar</a>
      </form>
      <div className="filter-meta">Mostrando {filteredPireps.length} de {pireps.length} PIREPs.</div>
    </div>
    <div className="card actions sync-toolbar">
      {canSync
        ? <form action={syncAllPireps}><button className="action-button approve" type="submit">Sincronizar PIREPs históricos</button></form>
        : <span className="meta">La sincronización requiere Operations API configurada y rol ADMIN u OPS.</span>}
    </div>
    <div className="card data-card">{filteredPireps.length ? <DataTable
      headers={["Piloto", "Vuelo", "Indicativo", "Ruta", "Aeronave", "Red", "Tiempo", "Aterrizaje", "Puntuación", "Estado", "Fecha"]}
      rows={filteredPireps.map((pirep) => [
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
    /> : <div className="empty-state">No hay PIREPs que coincidan con los filtros.</div>}</div>
  </>;
}

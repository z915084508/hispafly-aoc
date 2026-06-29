import { PageHeading } from "@/components/page-heading";
import { prisma } from "@/lib/prisma";
import { isOperationsConfigured } from "@/lib/vamsys/operations";
import { syncFleetDataAction } from "./actions";

type SearchParams = { success?: string; error?: string };

export default async function StaffOperationsSettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [filters, counts] = await Promise.all([
    searchParams,
    Promise.all([
      prisma.fleet.count().catch(() => 0),
      prisma.aircraft.count().catch(() => 0),
      prisma.operationsApiState.findUnique({ where: { id: "vamsys" } }).catch(() => null),
    ]),
  ]);
  const [fleetCount, aircraftCount, state] = counts;
  const configured = isOperationsConfigured();

  return <>
    <PageHeading eyebrow="OPERATIONS API" title="Operations API" copy="Estado y configuración de la integración vAMSYS Operations." />
    {filters.success && <div className="feedback success">{filters.success}</div>}
    {filters.error && <div className="feedback error">{filters.error}</div>}

    <section className="grid stats">
      <div className="card"><div className="stat-label">Estado Operations API</div><div className="stat-value">{configured ? "OK" : "OFF"}</div><div className="stat-note">{configured ? "Credenciales configuradas" : "Faltan credenciales"}</div></div>
      <div className="card"><div className="stat-label">Flotas sincronizadas</div><div className="stat-value">{fleetCount}</div><div className="stat-note">Desde vAMSYS Fleet</div></div>
      <div className="card"><div className="stat-label">Aeronaves sincronizadas</div><div className="stat-value">{aircraftCount}</div><div className="stat-note">Matrículas y tipo ICAO</div></div>
      <div className="card"><div className="stat-label">Último estado</div><div className="stat-value">{state?.status ?? "—"}</div><div className="stat-note">{state?.lastSuccessAt ? new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(state.lastSuccessAt) : "Sin sincronización"}</div></div>
    </section>

    <div className="card settings-link">
      <div className="card-header"><h2 className="card-title">Fleet / Aircraft sync</h2><span className="meta">vAMSYS Operations</span></div>
      <p className="page-copy">Sincroniza la flota y aeronaves desde vAMSYS para usar matrícula, fleet ID y tipo ICAO como fuente de verdad. Si vAMSYS usa rutas distintas, configura VAMSYS_OPERATIONS_FLEETS_PATH y VAMSYS_OPERATIONS_AIRCRAFT_PATH.</p>
      <form action={syncFleetDataAction} className="settings-link">
        <button className="button" type="submit" disabled={!configured}>Sincronizar flota y aeronaves</button>
      </form>
    </div>
  </>;
}

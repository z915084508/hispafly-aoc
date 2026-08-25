import Link from "next/link";
import { WeeklyPlanner } from "@/components/programacion/weekly-planner";
import { ScheduleForm } from "@/components/programacion/schedule-form";
import { PublicationQueue, type PublicationQueueRow } from "@/components/programacion/publication-queue";
import type { ProgramacionFormValue } from "@/components/programacion/types";
import { createProgramacionAction, updateProgramacionAction } from "./actions";
import { buildDevelopmentPlannerData, getWeeklyAircraftPlannerData } from "@/lib/native-scheduling/planner-service";
import { normalizeWeekStartUtc, plannerRotationNeighbours } from "@/lib/native-scheduling/planner";
import { getFlightSchedule, listFlightSchedules, listScheduleFormOptions } from "@/lib/native-scheduling/repository";
import { listDraftPublicationQueue } from "@/lib/native-scheduling/bulk-publication";
import { validateProposedSchedule } from "@/lib/native-scheduling/service";
import { formatDate, formatDays, formatMinutes, scheduleFormOptions, toFormValue, toProposedSchedule } from "@/lib/native-scheduling/presentation";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { staffHasPermission } from "@/lib/staff/permissions";

const DAY = 86_400_000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const validDate = (value?: string) => {
  const parsed = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date();
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
};
const queryString = (query: Record<string, string | undefined>, changes: Record<string, string | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...changes })) if (value) params.set(key, value);
  return `?${params}`;
};
type BatchFailure = { code: string; errorCode?: string; message?: string };
const parseBatchFailures = (value?: string): BatchFailure[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is BatchFailure => Boolean(item && typeof item.code === "string")) : [];
  } catch {
    return [];
  }
};

export default async function ProgramacionWorkspace({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const view = ["planner", "list", "unassigned", "publication"].includes(query.view ?? "") ? query.view! : "planner";
  const staff = await getCurrentStaff();
  const canCreate = staffHasPermission(staff, "SCHEDULE_CREATE");
  const canEdit = staffHasPermission(staff, "SCHEDULE_EDIT");
  const canManage = staffHasPermission(staff, "SCHEDULE_STATUS_MANAGE");
  const weekStart = normalizeWeekStartUtc(validDate(query.week));
  const context = { aircraftId: query.aircraftId, week: iso(weekStart), scheduleId: query.scheduleId };
  const closePanel = queryString(query, { panel: undefined, mode: undefined, error: undefined });
  const newHref = queryString({ view: "planner", aircraftId: query.aircraftId, week: iso(weekStart) }, { panel: "schedule", mode: "create" });

  let plannerData: Awaited<ReturnType<typeof getWeeklyAircraftPlannerData>> | ReturnType<typeof buildDevelopmentPlannerData> | null = null;
  if (view === "planner" || view === "unassigned") {
    try {
      plannerData = await getWeeklyAircraftPlannerData({ aircraftId: view === "unassigned" ? "unassigned" : query.aircraftId, weekStartUtc: weekStart, includeExpired: query.includeExpired === "1" });
    } catch (error) {
      if (process.env.NODE_ENV === "production") throw error;
      plannerData = buildDevelopmentPlannerData(weekStart);
    }
  }

  const panelRequested = (view === "planner" || view === "unassigned") && query.panel === "schedule" && (query.mode === "create" || query.mode === "edit");
  const edited = panelRequested && query.mode === "edit" && query.scheduleId ? await getFlightSchedule(query.scheduleId) : null;
  const mayOpenPanel = panelRequested && ((query.mode === "create" && canCreate) || (query.mode === "edit" && canEdit && edited?.status === "DRAFT"));
  const options = mayOpenPanel ? await scheduleFormOptions() : null;
  let formValue: ProgramacionFormValue | undefined = edited ? toFormValue(edited) : undefined;
  if (mayOpenPanel && query.mode === "create") {
    const reverseRoutes = query.departure && query.arrival ? options!.routes.filter((route) => route.departure === query.departure && route.arrival === query.arrival) : [];
    formValue = {
      code: query.code,
      routeId: reverseRoutes.length === 1 ? reverseRoutes[0].id : undefined,
      assignedAircraftId: query.aircraftId && query.aircraftId !== "unassigned" ? query.aircraftId : undefined,
      defaultFleetId: query.defaultFleetId || plannerData?.selectedAircraft?.nativeFleetId,
      daysOfWeek: query.daysOfWeek?.split(",").map(Number),
      departureTimeMinutesUtc: query.departureTimeMinutesUtc ? Number(query.departureTimeMinutesUtc) : undefined,
      effectiveFrom: query.effectiveFrom || iso(weekStart),
      effectiveUntil: query.effectiveUntil,
    };
  }
  const allSegments = plannerData?.week.days.flatMap((day) => day.segments) ?? [];
  const panelSegment = allSegments.find((segment) => segment.scheduleId === edited?.id);
  const neighbours = panelSegment ? plannerRotationNeighbours(panelSegment, allSegments) : null;

  return <>
    <div className="page-header programacion-workspace-header">
      <div><div className="eyebrow">OPERACIONES · PROGRAMACIÓN</div><h1>Programación</h1><p>Planifica la rotación semanal, administra borradores y publica vuelos programados.</p></div>
      {canCreate && <Link className="button" href={newHref}>+ NUEVA PROGRAMACIÓN</Link>}
    </div>
    <nav className="programacion-workspace-tabs" aria-label="Vistas de Programación">
      <Link className={view === "planner" ? "active" : ""} href={queryString(context, { view: "planner" })}>PLANIFICADOR SEMANAL</Link>
      <Link className={view === "list" ? "active" : ""} href={queryString(context, { view: "list" })}>LISTA</Link>
      <Link className={view === "unassigned" ? "active" : ""} href={queryString(context, { view: "unassigned" })}>SIN AERONAVE</Link>
      <Link className={view === "publication" ? "active" : ""} href={queryString(context, { view: "publication", scheduleId: undefined })}>PENDIENTES DE PUBLICACIÓN</Link>
    </nav>
    {query.saved && <div className="notice">Borrador guardado. La rotación y la validación se han actualizado.</div>}
    {query.error && <div className="notice">{query.error}</div>}
    <div className={mayOpenPanel ? "programacion-workspace-split panel-open" : "programacion-workspace-split"}>
      <main>
        {view === "planner" && plannerData && <PlannerSurface data={plannerData} query={query} weekStart={weekStart} canCreate={canCreate} canEdit={canEdit}/>} 
        {view === "unassigned" && plannerData && <UnassignedSurface data={plannerData} query={query} canEdit={canEdit}/>} 
        {view === "list" && <ListSurface query={query} canEdit={canEdit}/>} 
        {view === "publication" && <PublicationSurface query={query} canManage={canManage}/>} 
      </main>
      {mayOpenPanel && options && <aside className="programacion-schedule-panel">
        <div className="programacion-panel-head"><div><span className="eyebrow">PROGRAMACIÓN</span><h2>{edited ? "Editar borrador" : query.reverseOf ? "Crear regreso" : "Nueva programación"}</h2></div><Link href={closePanel} aria-label="Cerrar panel">×</Link></div>
        {neighbours && <section className="rotation-context"><h3>CONTEXTO DE ROTACIÓN</h3><div><span>Vuelo anterior</span><strong>{neighbours.previous?.schedule.route.flightNumber ?? "—"} · {neighbours.previous?.schedule.route.arrival ?? "—"}</strong></div><div><span>Turnaround disponible</span><strong>{neighbours.availableTurnaround ?? "—"} min</strong></div><div><span>Turnaround mínimo</span><strong>{neighbours.minimumTurnaround} min</strong></div><div><span>Próxima salida posible</span><strong>{neighbours.earliestNextDeparture.toISOString().slice(11,16)} UTC</strong></div><div><span>Vuelo siguiente</span><strong>{neighbours.next?.schedule.route.flightNumber ?? "—"} · {neighbours.next?.schedule.route.departure ?? "—"}</strong></div></section>}
        <ScheduleForm action={edited ? updateProgramacionAction : createProgramacionAction} value={formValue} {...options} submitLabel="Guardar borrador" cancelHref={closePanel} hiddenFields={{ returnTo: queryString(query, {}) }}/>
      </aside>}
    </div>
  </>;
}

async function PublicationSurface({ query, canManage }: { query: Record<string, string | undefined>; canManage: boolean }) {
  const [queue, filters] = await Promise.all([
    listDraftPublicationQueue({ search: query.search, aircraftId: query.aircraftId, fleetId: query.fleetId, week: query.week }),
    listScheduleFormOptions(),
  ]);
  const rows: PublicationQueueRow[] = queue.items.map(({ schedule, preview, previewError }) => {
    const blocking = preview?.blockingIssues ?? (previewError ? [previewError] : []);
    const warnings = preview?.warnings ?? [];
    const state: PublicationQueueRow["state"] = blocking.length ? "BLOCKED" : warnings.length ? "WARNING" : "READY";
    return {
      id: schedule.id,
      code: schedule.code,
      flightNumber: schedule.flightNumber ?? schedule.route.flightNumber ?? schedule.code,
      route: `${schedule.route.departure} → ${schedule.route.arrival}`,
      days: formatDays(schedule.daysOfWeek),
      utc: `${formatMinutes(schedule.departureTimeMinutesUtc)} → ${formatMinutes(schedule.arrivalTimeMinutesUtc)}`,
      fleet: schedule.defaultFleet?.code ?? "Libre",
      aircraft: schedule.assignedAircraft?.registration ?? "Sin asignar",
      effectivePeriod: `${formatDate(schedule.effectiveFrom)} → ${formatDate(schedule.effectiveUntil)}`,
      state,
      errors: blocking.length,
      warnings: warnings.length,
      expectedCreated: preview?.expectedCreated ?? 0,
      existing: preview?.existing ?? 0,
      warningFingerprint: preview?.warningFingerprint ?? "",
      issues: [...blocking, ...warnings].map(({ code, message }) => ({ code, message })),
    };
  });
  const failures = parseBatchFailures(query.batchFailures);
  const returnTo = `/staff/operations/programacion${queryString(query, {
    view: "publication",
    batchRequested: undefined,
    batchPublished: undefined,
    batchAlreadyPublished: undefined,
    batchCreated: undefined,
    batchExisting: undefined,
    batchFailed: undefined,
    batchFailures: undefined,
    error: undefined,
  })}`;

  return <section className="publication-workspace">
    <div className="page-heading"><div><div className="eyebrow">CONTROL DE PUBLICACIÓN</div><h2>Pendientes de publicación</h2><p className="page-copy">Revisa, selecciona y publica varias programaciones DRAFT sin abandonar la rotación.</p></div></div>
    {query.batchRequested && <div className="feedback success"><strong>Publicación por lotes completada.</strong> {query.batchPublished ?? "0"} publicadas, {query.batchAlreadyPublished ?? "0"} ya activas, {query.batchCreated ?? "0"} Flights creados y {query.batchFailed ?? "0"} no publicadas.</div>}
    {failures.length > 0 && <div className="feedback error"><strong>Programaciones no publicadas</strong><ul>{failures.map((failure, index) => <li key={`${failure.code}-${index}`}><strong>{failure.code}</strong> · {failure.errorCode ?? "PUBLICATION_FAILED"}{failure.message ? ` — ${failure.message}` : ""}</li>)}</ul></div>}
    <form className="audit-filters">
      <input type="hidden" name="view" value="publication"/>
      <label>Buscar<input name="search" defaultValue={query.search}/></label>
      <label>Aeronave<select name="aircraftId" defaultValue={query.aircraftId ?? ""}><option value="">Todas</option>{filters[2].map((aircraft) => <option key={aircraft.id} value={aircraft.id}>{aircraft.registration} · {aircraft.currentAirport?.icao ?? "—"}</option>)}</select></label>
      <label>Flota<select name="fleetId" defaultValue={query.fleetId ?? ""}><option value="">Todas</option>{filters[1].map((fleet) => <option key={fleet.id} value={fleet.id}>{fleet.code ?? fleet.name}</option>)}</select></label>
      <label>Semana<input name="week" type="date" defaultValue={query.week}/></label>
      <button className="button secondary">FILTRAR</button>
    </form>
    {queue.truncated && <div className="notice">Se muestran las primeras {queue.limit} de {queue.total} programaciones DRAFT. Aplica filtros para trabajar con una rotación concreta.</div>}
    {!rows.length ? <div className="empty-state card">No hay programaciones DRAFT pendientes con estos filtros.</div> : <PublicationQueue rows={rows} canPublish={canManage} returnTo={returnTo}/>} 
  </section>;
}

async function ListSurface({ query, canEdit }: { query: Record<string,string|undefined>; canEdit: boolean }) {
  const [result, filters] = await Promise.all([listFlightSchedules({ search: query.search, status: query.status, fleetId: query.fleetId, aircraftId: query.aircraftId, effectiveDate: query.effectiveDate, page: Number(query.page) || 1 }), listScheduleFormOptions()]);
  const rows = await Promise.all(result.rows.map(async (schedule) => ({ schedule, validation: await validateProposedSchedule(toProposedSchedule(schedule), { excludeScheduleId: schedule.id }) })));
  return <><form className="audit-filters"><input type="hidden" name="view" value="list"/><label>Buscar<input name="search" defaultValue={query.search}/></label><label>Estado<select name="status" defaultValue={query.status ?? ""}><option value="">Todos</option>{["DRAFT","ACTIVE","SUSPENDED","EXPIRED","ARCHIVED"].map((status)=><option key={status}>{status}</option>)}</select></label><label>Flota<select name="fleetId" defaultValue={query.fleetId ?? ""}><option value="">Todas</option>{filters[1].map((fleet)=><option key={fleet.id} value={fleet.id}>{fleet.code ?? fleet.name}</option>)}</select></label><button className="button secondary">Filtrar</button></form><div className="table-wrap programacion-table"><table><thead><tr><th>Programación</th><th>Ruta</th><th>Días</th><th>UTC</th><th>Flota / aeronave</th><th>Vigencia</th><th>Estado</th><th>Validación</th><th>Acciones</th></tr></thead><tbody>{rows.map(({ schedule, validation }) => { const target = schedule.assignedAircraftId ? `?view=planner&aircraftId=${schedule.assignedAircraftId}&week=${iso(normalizeWeekStartUtc(schedule.effectiveFrom))}&scheduleId=${schedule.id}` : `?view=unassigned&scheduleId=${schedule.id}`; return <tr key={schedule.id}><td><strong>{schedule.code}</strong><br/>{schedule.route.flightNumber}</td><td>{schedule.route.departure} → {schedule.route.arrival}</td><td>{formatDays(schedule.daysOfWeek)}</td><td>{formatMinutes(schedule.departureTimeMinutesUtc)} → {formatMinutes(schedule.arrivalTimeMinutesUtc)}</td><td>{schedule.defaultFleet?.code ?? "Libre"}<br/>{schedule.assignedAircraft?.registration ?? "Sin asignar"}</td><td>{formatDate(schedule.effectiveFrom)} → {formatDate(schedule.effectiveUntil)}</td><td>{schedule.status}</td><td>{validation.valid ? validation.warnings.length ? "ADVERTENCIAS" : "VÁLIDA" : `${validation.errors.length} CONFLICTOS`}</td><td><Link href={`/staff/operations/programacion/${schedule.id}`}>ABRIR DETALLE</Link> · <Link href={target}>ABRIR EN PLANIFICADOR</Link>{schedule.status === "DRAFT" && canEdit && <> · <Link href={`${target}&panel=schedule&mode=edit`}>EDITAR BORRADOR</Link></>}</td></tr>; })}</tbody></table></div><div className="button-row"><span>{result.total} programaciones</span>{result.page > 1 && <Link href={queryString(query,{page:String(result.page-1)})}>Anterior</Link>}{result.page * result.pageSize < result.total && <Link href={queryString(query,{page:String(result.page+1)})}>Siguiente</Link>}</div></>;
}

function PlannerSurface({ data, query, weekStart, canCreate, canEdit }: { data: NonNullable<Awaited<ReturnType<typeof getWeeklyAircraftPlannerData>>> | ReturnType<typeof buildDevelopmentPlannerData>; query: Record<string,string|undefined>; weekStart: Date; canCreate: boolean; canEdit: boolean }) {
  const selectedId = data.selectedAircraft?.id ?? "unassigned", prev = new Date(weekStart.getTime()-7*DAY), next = new Date(weekStart.getTime()+7*DAY);
  return <><section className="planner-controls card"><form><input type="hidden" name="view" value="planner"/><label>Aeronave<select name="aircraftId" defaultValue={selectedId}>{data.aircraft.map((item)=><option key={item.id} value={item.id}>{item.registration} · {item.nativeFleet?.code ?? "—"} · {item.currentAirport?.icao ?? "—"}</option>)}</select></label><label>Semana<input name="week" type="date" defaultValue={iso(weekStart)}/></label><button className="button">MOSTRAR</button></form><div className="planner-week-nav"><Link href={queryString(query,{week:iso(prev)})}>← Semana anterior</Link><Link href={queryString(query,{week:iso(normalizeWeekStartUtc(new Date()))})}>HOY</Link><strong>{iso(weekStart)} — {iso(new Date(weekStart.getTime()+6*DAY))}</strong><Link href={queryString(query,{week:iso(next)})}>Semana siguiente →</Link></div></section><WeeklyPlanner week={data.week} schedules={data.schedules} aircraftId={selectedId} fleetId={data.selectedAircraft?.nativeFleetId} canCreate={canCreate} canEdit={canEdit} initialScheduleId={query.scheduleId}/></>;
}

function UnassignedSurface({ data, query, canEdit }: { data: NonNullable<Awaited<ReturnType<typeof getWeeklyAircraftPlannerData>>> | ReturnType<typeof buildDevelopmentPlannerData>; query: Record<string,string|undefined>; canEdit: boolean }) { return <section className="planner-unassigned"><h2>PROGRAMACIONES SIN AERONAVE</h2>{data.schedules.map((schedule)=><article className="card" key={schedule.id}><div><strong>{schedule.route.flightNumber ?? schedule.code}</strong><span>{schedule.route.departure} → {schedule.route.arrival}</span><small>{formatDays(schedule.daysOfWeek)} · {formatMinutes(schedule.departureTimeMinutesUtc)} UTC · {schedule.defaultFleet?.code ?? "Flota libre"}</small></div><span className={`badge schedule-${schedule.status.toLowerCase()}`}>{schedule.status}</span><div className="button-row"><Link href={`/staff/operations/programacion/${schedule.id}`}>ABRIR DETALLE</Link>{schedule.status === "DRAFT" && canEdit && <Link href={queryString(query,{panel:"schedule",mode:"edit",scheduleId:schedule.id})}>ASIGNAR AERONAVE / EDITAR BORRADOR</Link>}</div></article>)}</section>; }

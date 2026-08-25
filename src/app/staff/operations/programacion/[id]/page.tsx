import Link from "next/link";
import { notFound } from "next/navigation";
import { ValidationIssues } from "@/components/programacion/validation-issues";
import { normalizeWeekStartUtc, reverseDraftSuggestion } from "@/lib/native-scheduling/planner";
import { formatDate, formatDays, formatDuration, formatMinutes } from "@/lib/native-scheduling/presentation";
import { previewSchedulePublication } from "@/lib/native-scheduling/publication";
import { getFlightSchedule } from "@/lib/native-scheduling/repository";
import { prisma } from "@/lib/prisma";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { staffHasPermission } from "@/lib/staff/permissions";
import {
  archiveProgramacionAction,
  duplicateProgramacionAction,
  generateProgramacionFlightsAction,
  publishProgramacionAction,
} from "../actions";

const utc = (date: Date) => new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }).format(date);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const workspaceHref = (values: Record<string, string | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  return `/staff/operations/programacion?${params.toString()}`;
};

export default async function ProgramacionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, query, staff] = await Promise.all([params, searchParams, getCurrentStaff()]);
  const schedule = await getFlightSchedule(id);
  if (!schedule) notFound();

  const [preview, audit] = await Promise.all([
    previewSchedulePublication(id),
    prisma.aocAuditLog.findMany({
      where: { entityType: "FlightSchedule", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const canManage = staffHasPermission(staff, "SCHEDULE_STATUS_MANAGE");
  const canCreate = staffHasPermission(staff, "SCHEDULE_CREATE");
  const canEdit = staffHasPermission(staff, "SCHEDULE_EDIT");
  const publishedAudit = audit.find(({ action }) => action === "SCHEDULE_PUBLISHED");
  const week = iso(normalizeWeekStartUtc(schedule.effectiveFrom));
  const view = schedule.assignedAircraftId ? "planner" : "unassigned";
  const commonPlannerContext = {
    view,
    aircraftId: schedule.assignedAircraftId ?? undefined,
    week,
    scheduleId: schedule.id,
  };
  const plannerHref = workspaceHref(commonPlannerContext);
  const editPlannerHref = workspaceHref({ ...commonPlannerContext, panel: "schedule", mode: "edit" });

  const reverse = reverseDraftSuggestion(schedule);
  const reverseHref = workspaceHref({
    view,
    aircraftId: schedule.assignedAircraftId ?? undefined,
    defaultFleetId: schedule.defaultFleetId ?? undefined,
    week,
    panel: "schedule",
    mode: "create",
    reverseOf: schedule.id,
    departure: reverse.departure,
    arrival: reverse.arrival,
    daysOfWeek: reverse.daysOfWeek.join(","),
    departureTimeMinutesUtc: String(reverse.departureTimeMinutesUtc),
    code: reverse.code,
    effectiveFrom: iso(schedule.effectiveFrom),
    effectiveUntil: schedule.effectiveUntil ? iso(schedule.effectiveUntil) : undefined,
  });

  return <>
    <div className="page-header">
      <div>
        <div className="eyebrow">PROGRAMACIÓN</div>
        <h1>{schedule.code}</h1>
        <p>{schedule.name ?? `${schedule.route.departure} → ${schedule.route.arrival}`}</p>
      </div>
      <div className="button-row">
        <Link href="/staff/operations/programacion?view=list">Volver</Link>
        <Link className="button secondary" href={plannerHref}>ABRIR EN PLANIFICADOR</Link>
        {schedule.status === "DRAFT" && canEdit && <Link className="button" href={editPlannerHref}>EDITAR BORRADOR</Link>}
        {schedule.status === "DRAFT" && canCreate && <Link className="button" href={reverseHref}>CREAR REGRESO</Link>}
      </div>
    </div>

    {query.error && <div className="notice">{query.error}</div>}
    {query.saved && <div className="notice">Borrador guardado. Validación actualizada.</div>}
    {query.duplicated && <div className="notice">Borrador duplicado correctamente.</div>}
    {query.published && <div className="notice">Programación publicada. Se crearon {query.created ?? "0"} vuelos y se conservaron {query.existing ?? "0"} existentes.</div>}
    {query.generated && <div className="notice">Horizonte actualizado: {query.created ?? "0"} vuelos nuevos, {query.existing ?? "0"} ya existentes.</div>}

    <section className="card programacion-detail">
      <div className="workflow-summary">
        <div><span>Ruta</span><strong>{schedule.route.departure} → {schedule.route.arrival}</strong></div>
        <div><span>Vuelo / Callsign</span><strong>{schedule.flightNumber ?? schedule.route.flightNumber ?? "—"} / {schedule.callsign ?? schedule.route.callsign ?? "—"}</strong></div>
        <div><span>Días</span><strong>{formatDays(schedule.daysOfWeek)}</strong></div>
        <div><span>Horario UTC</span><strong>{formatMinutes(schedule.departureTimeMinutesUtc)} → {formatMinutes(schedule.arrivalTimeMinutesUtc)}</strong></div>
        <div><span>Duración</span><strong>{formatDuration(schedule.scheduledDurationMinutes)}</strong></div>
        <div><span>Flota</span><strong>{schedule.defaultFleet?.code ?? "Libre"}</strong></div>
        <div><span>Aeronave</span><strong>{schedule.assignedAircraft?.registration ?? "Sin asignar"}</strong></div>
        <div><span>Vigencia</span><strong>{formatDate(schedule.effectiveFrom)} → {formatDate(schedule.effectiveUntil)}</strong></div>
        <div><span>Estado</span><strong>{schedule.status}</strong></div>
        <div><span>Flights relacionados</span><strong>{schedule._count.flights}</strong></div>
        <div><span>Reservas</span><strong>{schedule.bookingOpenOffsetMinutes} / {schedule.bookingCloseOffsetMinutes} min</strong></div>
        <div><span>Horizonte</span><strong>{schedule.generationHorizonDays} días</strong></div>
      </div>
      {schedule.notes && <p>{schedule.notes}</p>}
    </section>

    <section className="card programacion-publication">
      <h2>PUBLICACIÓN</h2>
      <p>La programación pasará a estado ACTIVE y se generarán los vuelos futuros dentro del horizonte configurado.</p>
      <div className="workflow-summary">
        <div><span>Vista previa</span><strong>{formatDate(preview.plan.rangeStart)} → {formatDate(preview.plan.rangeEnd)}</strong></div>
        <div><span>Candidatos</span><strong>{preview.plan.candidates.length}</strong></div>
        <div><span>Existentes</span><strong>{preview.existing}</strong></div>
        <div><span>Por crear</span><strong>{preview.expectedCreated}</strong></div>
        <div><span>Fechas omitidas</span><strong>{preview.plan.skipped.length}</strong></div>
        <div><span>Conflictos</span><strong>{preview.conflicts}</strong></div>
      </div>
      <ValidationIssues result={preview.validation}/>
      {preview.plan.warnings.map((warning) => <div className="notice" key={warning.code}><strong>{warning.code}</strong> · {warning.message}</div>)}
      {preview.blockingIssues.filter((item) => !preview.validation.errors.some(({ code }) => code === item.code)).map((item) => <div className="notice" key={item.code}><strong>{item.code}</strong> · {item.message}</div>)}
      {schedule.status === "DRAFT" && canManage && <form action={publishProgramacionAction} className="programacion-publish-form">
        <input type="hidden" name="id" value={id}/>
        <input type="hidden" name="warningFingerprint" value={preview.warningFingerprint}/>
        {preview.warnings.length > 0 && <label className="programacion-ack"><input type="checkbox" name="acknowledged" value="yes" required/> He revisado y acepto las advertencias actuales.</label>}
        <div className="button-row">
          <Link className="button secondary" href={`/staff/operations/programacion/${id}`}>ACTUALIZAR VISTA PREVIA</Link>
          <button className="button" disabled={preview.blockingIssues.length > 0}>PUBLICAR PROGRAMACIÓN</button>
        </div>
        {preview.blockingIssues.length > 0 && <p className="meta">Corrige los errores antes de publicar. <Link href={editPlannerHref}>Ir a Editar</Link></p>}
      </form>}
      {schedule.status === "ACTIVE" && <div>
        <p><strong>Publicada:</strong> {publishedAudit ? publishedAudit.createdAt.toLocaleString("es-ES") : "—"}</p>
        {canManage && <form action={generateProgramacionFlightsAction}><input type="hidden" name="id" value={id}/><button className="button secondary">AMPLIAR / ACTUALIZAR HORIZONTE</button></form>}
      </div>}
    </section>

    {schedule.status === "ACTIVE" && <section className="card">
      <h2>Vuelos programados</h2>
      <p className="meta">Se muestran como máximo los próximos 50 vuelos.</p>
      <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Vuelo</th><th>Ruta</th><th>Salida UTC</th><th>Llegada UTC</th><th>Horario local</th><th>Flota</th><th>Aeronave</th><th>Estado</th><th>Reserva</th></tr></thead><tbody>{schedule.flights.map((flight) => <tr key={flight.id}><td>{formatDate(flight.operatingDate)}</td><td>{flight.flightNumber}</td><td>{flight.departureIcao} → {flight.arrivalIcao}</td><td>{utc(flight.scheduledDeparture)}</td><td>{utc(flight.scheduledArrival)}</td><td>{flight.departureLocalTime} → {flight.arrivalLocalTime}</td><td>{flight.fleet?.code ?? "—"}</td><td>{flight.assignedAircraft?.registration ?? "—"}</td><td>{flight.status}</td><td>{flight.bookingOpenAt ? utc(flight.bookingOpenAt) : "—"} → {flight.bookingCloseAt ? utc(flight.bookingCloseAt) : "—"}</td></tr>)}</tbody></table></div>
      {!schedule.flights.length && <div className="empty-state">No hay vuelos generados dentro del horizonte actual.</div>}
    </section>}

    <section className="programacion-actions-grid">
      {canCreate && <form action={duplicateProgramacionAction} className="card">
        <h2>Duplicar como borrador</h2>
        <input type="hidden" name="id" value={id}/>
        <label>Nuevo código<input name="code" required defaultValue={`${schedule.code}-COPY`}/></label>
        <label>Válido desde<input name="effectiveFrom" type="date" required defaultValue={iso(schedule.effectiveFrom)}/></label>
        <label>Válido hasta<input name="effectiveUntil" type="date" defaultValue={schedule.effectiveUntil ? iso(schedule.effectiveUntil) : undefined}/></label>
        <button className="button secondary">Duplicar</button>
      </form>}
      {schedule.status === "DRAFT" && canManage && <form action={archiveProgramacionAction} className="card">
        <h2>Archivar borrador</h2>
        <p className="meta">El registro se conservará y no se eliminará.</p>
        <input type="hidden" name="id" value={id}/>
        <button className="button secondary">Archivar</button>
      </form>}
    </section>

    <section className="card">
      <h2>Auditoría</h2>
      {audit.length ? <div className="programacion-audit">{audit.map((item) => <div key={item.id}><strong>{item.action}</strong><span>{item.message}</span><time>{item.createdAt.toLocaleString("es-ES")}</time></div>)}</div> : <p className="meta">Sin actividad registrada.</p>}
    </section>
  </>;
}

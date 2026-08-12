import Link from "next/link";
import { notFound } from "next/navigation";
import { ScheduleForm } from "@/components/programacion/schedule-form";
import { normalizeWeekStartUtc, reverseDraftSuggestion } from "@/lib/native-scheduling/planner";
import { scheduleFormOptions, toFormValue } from "@/lib/native-scheduling/presentation";
import { getFlightSchedule } from "@/lib/native-scheduling/repository";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { staffHasPermission } from "@/lib/staff/permissions";
import { updateProgramacionAction } from "../../actions";

const iso = (date: Date) => date.toISOString().slice(0, 10);

export default async function EditProgramacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  await requireStaffPermission("SCHEDULE_EDIT", {
    entityType: "FlightSchedule",
    entityId: id,
    attemptedAction: "edit Programación draft",
  });

  const [schedule, options, staff] = await Promise.all([
    getFlightSchedule(id),
    scheduleFormOptions(),
    getCurrentStaff(),
  ]);

  if (!schedule) notFound();

  const week = iso(normalizeWeekStartUtc(schedule.effectiveFrom));
  const plannerParams = new URLSearchParams({
    view: schedule.assignedAircraftId ? "planner" : "unassigned",
    week,
    scheduleId: schedule.id,
    panel: "schedule",
    mode: "edit",
  });
  if (schedule.assignedAircraftId) plannerParams.set("aircraftId", schedule.assignedAircraftId);
  const plannerEditHref = `/staff/operations/programacion?${plannerParams.toString()}`;

  if (schedule.status !== "DRAFT") {
    return <>
      <div className="page-header">
        <div>
          <h1>Programación de solo lectura</h1>
          <p>Las programaciones {schedule.status} no se pueden editar directamente.</p>
        </div>
        <div className="button-row">
          <Link href={`/staff/operations/programacion/${id}`}>Volver al detalle</Link>
          <Link className="button secondary" href={plannerEditHref}>ABRIR EN PLANIFICADOR</Link>
        </div>
      </div>
    </>;
  }

  const reverse = reverseDraftSuggestion(schedule);
  const reverseParams = new URLSearchParams({
    view: "planner",
    panel: "schedule",
    mode: "create",
    reverseOf: schedule.id,
    departure: reverse.departure,
    arrival: reverse.arrival,
    daysOfWeek: reverse.daysOfWeek.join(","),
    departureTimeMinutesUtc: String(reverse.departureTimeMinutesUtc),
    code: reverse.code,
    week,
    effectiveFrom: iso(schedule.effectiveFrom),
  });
  if (schedule.effectiveUntil) reverseParams.set("effectiveUntil", iso(schedule.effectiveUntil));
  if (schedule.assignedAircraftId) reverseParams.set("aircraftId", schedule.assignedAircraftId);
  if (schedule.defaultFleetId) reverseParams.set("defaultFleetId", schedule.defaultFleetId);
  const reverseHref = `/staff/operations/programacion?${reverseParams.toString()}`;

  return <>
    <div className="page-header">
      <div>
        <div className="eyebrow">PROGRAMACIÓN</div>
        <h1>Editar borrador</h1>
        <p>{schedule.code}</p>
      </div>
      <div className="button-row">
        <Link href={`/staff/operations/programacion/${id}`}>Volver al detalle</Link>
        <Link className="button secondary" href={plannerEditHref}>ABRIR EN PLANIFICADOR</Link>
        {staffHasPermission(staff, "SCHEDULE_CREATE") && <Link className="button" href={reverseHref}>CREAR REGRESO</Link>}
      </div>
    </div>
    {query.error && <div className="notice">{query.error}</div>}
    <ScheduleForm
      action={updateProgramacionAction}
      value={toFormValue(schedule)}
      {...options}
      submitLabel="Guardar borrador"
      cancelHref={`/staff/operations/programacion/${id}`}
    />
  </>;
}

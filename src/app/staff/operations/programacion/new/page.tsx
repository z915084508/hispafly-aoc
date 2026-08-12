import Link from "next/link";
import { ScheduleForm } from "@/components/programacion/schedule-form";
import { scheduleFormOptions } from "@/lib/native-scheduling/presentation";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { createProgramacionAction } from "../actions";

export default async function NewProgramacionPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  await requireStaffPermission("SCHEDULE_CREATE", { entityType: "FlightSchedule", attemptedAction: "open new Programación draft" });
  const [query, options] = await Promise.all([searchParams, scheduleFormOptions()]);
  const today = new Date().toISOString().slice(0, 10);
  const reverseRoutes = query.departure && query.arrival ? options.routes.filter((route) => route.departure === query.departure && route.arrival === query.arrival) : [];
  const selectedRoute = query.routeId ? options.routes.find((route) => route.id === query.routeId) : undefined;
  const days = query.daysOfWeek?.split(",").map(Number).filter((day) => day >= 1 && day <= 7);
  const value = { code: query.code, routeId: selectedRoute?.id ?? (reverseRoutes.length === 1 ? reverseRoutes[0].id : undefined), assignedAircraftId: query.aircraftId, defaultFleetId: query.defaultFleetId ?? selectedRoute?.defaultFleetId, daysOfWeek: days, departureTimeMinutesUtc: query.departureTimeMinutesUtc ? Number(query.departureTimeMinutesUtc) : undefined, effectiveFrom: query.effectiveFrom ?? today, effectiveUntil: query.effectiveUntil };
  return <>
    <div className="page-header">
      <div><div className="eyebrow">OPERACIONES</div><h1>{query.reverseOf ? "Crear regreso" : "Nueva programación"}</h1><p>Crea un borrador. Los conflictos operativos no impiden guardarlo.</p></div>
      {query.planner && <Link href={`/staff/operations/programacion/planner?aircraftId=${query.aircraftId ?? "unassigned"}&week=${query.effectiveFrom ?? today}`}>Volver al planificador</Link>}
    </div>
    {query.reverseOf && reverseRoutes.length === 0 && <div className="notice">No existe una ruta operativa de regreso. Selecciona otra ruta o créala primero.</div>}
    {query.reverseOf && reverseRoutes.length > 1 && <div className="notice">Hay varias rutas de regreso. Selecciona la ruta correcta antes de guardar.</div>}
    {query.error && <div className="notice">{query.error}</div>}
    <ScheduleForm action={createProgramacionAction} value={value} {...options} submitLabel="Guardar borrador" cancelHref={query.returnTo?.startsWith("/staff/operations/airport-programacion?") ? query.returnTo : undefined} hiddenFields={query.returnTo?.startsWith("/staff/operations/airport-programacion?") ? { returnTo: query.returnTo } : undefined} allowReturnCreation={!query.reverseOf}/>
  </>;
}

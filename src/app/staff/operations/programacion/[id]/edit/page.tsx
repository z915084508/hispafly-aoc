import Link from "next/link";
import { notFound } from "next/navigation";
import { ScheduleForm } from "@/components/programacion/schedule-form";
import { getFlightSchedule } from "@/lib/native-scheduling/repository";
import { scheduleFormOptions, toFormValue } from "@/lib/native-scheduling/presentation";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { updateProgramacionAction } from "../../actions";
export default async function EditProgramacionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) { const [{ id }, query] = await Promise.all([params, searchParams]); await requireStaffPermission("SCHEDULE_EDIT", { entityType: "FlightSchedule", entityId: id, attemptedAction: "edit Programación draft" }); const [schedule, options] = await Promise.all([getFlightSchedule(id), scheduleFormOptions()]); if (!schedule) notFound(); if (schedule.status !== "DRAFT") return <><div className="page-header"><div><h1>Programación de solo lectura</h1><p>Las programaciones {schedule.status} no se pueden editar directamente.</p></div></div><Link href={`/staff/operations/programacion/${id}`}>Volver al detalle</Link></>; return <><div className="page-header"><div><div className="eyebrow">PROGRAMACIÓN</div><h1>Editar borrador</h1><p>{schedule.code}</p></div></div>{query.error && <div className="notice">{query.error}</div>}<ScheduleForm action={updateProgramacionAction} value={toFormValue(schedule)} {...options} submitLabel="Guardar borrador"/></>; }

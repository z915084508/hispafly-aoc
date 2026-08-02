import Link from "next/link";
import { WeeklyPlanner } from "@/components/programacion/weekly-planner";
import { buildDevelopmentPlannerData, getWeeklyAircraftPlannerData } from "@/lib/native-scheduling/planner-service";
import { normalizeWeekStartUtc } from "@/lib/native-scheduling/planner";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { staffHasPermission } from "@/lib/staff/permissions";

const DAY = 86_400_000;
const iso = (date: Date) => date.toISOString().slice(0,10);
const validDate = (value?: string) => { const date = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(); return Number.isFinite(date.getTime()) ? date : new Date(); };
export default async function PlannerPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const query = await searchParams, weekStart = normalizeWeekStartUtc(validDate(query.week)), staff = await getCurrentStaff();
  let data;
  try { data = query.demo === "1" ? buildDevelopmentPlannerData(weekStart) : await getWeeklyAircraftPlannerData({ aircraftId: query.aircraftId, weekStartUtc: weekStart, includeExpired: query.includeExpired === "1" }); }
  catch (error) { if (process.env.NODE_ENV === "production") throw error; data = buildDevelopmentPlannerData(weekStart); }
  const selectedId = data.unassigned ? "unassigned" : data.selectedAircraft?.id ?? "unassigned";
  const prev = new Date(weekStart.getTime()-7*DAY), next = new Date(weekStart.getTime()+7*DAY);
  const range = `${weekStart.toLocaleDateString("es-ES",{day:"2-digit",month:"short",timeZone:"UTC"})}–${new Date(weekStart.getTime()+6*DAY).toLocaleDateString("es-ES",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"})}`.toUpperCase();
  return <><div className="page-header"><div><div className="eyebrow">OPERACIONES · PROGRAMACIÓN</div><h1>Planificador semanal</h1><p>Rotación de aeronave en una semana real, con eje canónico UTC.</p></div><div className="button-row"><Link href="/staff/operations/programacion">Volver a la lista</Link><span className="badge">HORARIO UTC</span></div></div>
    <section className="planner-controls card"><form><label>Aeronave<select name="aircraftId" defaultValue={selectedId}><option value="unassigned">SIN AERONAVE ASIGNADA</option>{data.aircraft.map((item)=><option key={item.id} value={item.id}>{item.registration} · {item.aircraftType ?? "—"} · {item.nativeFleet?.code ?? "—"} · {item.currentAirport?.icao ?? "—"}</option>)}</select></label><label>Semana<input name="week" type="date" defaultValue={iso(weekStart)}/></label><label>Vista<select name="includeExpired" defaultValue={query.includeExpired??"0"}><option value="0">Operativas</option><option value="1">Mostrar expiradas</option></select></label>{query.demo === "1"&&<input type="hidden" name="demo" value="1"/>}<button className="button">MOSTRAR</button></form><div className="planner-week-nav"><Link href={`?aircraftId=${selectedId}&week=${iso(prev)}${query.demo==="1"?"&demo=1":""}`}>← Semana anterior</Link><Link href={`?aircraftId=${selectedId}&week=${iso(normalizeWeekStartUtc(new Date()))}${query.demo==="1"?"&demo=1":""}`}>HOY</Link><strong>{range}</strong><Link href={`?aircraftId=${selectedId}&week=${iso(next)}${query.demo==="1"?"&demo=1":""}`}>Semana siguiente →</Link></div></section>
    {data.unassigned ? <section className="planner-unassigned"><h2>PROGRAMACIONES SIN AERONAVE</h2>{data.schedules.map((schedule)=><article className="card" key={schedule.id}><div><strong>{schedule.route.flightNumber ?? schedule.code}</strong><span>{schedule.route.departure} → {schedule.route.arrival}</span><small>{schedule.daysOfWeek.join(" · ")} · {String(Math.floor(schedule.departureTimeMinutesUtc/60)).padStart(2,"0")}:{String(schedule.departureTimeMinutesUtc%60).padStart(2,"0")} UTC</small></div><span className={`badge schedule-${schedule.status.toLowerCase()}`}>{schedule.status}</span><div className="button-row"><Link href={`/staff/operations/programacion/${schedule.id}`}>ABRIR DETALLE</Link>{schedule.status==="DRAFT"&&staffHasPermission(staff,"SCHEDULE_EDIT")&&<Link href={`/staff/operations/programacion/${schedule.id}/edit?planner=1`}>ASIGNAR AERONAVE</Link>}</div></article>)}</section> : <WeeklyPlanner week={data.week} schedules={data.schedules} aircraftId={selectedId} fleetId={data.selectedAircraft?.nativeFleetId} canCreate={staffHasPermission(staff,"SCHEDULE_CREATE")} canEdit={staffHasPermission(staff,"SCHEDULE_EDIT")}/>}
  </>;
}

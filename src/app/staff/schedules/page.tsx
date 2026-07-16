import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { staffHasPermission } from "@/lib/staff/permissions";
import { activateAndGenerateAction } from "./actions";

export default async function SchedulesPage() {
  const from = new Date().toISOString().slice(0, 10);
  const toDate = new Date();
  toDate.setUTCDate(toDate.getUTCDate() + 30);
  const to = toDate.toISOString().slice(0, 10);
  const [staff, schedules] = await Promise.all([
    getCurrentStaff(),
    prisma.flightSchedule.findMany({
      include: { route: true, defaultFleet: true, assignedAircraft: true, _count: { select: { flights: true } } },
      orderBy: [{ status: "asc" }, { code: "asc" }],
    }),
  ]);
  return <>
    <div className="page-header"><div><div className="eyebrow">NATIVE OPERATIONS</div><h1>Schedules</h1><p>Recurring local-time rules that generate independent HispaFly flights.</p></div>{staffHasPermission(staff, "SCHEDULE_CREATE") && <Link className="button" href="/staff/schedules/new">New schedule</Link>}</div>
    <div className="table-wrap"><table><thead><tr><th>Schedule</th><th>Route</th><th>Days</th><th>Local departure</th><th>Fleet / Aircraft</th><th>Status</th><th>Flights</th><th>Generation</th></tr></thead><tbody>
      {schedules.map((schedule) => <tr key={schedule.id}><td><strong>{schedule.code}</strong><br/>{schedule.name}</td><td>{schedule.route.departure} → {schedule.route.arrival}</td><td>{schedule.daysOfWeek.join(", ")}</td><td>{String(Math.floor(schedule.departureLocalTimeMinutes / 60)).padStart(2, "0")}:{String(schedule.departureLocalTimeMinutes % 60).padStart(2, "0")} {schedule.departureTimezone}</td><td>{schedule.defaultFleet?.code ?? "Any"} / {schedule.assignedAircraft?.registration ?? "Unassigned"}</td><td><span className="badge">{schedule.status}</span></td><td>{schedule._count.flights}</td><td>{staffHasPermission(staff, "SCHEDULE_GENERATE") && <form action={activateAndGenerateAction}><input type="hidden" name="scheduleId" value={schedule.id}/><input type="hidden" name="from" value={from}/><input type="hidden" name="to" value={to}/><button className="button secondary">Activate + 30 days</button></form>}</td></tr>)}
    </tbody></table></div>
    {!schedules.length && <div className="empty-state">No native schedules have been created.</div>}
  </>;
}

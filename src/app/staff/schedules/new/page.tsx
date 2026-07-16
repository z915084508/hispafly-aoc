import { prisma } from "@/lib/prisma";
import { createScheduleAction } from "../actions";

export default async function NewSchedulePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [query, routes, fleets] = await Promise.all([
    searchParams,
    prisma.route.findMany({ where: { operationalStatus: "ACTIVE" }, include: { departureAirport: true, arrivalAirport: true }, orderBy: { routeCode: "asc" } }),
    prisma.fleet.findMany({ where: { operationalStatus: "ACTIVE" }, orderBy: { code: "asc" } }),
  ]);
  return <><div className="page-header"><div><div className="eyebrow">NATIVE OPERATIONS</div><h1>New schedule</h1><p>Times are entered in airport-local time with explicit IANA time zones.</p></div></div>
    {query.error && <div className="notice">{query.error}</div>}
    <form action={createScheduleAction} className="form-grid">
      <label>Code<input name="code" required placeholder="HF-LEVC-LEMD-AM"/></label><label>Name<input name="name"/></label>
      <label>Route<select name="routeId" required><option value="">Select route</option>{routes.map((route) => <option key={route.id} value={route.id}>{route.routeCode ?? route.flightNumber}: {route.departure} → {route.arrival}</option>)}</select></label>
      <label>Default fleet<select name="defaultFleetId"><option value="">Any compatible fleet</option>{fleets.map((fleet) => <option key={fleet.id} value={fleet.id}>{fleet.code ?? fleet.name}</option>)}</select></label>
      <label>Departure local time<input name="departureTime" type="time" required/></label><label>Duration (minutes)<input name="duration" type="number" min="1" max="1440" required/></label>
      <label>Departure time zone<input name="departureTimezone" required placeholder="Europe/Madrid"/></label><label>Arrival time zone<input name="arrivalTimezone" required placeholder="Europe/Madrid"/></label>
      <label>Effective from<input name="effectiveFrom" type="date" required/></label><label>Effective until<input name="effectiveUntil" type="date"/></label>
      <label>Generation horizon (days)<input name="generationHorizonDays" type="number" min="1" max="365" defaultValue="30"/></label>
      <fieldset><legend>Operating weekdays</legend>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((label, index) => <label key={label}><input type="checkbox" name="daysOfWeek" value={index + 1}/>{label}</label>)}</fieldset>
      <div className="button-row"><button className="button">Create draft schedule</button></div>
    </form>
  </>;
}

import Link from "next/link";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { requirePilotSession } from "@/lib/pilot/session";
import { getPilotRoster } from "@/lib/roster/service";
import styles from "./roster.module.css";

export const dynamic = "force-dynamic";

const monthKey = (date: Date) => date.toISOString().slice(0, 7);
const validMonth = (value?: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "") ? value! : monthKey(new Date());
const shiftMonth = (value: string, amount: number) => { const date = new Date(`${value}-01T00:00:00.000Z`); date.setUTCMonth(date.getUTCMonth() + amount); return monthKey(date); };

export default async function PilotRosterPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const [pilot, query] = await Promise.all([requirePilotSession(), searchParams]);
  const month = validMonth(query.month);
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  const rows = await getPilotRoster(pilot.id, { from: start, to: end });
  const firstWeekday = (start.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0)).getUTCDate();
  const byDay = Map.groupBy(rows, (row) => row.departureTime.getUTCDate());
  const cells = Array.from({ length: Math.ceil((firstWeekday + days) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= days ? day : null;
  });
  const title = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(start);
  return <PilotPortalShell>
    <header className={styles.header}><div><div className="eyebrow">MY SCHEDULE</div><h1>My Roster</h1><p>Your future PROGRAMACIÓN reservations from the shared AOC roster.</p></div><nav><Link href={`?month=${shiftMonth(month, -1)}`}>← Previous</Link><strong>{title}</strong><Link href={`?month=${shiftMonth(month, 1)}`}>Next →</Link></nav></header>
    <section className={styles.calendar} aria-label={`${title} roster calendar`}>
      {['MON','TUE','WED','THU','FRI','SAT','SUN'].map((label) => <div className={styles.weekday} key={label}>{label}</div>)}
      {cells.map((day, index) => <div className={`${styles.day} ${day ? "" : styles.outside}`} key={index}>
        {day && <><span className={styles.dayNumber}>{day}</span>{(byDay.get(day) ?? []).map((flight) => <Link className={styles.flight} href={`/pilot/bookings/${flight.id}`} key={flight.id}><strong>{flight.flightNumber}</strong><span>{flight.departure} → {flight.arrival}</span><span>{flight.departureTime.toISOString().slice(11,16)}Z · {flight.aircraftRegistration ?? "TBA"}</span><b>{flight.status}</b></Link>)}</>}
      </div>)}
    </section>
    {!rows.length && <div className="empty-state">No reserved flights in this month. Reserve a concrete flight from PROGRAMACIÓN to add it automatically.</div>}
  </PilotPortalShell>;
}

import Link from "next/link";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { createAirportAction } from "../actions";
import { AirportForm } from "../airport-form";
export default async function NewAirport({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireStaffPermission("AIRPORT_CREATE", { entityType: "Airport", attemptedAction: "open new airport form" });
  const query = await searchParams;
  return <><div className="page-header"><div><div className="eyebrow">NETWORK PLANNING</div><h1>New airport</h1><p>Create a HispaFly Native airport. ICAO is the permanent operational identity.</p></div><Link href="/staff/airports">Back</Link></div>{query.error && <div className="notice">{query.error}</div>}<AirportForm action={createAirportAction} submitLabel="Create airport"/></>;
}

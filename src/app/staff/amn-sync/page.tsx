import Link from "next/link";
import { requireStaffPermission } from "@/lib/staff/authorization";
import AmnSyncClient from "./sync-client";

export default async function AmnSyncPage() {
  await requireStaffPermission("ROUTE_EDIT", {
    entityType: "AMNIntegration",
    attemptedAction: "view HISPAFLY to AMN synchronization",
  });

  return <>
    <div className="page-header">
      <div>
        <div className="eyebrow">AMN TEST INTEGRATION</div>
        <h1>Network Sync</h1>
        <p>Initial import and reconciliation for HISPAFLY operational airports, routes and future PROGRAMACIÓN flights.</p>
      </div>
      <div className="button-row">
        <Link className="button secondary" href="/staff/flights">Flights</Link>
        <Link className="button secondary" href="/staff/schedules">Schedules</Link>
      </div>
    </div>
    <AmnSyncClient />
  </>;
}

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { staffHasPermission } from "@/lib/staff/permissions";
import {
  staffCancelDispatchAction,
  staffReleaseDispatchAction,
  staffRunDispatchChecksAction,
  staffVoidDispatchAction,
} from "../actions";

export default async function StaffDispatchDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [{ id }, query, staff] = await Promise.all([params, searchParams, getCurrentStaff()]);
  const row = await prisma.flightDispatch.findUnique({
    where: { id },
    include: { pilot: true, booking: true, flight: true, aircraft: true, ofpBriefing: { include: { dispatchRelease: true } } },
  });
  if (!row) notFound();
  const release = row.ofpBriefing?.dispatchRelease;
  const blocks = Array.isArray(release?.blockingItems) ? release.blockingItems as string[] : [];
  const warnings = Array.isArray(release?.warnings) ? release.warnings as string[] : [];
  const native = row.dataOrigin === "HISPAFLY_NATIVE";

  return <>
    <div className="page-header"><div>
      <div className="eyebrow">{native ? "NATIVE DISPATCH" : "LEGACY READ-ONLY"}</div>
      <h1>{row.flight?.flightNumber} · v{row.version}</h1>
      <p>{row.pilot.displayName} · {row.status}</p>
    </div></div>
    {query.error && <div className="notice">{query.error}</div>}
    {query.success && <div className="notice success">{query.success}</div>}
    {blocks.map((item) => <div className="notice" key={item}>{item}</div>)}
    {native && staffHasPermission(staff, "DISPATCH_RUN_CHECKS") && <form action={staffRunDispatchChecksAction}>
      <input type="hidden" name="dispatchId" value={row.id}/>
      <button className="button secondary">Run checks</button>
    </form>}
    {native && staffHasPermission(staff, "DISPATCH_RELEASE") && row.status !== "RELEASED" && <form action={staffReleaseDispatchAction}>
      {warnings.map((item) => <label key={item}><input type="checkbox" name="warning" value={item} required/>Acknowledge {item}</label>)}
      <input type="hidden" name="dispatchId" value={row.id}/>
      <label>Release comment<input name="comment"/></label>
      <button className="button">Release Dispatch</button>
    </form>}
    {native && staffHasPermission(staff, "DISPATCH_EDIT") && row.status !== "RELEASED" && !["CANCELLED", "VOIDED", "FLOWN"].includes(row.status) && <form action={staffCancelDispatchAction}>
      <input type="hidden" name="dispatchId" value={row.id}/>
      <label>Cancellation reason<input name="reason" required/></label>
      <button className="button secondary">Cancel Dispatch</button>
    </form>}
    {native && staffHasPermission(staff, "DISPATCH_VOID") && row.status === "RELEASED" && <form action={staffVoidDispatchAction}>
      <input type="hidden" name="dispatchId" value={row.id}/>
      <label>Void reason<input name="reason" required/></label>
      <button className="button secondary">Void Released Dispatch</button>
    </form>}
  </>;
}

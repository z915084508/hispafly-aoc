import { notFound } from "next/navigation";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { PageHeading } from "@/components/page-heading";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";
import { releasePilotDispatchAction, runPilotDispatchChecksAction } from "../actions";
import { recoverNativeReleaseState } from "@/lib/native-flight/dispatch";
export default async function PilotDispatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const [{ id }, query, pilot] = await Promise.all([params, searchParams, requirePilotSession()]);
  const owned = await prisma.flightDispatch.findFirst({ where: { id, pilotId: pilot.id }, select: { id: true } });
  if (owned) await recoverNativeReleaseState(id);
  const dispatch = await prisma.flightDispatch.findFirst({ where: { id, pilotId: pilot.id }, include: { booking: true, flight: true, aircraft: true, ofpBriefing: { include: { dispatchRelease: true } } } });
  if (!dispatch || !dispatch.flight) notFound();
  const release = dispatch.ofpBriefing?.dispatchRelease;
  const blocks = Array.isArray(release?.blockingItems) ? release.blockingItems as string[] : [];
  const warnings = Array.isArray(release?.warnings) ? release.warnings as string[] : [];
  return <PilotPortalShell><PageHeading eyebrow="NATIVE DISPATCH" title={`${dispatch.flight.flightNumber} · Version ${dispatch.version}`} copy={`${dispatch.flight.departureIcao} → ${dispatch.flight.arrivalIcao} · ${dispatch.status}`}/>{query.error && <div className="feedback error">{query.error}</div>}{query.success && <div className="feedback success">{query.success}</div>}<section className="card"><div className="workflow-summary"><div><span>Aircraft</span><strong>{dispatch.aircraft?.registration}</strong></div><div><span>OFP</span><strong>{dispatch.ofpBriefing?.status ?? "Missing"}</strong></div><div><span>Risk</span><strong>{release?.riskLevel ?? "Not checked"}</strong></div><div><span>Expires</span><strong>{dispatch.expiresAt?.toISOString()}</strong></div></div>{blocks.map((item) => <div className="feedback error" key={item}>{item}</div>)}{warnings.map((item) => <div className="notice" key={item}>{item}</div>)}<div className="button-row">{dispatch.status !== "RELEASED" && <form action={runPilotDispatchChecksAction}><input type="hidden" name="dispatchId" value={dispatch.id}/><button className="button secondary">Run checks</button></form>}{dispatch.ofpBriefing && <a className="button secondary" href={`/pilot/ofp/${dispatch.ofpBriefing.id}`}>{dispatch.status === "RELEASED" ? "Continue to OFP and VATSIM" : "Open OFP"}</a>}</div>{dispatch.status !== "RELEASED" && <form action={releasePilotDispatchAction}><input type="hidden" name="dispatchId" value={dispatch.id}/>{warnings.map((warning) => <label key={warning}><input type="checkbox" name="warning" value={warning} required/>Acknowledge: {warning}</label>)}<label>Release comment<input name="comment"/></label><button className="button">Sign and release</button></form>}</section></PilotPortalShell>;
}

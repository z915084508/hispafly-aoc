import Link from "next/link";
import { notFound } from "next/navigation";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { PageHeading } from "@/components/page-heading";
import { OfpSignaturePad } from "@/components/ofp-signature-pad";
import { OfpGenerateButton } from "@/components/ofp-generate-button";
import { DispatchReleasePanel } from "@/components/dispatch-release-panel";
import { FuelPolicyPanel } from "@/components/fuel-policy-panel";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";
import { finalDispatchOFPAction, generateSimbriefOFPAction } from "../actions";
import { cancelFlightDispatchAction } from "../../flight-offers/actions";
import { normalizeFlightIdentity } from "@/lib/dispatch/flightIdentity";
import { safeSimbriefPdfUrl } from "@/lib/simbrief/pdf";
import { summarizeSimbriefOfp } from "@/lib/simbrief/response";
import { getTranslations } from "@/lib/i18n/server";
import { buildVatsimPrefile } from "@/lib/vatsim/prefile";
import { VatsimFlightPlanPanel } from "@/components/vatsim-flight-plan-panel";

export const dynamic = "force-dynamic";

const show = (value: string | number | null | undefined, suffix = "") => value === null || value === undefined || value === "" ? "—" : `${value}${suffix}`;

export default async function PilotOfpPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  const pilot = await requirePilotSession();
  const { id } = await params;
  const messages = await searchParams;
  const { t } = await getTranslations();
  const ofp = await prisma.ofpBriefing.findFirst({ where: { id, flightDispatch: { pilotId: pilot.id } }, include: { flightDispatch: { include: { flightOffer: true } }, dispatchRelease: true } });
  if (!ofp) notFound();
  const dispatch = ofp.flightDispatch, offer = dispatch.flightOffer;
  const identity = normalizeFlightIdentity({ flightNumber: offer.flightNumber, callsign: offer.callsign });
  const summary = summarizeSimbriefOfp(ofp.ofpSnapshot);
  const hasPdf = Boolean(safeSimbriefPdfUrl(ofp.pdfUrl));
  const token = await prisma.navigraphOAuthToken.findUnique({ where: { pilotId: pilot.id }, select: { revokedAt: true } });
  const navigraphConnected = Boolean(token && !token.revokedAt);
  const canGenerate = ofp.status !== "SIGNED" && ofp.status !== "VOIDED";
  const vatsimPrefile = buildVatsimPrefile(ofp.ofpSnapshot, { callsign: identity.atcCallsign, aircraftType: offer.aircraftType, aircraftRegistration: offer.aircraftRegistration, departureIcao: offer.departureIcao, arrivalIcao: offer.arrivalIcao, route: offer.userRoute, altitude: offer.altitude, departureAt: dispatch.selectedDepartureAt });
  const vatsimUnlocked = ofp.status === "SIGNED" && dispatch.status === "DISPATCHED";

  return <PilotPortalShell>
    <PageHeading eyebrow="FLIGHT OPERATIONS" title={`OFP ${identity.commercialFlightNumber || offer.title}`} copy={`${offer.departureIcao} → ${offer.arrivalIcao} · Version ${ofp.version}`} />
    {messages.success && <div className="feedback success">{messages.success}</div>}
    {messages.error && <div className="feedback error">{messages.error}</div>}
    <DispatchReleasePanel release={ofp.dispatchRelease}/>
    <section className="card">
      <div className="card-header"><h2 className="card-title">Dispatch package</h2><strong>{ofp.status}</strong></div>
      <div className="workflow-summary">
        <div><span>Flight Number</span><strong>{show(identity.commercialFlightNumber)}</strong></div>
        <div><span>Callsign</span><strong>{show(identity.atcCallsign)}</strong></div>
        <div><span>Aircraft</span><strong>{show(offer.aircraftRegistration ?? offer.aircraftType)}</strong></div>
        <div><span>Route</span><strong>{show(summary.route ?? offer.userRoute ?? `${offer.departureIcao} ${offer.arrivalIcao}`)}</strong></div>
        <div><span>Departure / Arrival</span><strong>{offer.departureIcao} → {offer.arrivalIcao}</strong></div>
        <div><span>Alternate</span><strong>{show(summary.alternate)}</strong></div>
        <div><span>Block time</span><strong>{show(summary.blockTime)}</strong></div>
        <div><span>Air time</span><strong>{show(summary.airTime)}</strong></div>
        <div><span>Pax</span><strong>{show(offer.passengers)}</strong></div>
        <div><span>Cargo</span><strong>{show(offer.freightKg ?? offer.cargoKg ?? 0, " kg")}</strong></div>
        <div><span>ZFW</span><strong>{show(summary.zfw, " kg")}</strong></div>
        <div><span>TOW</span><strong>{show(summary.tow, " kg")}</strong></div>
        <div><span>Landing weight</span><strong>{show(summary.landingWeight, " kg")}</strong></div>
        <div><span>Fuel summary</span><strong>Block {show(summary.blockFuel)} · Trip {show(summary.tripFuel)} · Reserve {show(summary.reserveFuel)}</strong></div>
      </div>
      <div className="ofp-document-actions">
        {canGenerate && navigraphConnected && <form action={generateSimbriefOFPAction}><input type="hidden" name="ofpId" value={ofp.id}/><OfpGenerateButton idleLabel={t("ofp.generate")} pendingLabel={t("ofp.preparing")}/></form>}
        {hasPdf ? <Link className="button secondary" href={`/api/ofp/${ofp.id}/pdf`} target="_blank">{t("ofpPdf.openPdf")}</Link> : <button className="button secondary disabled-button" type="button" disabled>{t("ofp.pdfNotAvailable")}</button>}
      </div>
      {!navigraphConnected && canGenerate && <div className="notice"><p>{t("ofp.connectNavigraph")}</p><Link className="button" href="/api/auth/navigraph/start">{t("pilot.integrations.connectNavigraph")}</Link></div>}
    </section>
    <FuelPolicyPanel snapshot={ofp.fuelPolicySnapshot}/>
    <section className="card">
      <div className="card-header"><h2 className="card-title">Pilot acceptance</h2><span className="meta">Hash {ofp.contentHash.slice(0, 12)}</span></div>
      {ofp.status === "SIGNED" ? <>
        <div className="feedback success">Signed by {ofp.signedByName} ({ofp.signedByCallsign ?? "Pilot"}) at {ofp.signedAt?.toISOString()}.</div>
        {dispatch.status === "DISPATCHING" && (ofp.dispatchRelease?.status === "SIGNED" ? <form action={finalDispatchOFPAction}><input type="hidden" name="ofpId" value={ofp.id}/><input type="hidden" name="dispatchId" value={ofp.flightDispatchId}/><button className="button" type="submit">FINAL DISPATCH TO vAMSYS</button></form> : <button className="button disabled-button" type="button" disabled>FINAL DISPATCH BLOCKED BY RELEASE</button>)}
        {dispatch.vamsysBookingId && <p><strong>vAMSYS Booking:</strong> {dispatch.vamsysBookingId}</p>}
      </> : ofp.status === "AWAITING_SIGNATURE" ? <OfpSignaturePad ofpId={ofp.id}/> : <div className="notice">{t("ofp.generateBeforeSigning")}</div>}
      {dispatch.status === "DISPATCHING" && <form action={cancelFlightDispatchAction}><input type="hidden" name="dispatchId" value={ofp.flightDispatchId}/><button className="action-button reject" type="submit">Cancel pre-dispatch</button></form>}
    </section>
    {!vatsimUnlocked && <div className="notice">{ofp.status !== "SIGNED" ? "Review and sign the OFP before VATSIM prefiling." : "Complete Final Dispatch to vAMSYS before opening the VATSIM prefile form."}</div>}
    <VatsimFlightPlanPanel ofpId={ofp.id} fields={vatsimPrefile.fields} icaoText={vatsimPrefile.icaoText} missing={vatsimPrefile.missing} unlocked={vatsimUnlocked}/>
  </PilotPortalShell>;
}

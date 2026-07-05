import Link from "next/link";
import { notFound } from "next/navigation";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { PageHeading } from "@/components/page-heading";
import { OfpSignaturePad } from "@/components/ofp-signature-pad";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";
import { finalDispatchOFPAction, importSimbriefOFPAction } from "../actions";
import { cancelFlightDispatchAction } from "../../flight-offers/actions";
import { normalizeFlightIdentity } from "@/lib/dispatch/flightIdentity";
import { safeSimbriefPdfUrl } from "@/lib/simbrief/pdf";
import { getTranslations } from "@/lib/i18n/server";
import { normalizeSimbriefUserId, simbriefUrlWithUserId } from "@/lib/simbrief/userId";
import { savePilotSimbriefIdAction } from "@/app/pilot/profile/actions";

export const dynamic = "force-dynamic";
export default async function PilotOfpPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string; simbrief?: string }> }) {
  const pilot = await requirePilotSession(); const { id } = await params; const messages = await searchParams; const { t } = await getTranslations();
  const ofp = await prisma.ofpBriefing.findFirst({ where: { id, flightDispatch: { pilotId: pilot.id } }, include: { flightDispatch: { include: { flightOffer: true } } } });
  if (!ofp) notFound(); const offer = ofp.flightDispatch.flightOffer;
  const identity = normalizeFlightIdentity({ flightNumber: offer.flightNumber, callsign: offer.callsign });
  const hasPdf = Boolean(safeSimbriefPdfUrl(ofp.pdfUrl));
  let simbriefId: string | null = null; try { simbriefId = normalizeSimbriefUserId(pilot.simbriefUserId); } catch { simbriefId = null; }
  const simbriefGenerateUrl = simbriefId ? simbriefUrlWithUserId(ofp.ofpUrl, simbriefId) : null;
  return <PilotPortalShell><PageHeading eyebrow="FLIGHT OPERATIONS" title={`OFP ${identity.commercialFlightNumber || offer.title}`} copy={`${offer.departureIcao} → ${offer.arrivalIcao} · Version ${ofp.version}`} />
    {messages.success && <div className="feedback success">{messages.success}</div>}{messages.error && <div className="feedback error">{messages.error}</div>}{messages.simbrief === "saved" && <div className="feedback success">{t("pilot.profile.simbriefIdSaved")}</div>}{messages.simbrief === "invalid" && <div className="feedback error">{t("pilot.profile.simbriefIdInvalid")}</div>}
    <section className="card"><div className="card-header"><h2 className="card-title">Dispatch package</h2><strong>{ofp.status}</strong></div>
      <div className="workflow-summary"><div><span>Flight Number</span><strong>{identity.commercialFlightNumber || "—"}</strong></div><div><span>Callsign</span><strong>{identity.atcCallsign || "—"}</strong></div><div><span>Airline / radiotelephony</span><strong>{identity.airlineName}</strong></div><div><span>Aircraft</span><strong>{offer.aircraftRegistration ?? offer.aircraftType}</strong></div><div><span>Passengers / LF</span><strong>{offer.passengers ?? "—"} / {offer.loadFactorPercent ?? "—"}%</strong></div><div><span>Luggage / Freight</span><strong>{offer.luggageKg ?? 0} / {offer.freightKg ?? 0} kg</strong></div></div>
      <p className="ofp-document-actions">{simbriefGenerateUrl ? <Link className="button" href={simbriefGenerateUrl} target="_blank">Generate / open in SimBrief</Link> : <button className="button disabled-button" type="button" disabled>{t("ofp.prepareRequiresSimbriefId")}</button>}{hasPdf ? <Link className="button secondary" href={`/api/ofp/${ofp.id}/pdf`} target="_blank">{t("ofpPdf.openPdf")}</Link> : <><button className="button secondary disabled-button" type="button" disabled>{t("ofpPdf.notAvailable")}</button><Link className="action-button" href={`/pilot/ofp/${ofp.id}`}>{t("ofpPdf.openDetail")}</Link></>}</p>
      {simbriefId ? <><div className="notice">{t("ofp.simbriefId")}: <strong>{simbriefId}</strong> · <Link href="/pilot/dashboard#simbrief-profile">{t("ofp.changeSimbriefId")}</Link></div><form action={importSimbriefOFPAction} className="inline-action-form"><input type="hidden" name="ofpId" value={ofp.id}/><button className="action-button approve" type="submit">UPLOAD LATEST OFP TO AOC</button></form><details className="card"><summary>{t("ofp.changeSimbriefId")}</summary><form action={importSimbriefOFPAction} className="inline-action-form"><input type="hidden" name="ofpId" value={ofp.id}/><label>{t("ofp.simbriefId")}<input name="simbriefUserId" defaultValue={simbriefId} maxLength={64} pattern="[A-Za-z0-9_-]+" required/></label><label><input type="checkbox" name="saveSimbriefUserId" value="yes"/> {t("pilot.profile.saveSimbriefId")}</label><button className="action-button approve" type="submit">UPLOAD LATEST OFP TO AOC</button></form></details></> : <div className="notice"><p>{t("ofp.prepareRequiresSimbriefId")}</p><form action={savePilotSimbriefIdAction} className="inline-action-form"><input type="hidden" name="returnTo" value={`/pilot/ofp/${ofp.id}`}/><label>{t("pilot.profile.simbriefId")}<input name="simbriefUserId" maxLength={64} pattern="[A-Za-z0-9_-]+" required/></label><button className="button" type="submit">{t("pilot.profile.saveSimbriefId")}</button></form></div>}
    </section>
    <section className="card"><div className="card-header"><h2 className="card-title">Pilot acceptance</h2><span className="meta">Hash {ofp.contentHash.slice(0, 12)}</span></div>
      {ofp.status === "SIGNED" ? <><div className="feedback success">Signed by {ofp.signedByName} ({ofp.signedByCallsign ?? "Pilot"}) at {ofp.signedAt?.toISOString()}.</div>{ofp.flightDispatch.status === "DISPATCHING" && <form action={finalDispatchOFPAction}><input type="hidden" name="ofpId" value={ofp.id}/><input type="hidden" name="dispatchId" value={ofp.flightDispatchId}/><button className="button" type="submit">FINAL DISPATCH TO vAMSYS</button></form>}{ofp.flightDispatch.vamsysBookingId && <p><strong>vAMSYS Booking:</strong> {ofp.flightDispatch.vamsysBookingId}</p>}</> : ofp.status === "AWAITING_SIGNATURE" ? <OfpSignaturePad ofpId={ofp.id}/> : <div className="notice">Generate the flight in SimBrief and upload the OFP to AOC before signing.</div>}
      {ofp.flightDispatch.status === "DISPATCHING" && <form action={cancelFlightDispatchAction}><input type="hidden" name="dispatchId" value={ofp.flightDispatchId}/><button className="action-button reject" type="submit">Cancel pre-dispatch</button></form>}</section>
  </PilotPortalShell>;
}

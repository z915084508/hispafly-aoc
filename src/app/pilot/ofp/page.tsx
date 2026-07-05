import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PilotOfpListPage() {
  const pilot = await requirePilotSession();
  const briefings = await prisma.ofpBriefing.findMany({
    where: { flightDispatch: { pilotId: pilot.id } },
    include: { flightDispatch: { include: { flightOffer: true } } },
    orderBy: { createdAt: "desc" },
  });
  const tone = (status: string) => status === "SIGNED" ? "green" as const : status === "VOIDED" ? "red" as const : "amber" as const;
  return <PilotPortalShell>
    <PageHeading eyebrow="FLIGHT OPERATIONS" title="My OFP" copy="Prepare, review, sign and final-dispatch your personal operational flight plans."/>
    <section className="card ranking-card">
      <div className="card-header"><h2 className="card-title">OFP workspace</h2><span className="meta">{briefings.length} flight plans</span></div>
      {briefings.length ? <DataTable headers={["Flight", "Route", "Aircraft", "Passengers / LF", "Departure UTC", "OFP status", "Dispatch status", "Action"]} rows={briefings.map((ofp) => {
        const dispatch = ofp.flightDispatch, offer = dispatch.flightOffer;
        return [
          offer.flightNumber ?? offer.title,
          `${offer.departureIcao} → ${offer.arrivalIcao}`,
          offer.aircraftRegistration ?? offer.aircraftType ?? offer.vamsysAircraftId,
          `${offer.passengers ?? "—"} / ${offer.loadFactorPercent ?? "—"}%`,
          dispatch.selectedDepartureAt?.toISOString().replace("T", " ").slice(0, 16) ?? "—",
          <Badge key="ofp" tone={tone(ofp.status)}>{ofp.status}</Badge>,
          <Badge key="dispatch" tone={dispatch.status === "DISPATCHED" ? "green" : dispatch.status === "FAILED" || dispatch.status === "CANCELLED" ? "red" : "amber"}>{dispatch.status}</Badge>,
          <a key="action" className="action-button approve" href={`/pilot/ofp/${ofp.id}`}>{ofp.status === "SIGNED" && dispatch.status === "DISPATCHING" ? "FINAL DISPATCH" : ofp.status === "SIGNED" ? "VIEW SIGNED OFP" : "PREPARE OFP"}</a>,
        ];
      })}/> : <div className="empty-state">No OFPs yet. Claim a Flight Offer or prepare a flight from Book a flight.</div>}
    </section>
  </PilotPortalShell>;
}

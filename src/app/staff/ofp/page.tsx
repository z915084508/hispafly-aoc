import Link from "next/link";
import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { prisma } from "@/lib/prisma";
import { requireAdminStaff } from "@/lib/staff/requireAdmin";

export const dynamic = "force-dynamic";
export default async function StaffOfpPage() {
  await requireAdminStaff();
  const records = await prisma.ofpBriefing.findMany({ include: { flightDispatch: { include: { pilot: true, flightOffer: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  return <><PageHeading eyebrow="FLIGHT OPERATIONS" title="OFP Control" copy="SimBrief packages, pilot acceptance and immutable signature audit."/>
    <section className="card"><div className="card-header"><h2 className="card-title">OFP signature status</h2><span className="meta">{records.length} records</span></div>
      {records.length ? <DataTable headers={["Flight", "Route", "Pilot", "Aircraft", "Version", "Status", "Signed UTC", "Document"]} rows={records.map((ofp) => { const offer = ofp.flightDispatch.flightOffer; return [offer.flightNumber ?? offer.title, `${offer.departureIcao} → ${offer.arrivalIcao}`, ofp.flightDispatch.pilot.displayName, offer.aircraftRegistration ?? offer.aircraftType ?? offer.vamsysAircraftId, String(ofp.version), <Badge key="status" tone={ofp.status === "SIGNED" ? "green" : ofp.status === "VOIDED" ? "red" : "amber"}>{ofp.status}</Badge>, ofp.signedAt?.toISOString() ?? "—", ofp.pdfUrl ? <Link href={ofp.pdfUrl} target="_blank">OFP PDF</Link> : <Link href={ofp.ofpUrl ?? "#"} target="_blank">SimBrief</Link>]; })}/> : <div className="empty-state">No OFP records yet.</div>}
    </section></>;
}

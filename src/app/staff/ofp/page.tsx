import Link from "next/link";
import { Badge, DataTable } from "@/components/data-table";
import { DispatchReleasePanel } from "@/components/dispatch-release-panel";
import { PageHeading } from "@/components/page-heading";
import { prisma } from "@/lib/prisma";
import { requireAdminStaff } from "@/lib/staff/requireAdmin";
import { safeSimbriefPdfUrl } from "@/lib/simbrief/pdf";
import { getTranslations } from "@/lib/i18n/server";
import { staffGenerateSimbriefOFPAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function StaffOfpPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  await requireAdminStaff();
  const { t } = await getTranslations();
  const messages = await searchParams;
  const records = await prisma.ofpBriefing.findMany({ include: { flightDispatch: { include: { pilot: true, flightOffer: true } }, dispatchRelease: true }, orderBy: { createdAt: "desc" }, take: 200 });
  const releases = records.flatMap((record) => record.dispatchRelease ? [record.dispatchRelease] : []);
  const metrics: Array<[string, number]> = [
    ["All releases", releases.length],
    ["Blocked", releases.filter((item) => item.status === "BLOCKED").length],
    ["Warning", releases.filter((item) => ["MEDIUM", "HIGH"].includes(item.riskLevel) && item.status !== "BLOCKED").length],
    ["Ready", releases.filter((item) => ["READY", "SIGNED"].includes(item.status)).length],
  ];
  return <>
    <PageHeading eyebrow="FLIGHT OPERATIONS" title="OFP Control" copy="SimBrief packages, Dispatch Releases and immutable signature audit."/>
    {messages.success && <div className="feedback success">{messages.success}</div>}{messages.error && <div className="feedback error">{messages.error}</div>}
    <section className="grid stats">{metrics.map(([label,value]) => <div className="card" key={label}><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>)}</section>
    <section className="card"><div className="card-header"><h2 className="card-title">OFP signature and release status</h2><span className="meta">{records.length} records</span></div>
      {records.length ? <DataTable headers={["Flight", "Route", "Pilot", "Aircraft", "OFP", "Release", "Risk", "Signed UTC", "Document"]} rows={records.map((ofp) => {
        const offer = ofp.flightDispatch.flightOffer, hasPdf = Boolean(safeSimbriefPdfUrl(ofp.pdfUrl));
        return [
          offer.flightNumber ?? offer.title,
          `${offer.departureIcao} → ${offer.arrivalIcao}`,
          ofp.flightDispatch.pilot.displayName,
          offer.aircraftRegistration ?? offer.aircraftType ?? offer.vamsysAircraftId,
          <Badge key="status" tone={ofp.status === "SIGNED" ? "green" : ofp.status === "VOIDED" ? "red" : "amber"}>{ofp.status}</Badge>,
          <Badge key="release" tone={ofp.dispatchRelease?.status === "SIGNED" || ofp.dispatchRelease?.status === "READY" ? "green" : ofp.dispatchRelease?.status === "BLOCKED" ? "red" : "amber"}>{ofp.dispatchRelease?.status ?? "PENDING"}</Badge>,
          <Badge key="risk" tone={ofp.dispatchRelease?.riskLevel === "LOW" ? "green" : ofp.dispatchRelease?.riskLevel === "BLOCKED" || ofp.dispatchRelease?.riskLevel === "HIGH" ? "red" : "amber"}>{ofp.dispatchRelease?.riskLevel ?? "UNKNOWN"}</Badge>,
          ofp.signedAt?.toISOString() ?? "—",
          <span key="document">{ofp.status !== "SIGNED" && ofp.status !== "VOIDED" && <form action={staffGenerateSimbriefOFPAction} className="inline-action-form"><input type="hidden" name="ofpId" value={ofp.id}/><button className="action-button approve" type="submit">{t("ofp.generate")}</button></form>}{hasPdf ? <Link href={`/api/ofp/${ofp.id}/pdf`} target="_blank">{t("ofpPdf.openPdf")}</Link> : <button className="action-button disabled-button" type="button" disabled>{t("ofp.pdfNotAvailable")}</button>}</span>,
        ];
      })}/> : <div className="empty-state">No OFP records yet.</div>}
    </section>
    {records.filter((record) => record.dispatchRelease).map((record) => <details className="card" key={record.id}><summary>{record.flightDispatch.flightOffer.flightNumber ?? record.flightDispatch.flightOffer.title} · {record.flightDispatch.pilot.displayName} · Release details</summary><DispatchReleasePanel release={record.dispatchRelease}/></details>)}
  </>;
}

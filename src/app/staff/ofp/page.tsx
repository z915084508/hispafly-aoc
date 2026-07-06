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
  const [records, performance, readiness] = await Promise.all([
    prisma.ofpBriefing.findMany({ include: { flightDispatch: { include: { pilot: true, flightOffer: true } }, dispatchRelease: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.efbPerformanceCalculation.findMany({ where: { mode: "OFFICIAL" }, include: { pilot: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.efbDepartureReadiness.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
  ]);
  const releases = records.flatMap((record) => record.dispatchRelease ? [record.dispatchRelease] : []);
  const metrics: Array<[string, number]> = [
    ["All releases", releases.length],
    ["Blocked", releases.filter((item) => item.status === "BLOCKED").length],
    ["Warning", releases.filter((item) => ["MEDIUM", "HIGH"].includes(item.riskLevel) && item.status !== "BLOCKED").length],
    ["Ready", releases.filter((item) => ["READY", "SIGNED"].includes(item.status)).length],
  ];
  const takeoffDispatches = new Set(performance.filter((item) => item.type === "TAKEOFF").map((item) => item.flightDispatchId).filter(Boolean));
  const performanceMetrics: Array<[string, number]> = [
    ["Dispatched without takeoff", records.filter((item) => item.flightDispatch.status === "DISPATCHED" && !takeoffDispatches.has(item.flightDispatch.id)).length],
    ["Takeoff warning / failed", performance.filter((item) => item.type === "TAKEOFF" && item.status !== "OK").length],
    ["Landing warning / failed", performance.filter((item) => item.type === "LANDING" && item.status !== "OK").length],
    ["Ready for Departure", readiness.filter((item) => ["READY", "WARNING"].includes(item.status)).length],
  ];
  return <>
    <PageHeading eyebrow="FLIGHT OPERATIONS" title="OFP Control" copy="SimBrief packages, Dispatch Releases and immutable signature audit."/>
    {messages.success && <div className="feedback success">{messages.success}</div>}{messages.error && <div className="feedback error">{messages.error}</div>}
    <section className="grid stats">{metrics.map(([label,value]) => <div className="card" key={label}><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>)}</section>
    <section className="grid stats">{performanceMetrics.map(([label,value]) => <div className="card" key={label}><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>)}</section>
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
    <section className="card"><div className="card-header"><h2 className="card-title">EFB Performance monitoring</h2><span className="meta">Latest {performance.length} official calculations</span></div>
      {performance.length ? <DataTable headers={["Type", "Flight", "Pilot", "Airport / Runway", "Aircraft", "Weight", "Status", "Ready", "Created UTC"]} rows={performance.map((item) => [item.type, item.vamsysBookingId ?? item.flightDispatchId ?? "—", item.pilot.displayName, `${item.airportIcao} / ${item.runway ?? "—"}`, item.aircraftRegistration ?? item.aircraftType, item.weightKg ? `${item.weightKg} kg` : "—", <Badge key="performance-status" tone={item.status === "OK" ? "green" : item.status === "WARNING" || item.status === "NOT_SUPPORTED" ? "amber" : "red"}>{item.status}</Badge>, readiness.find((row) => row.flightDispatchId === item.flightDispatchId)?.status ?? "—", item.createdAt.toISOString()])}/> : <div className="empty-state">No official EFB performance calculations yet.</div>}
    </section>
    {records.filter((record) => record.dispatchRelease).map((record) => <details className="card" key={record.id}><summary>{record.flightDispatch.flightOffer.flightNumber ?? record.flightDispatch.flightOffer.title} · {record.flightDispatch.pilot.displayName} · Release details</summary><DispatchReleasePanel release={record.dispatchRelease}/></details>)}
  </>;
}

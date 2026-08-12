import { AcarsReleaseUploader } from "@/components/acars-release-uploader";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { formatReleaseSize, getLatestAcarsRelease } from "@/lib/software/acars-release";

export const dynamic = "force-dynamic";

export default async function StaffSoftwareReleasesPage() {
  await getCurrentStaff();
  const [stableRelease, betaRelease] = await Promise.all([
    getLatestAcarsRelease("STABLE"),
    getLatestAcarsRelease("BETA"),
  ]);

  return <>
    <div className="page-header">
      <div>
        <div className="eyebrow">SOFTWARE DISTRIBUTION</div>
        <h1>ACARS releases</h1>
        <p>Register the Windows installer already uploaded to Vercel Blob and publish it through the Pilot Portal.</p>
      </div>
    </div>

    {[stableRelease, betaRelease].filter(Boolean).map((release) => release && <section className="card" style={{ marginBottom: 18 }} key={release.channel}>
      <div className="card-header">
        <div><h2 className="card-title">Current {release.channel.toLowerCase()} version</h2><p className="meta">{release.channel === "STABLE" ? "Available to all eligible pilots." : "Available only to pilots with BETA ACCESO."}</p></div>
        <span className={release.channel === "STABLE" ? "badge green" : "badge amber"}>{release.channel}</span>
      </div>
      <div className="workflow-summary">
        <div><span>Version</span><strong>{release.version}</strong></div>
        <div><span>Installer</span><strong style={{ fontSize: 14 }}>{release.fileName}</strong></div>
        <div><span>Size</span><strong>{formatReleaseSize(release.fileSize)}</strong></div>
      </div>
      <p className="meta" style={{ marginTop: 14 }}>Published {new Date(release.publishedAt).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })} · {release.mandatory ? "Mandatory update" : "Optional update"}</p>
      <div className="form-actions" style={{ marginTop: 14 }}><a className="button secondary" href={release.downloadUrl} target="_blank" rel="noreferrer">Open installer</a></div>
    </section>)}

    {!stableRelease && <div className="notice">No stable ACARS release has been registered yet. Publish v1.3.3 (or the current public version) to make it available to all eligible pilots.</div>}
    <AcarsReleaseUploader />
  </>;
}

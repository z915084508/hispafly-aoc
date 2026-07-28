import { AcarsReleaseUploader } from "@/components/acars-release-uploader";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { formatReleaseSize, getLatestAcarsRelease } from "@/lib/software/acars-release";

export const dynamic = "force-dynamic";

export default async function StaffSoftwareReleasesPage() {
  await getCurrentStaff();
  const release = await getLatestAcarsRelease();

  return <>
    <div className="page-header">
      <div>
        <div className="eyebrow">SOFTWARE DISTRIBUTION</div>
        <h1>ACARS releases</h1>
        <p>Register the Windows installer already uploaded to Vercel Blob and publish it through the Pilot Portal.</p>
      </div>
    </div>

    {release && <section className="card" style={{ marginBottom: 18 }}>
      <div className="card-header">
        <div><h2 className="card-title">Current published version</h2><p className="meta">This is the installer currently shown to pilots.</p></div>
        <span className="badge green">LATEST</span>
      </div>
      <div className="workflow-summary">
        <div><span>Version</span><strong>{release.version}</strong></div>
        <div><span>Installer</span><strong style={{ fontSize: 14 }}>{release.fileName}</strong></div>
        <div><span>Size</span><strong>{formatReleaseSize(release.fileSize)}</strong></div>
      </div>
      <p className="meta" style={{ marginTop: 14 }}>Published {new Date(release.publishedAt).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })} · {release.mandatory ? "Mandatory update" : "Optional update"}</p>
      <div className="form-actions" style={{ marginTop: 14 }}><a className="button secondary" href={release.downloadUrl} target="_blank" rel="noreferrer">Open installer</a></div>
    </section>}

    {!release && <div className="notice">No ACARS release has been registered yet. Upload the installer in Vercel Blob, copy its public URL and publish it below.</div>}
    <AcarsReleaseUploader />
  </>;
}

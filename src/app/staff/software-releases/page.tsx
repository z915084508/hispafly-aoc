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
        <p>Upload and publish the Windows client distributed through the Pilot Portal.</p>
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
    </section>}

    {!release && <div className="notice">No ACARS installer has been published to Vercel Blob yet.</div>}
    <AcarsReleaseUploader />
  </>;
}

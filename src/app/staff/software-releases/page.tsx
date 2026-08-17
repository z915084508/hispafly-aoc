import { AcarsReleaseUploader } from "@/components/acars-release-uploader";
import { LiveryReleaseUploader } from "@/components/livery-release-uploader";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { formatReleaseSize, getLatestAcarsRelease } from "@/lib/software/acars-release";
import { getLatestLiveryReleases } from "@/lib/software/livery-release";

export const dynamic = "force-dynamic";

export default async function StaffSoftwareReleasesPage() {
  await getCurrentStaff();
  const [stableRelease, betaRelease, liveries] = await Promise.all([
    getLatestAcarsRelease("STABLE"),
    getLatestAcarsRelease("BETA"),
    getLatestLiveryReleases(),
  ]);

  return <>
    <div className="page-header">
      <div>
        <div className="eyebrow">SOFTWARE DISTRIBUTION</div>
        <h1>Software Center</h1>
        <p>Register public Vercel Blob links for ACARS installers and official HISPAFLY aircraft liveries.</p>
      </div>
    </div>

    <section className="card" style={{ marginBottom: 18 }}>
      <div className="card-header">
        <div><h2 className="card-title">ACARS releases</h2><p className="meta">Stable and Beta channels published to Pilot Portal.</p></div>
        <span className="badge blue">ACARS</span>
      </div>
      {[stableRelease, betaRelease].filter(Boolean).map((release) => release && <div className="card" style={{ marginTop: 14 }} key={release.channel}>
        <div className="card-header">
          <div><h3 className="card-title">Current {release.channel.toLowerCase()} version</h3><p className="meta">{release.channel === "STABLE" ? "Available to all eligible pilots." : "Available only to pilots with BETA ACCESO."}</p></div>
          <span className={release.channel === "STABLE" ? "badge green" : "badge amber"}>{release.channel}</span>
        </div>
        <div className="workflow-summary">
          <div><span>Version</span><strong>{release.version}</strong></div>
          <div><span>Installer</span><strong style={{ fontSize: 14 }}>{release.fileName}</strong></div>
          <div><span>Size</span><strong>{formatReleaseSize(release.fileSize)}</strong></div>
        </div>
        <p className="meta" style={{ marginTop: 14 }}>Published {new Date(release.publishedAt).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })} · {release.mandatory ? "Mandatory update" : "Optional update"}</p>
        <div className="form-actions" style={{ marginTop: 14 }}><a className="button secondary" href={release.downloadUrl} target="_blank" rel="noreferrer">Open installer</a></div>
      </div>)}
      {!stableRelease && <div className="notice" style={{ marginTop: 14 }}>No stable ACARS release has been registered yet. Publish the current public version to make it available to all eligible pilots.</div>}
    </section>

    <AcarsReleaseUploader />

    <section className="card" style={{ marginTop: 18, marginBottom: 18 }}>
      <div className="card-header">
        <div><h2 className="card-title">HISPAFLY liveries</h2><p className="meta">Latest published package for each aircraft / add-on / simulator combination.</p></div>
        <span className="badge red">{liveries.length} PUBLISHED</span>
      </div>
      {liveries.length ? <div className="detail-grid" style={{ marginTop: 16, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        {liveries.map((livery) => <div className="card" style={{ padding: 20 }} key={livery.product}>
          <div className="card-header">
            <div><span className="meta">{livery.simulator === "MSFS2024" ? "MSFS 2024" : "MSFS 2020"}</span><h3 style={{ margin: "6px 0" }}>{livery.aircraftType} · {livery.addon}</h3><p className="meta">{livery.registration || "Fleet livery"}</p></div>
            <span className="badge green">v{livery.version}</span>
          </div>
          <div className="workflow-summary" style={{ marginTop: 12 }}>
            <div><span>File</span><strong style={{ fontSize: 13 }}>{livery.fileName}</strong></div>
            <div><span>Size</span><strong>{formatReleaseSize(livery.fileSize)}</strong></div>
          </div>
          <p className="meta" style={{ marginTop: 12 }}>Published {new Date(livery.publishedAt).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}</p>
          <div className="form-actions" style={{ marginTop: 12 }}><a className="button secondary" href={livery.downloadUrl} target="_blank" rel="noreferrer">Open package</a></div>
        </div>)}
      </div> : <div className="notice" style={{ marginTop: 14 }}>No aircraft liveries have been published yet.</div>}
    </section>

    <LiveryReleaseUploader />
  </>;
}

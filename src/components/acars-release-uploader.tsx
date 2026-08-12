"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AcarsReleaseUploader() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="card acars-release-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        const version = String(form.get("version") ?? "").trim();
        const downloadUrl = String(form.get("downloadUrl") ?? "").trim();
        const notes = String(form.get("notes") ?? "").trim();
        const mandatory = form.get("mandatory") === "on";
        const channel = form.get("channel") === "BETA" ? "BETA" : "STABLE";

        if (!/^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?$/.test(version)) return setMessage("Use a version such as 1.0.0.");
        if (!downloadUrl.startsWith("https://") || !downloadUrl.toLowerCase().endsWith(".exe")) {
          return setMessage("Paste the public HTTPS Vercel Blob URL of the .exe installer.");
        }

        setBusy(true);
        setMessage(null);
        try {
          const response = await fetch("/api/staff/software/acars/release", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ version, downloadUrl, notes, mandatory, channel }),
          });
          const result = await response.json() as { error?: string };
          if (!response.ok) throw new Error(result.error || "Release publication failed.");
          formElement.reset();
          setMessage(`ACARS ${version} published to ${channel.toLowerCase()} successfully.`);
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Release publication failed.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="card-header">
        <div>
          <h2 className="card-title">Publish a new ACARS release</h2>
          <p className="meta">Upload the installer in Vercel Blob first, then register its public download URL here.</p>
        </div>
        <span className="badge blue">VERCEL BLOB</span>
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="acars-version">Version</label>
          <input id="acars-version" name="version" placeholder="1.0.0" required />
        </div>
        <div className="field">
          <label htmlFor="acars-channel">Release channel</label>
          <select id="acars-channel" name="channel" defaultValue="STABLE">
            <option value="STABLE">Stable — all eligible pilots</option>
            <option value="BETA">Beta / Early Access — BETA ACCESO only</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="acars-download-url">Download URL</label>
          <input id="acars-download-url" name="downloadUrl" type="url" placeholder="https://...public.blob.vercel-storage.com/HispaFly-ACARS-Setup-1.0.0-win-x64.exe" required />
        </div>
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="acars-notes">Release notes</label>
        <textarea id="acars-notes" name="notes" rows={7} placeholder="Flight phase detection improved..." />
      </div>

      <label className="signature-accept" style={{ marginTop: 16 }}>
        <input type="checkbox" name="mandatory" />
        <span>Mark this version as a mandatory update for pilots.</span>
      </label>

      {message && <div className={message.includes("successfully") ? "feedback success" : "feedback error"} style={{ marginTop: 16 }}>{message}</div>}

      <div className="form-actions" style={{ marginTop: 18 }}>
        <button className="button" type="submit" disabled={busy}>{busy ? "Publishing..." : "Publish release"}</button>
      </div>
    </form>
  );
}

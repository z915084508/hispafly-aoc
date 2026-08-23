"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";

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
        const installer = form.get("installer");
        const notes = String(form.get("notes") ?? "").trim();
        const mandatory = form.get("mandatory") === "on";
        const channel = form.get("channel") === "BETA" ? "BETA" : "STABLE";

        if (!/^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?$/.test(version)) return setMessage("Use a version such as 1.0.0.");
        if (!(installer instanceof File) || !installer.name.toLowerCase().endsWith(".exe") || installer.size <= 0) return setMessage("Choose the Windows .exe installer.");

        setBusy(true);
        setMessage(null);
        try {
          const blob = await upload(`software/acars/installers/${version}/${installer.name}`, installer, {
            access: "public",
            handleUploadUrl: "/api/staff/software/acars/upload",
            clientPayload: JSON.stringify({ version, notes, mandatory, channel, fileSize: installer.size, originalName: installer.name }),
          });
          const downloadUrl = blob.downloadUrl ?? blob.url;
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
          <p className="meta">Upload and publish the signed Windows installer to the ACARS update channel.</p>
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
          <label htmlFor="acars-installer">Windows installer</label>
          <input id="acars-installer" name="installer" type="file" accept=".exe,application/octet-stream,application/x-msdownload" required />
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

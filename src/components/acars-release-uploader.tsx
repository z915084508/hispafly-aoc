"use client";

import { upload } from "@vercel/blob/client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function AcarsReleaseUploader() {
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="card acars-release-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const file = fileRef.current?.files?.[0];
        const version = String(form.get("version") ?? "").trim();
        const notes = String(form.get("notes") ?? "").trim();
        const mandatory = form.get("mandatory") === "on";

        if (!file) return setMessage("Select the Windows installer first.");
        if (!file.name.toLowerCase().endsWith(".exe")) return setMessage("Only .exe installers are allowed.");
        if (!/^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?$/.test(version)) return setMessage("Use a version such as 0.0.14.");

        setBusy(true);
        setProgress(0);
        setMessage(null);
        try {
          await upload(`software/acars/installers/${version}/${file.name}`, file, {
            access: "public",
            handleUploadUrl: "/api/staff/software/acars/upload",
            multipart: true,
            clientPayload: JSON.stringify({ version, notes, mandatory, fileSize: file.size, originalName: file.name }),
            onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
          });
          setMessage(`ACARS ${version} uploaded and published successfully.`);
          event.currentTarget.reset();
          setProgress(100);
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Upload failed.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="card-header">
        <div>
          <h2 className="card-title">Publish a new ACARS release</h2>
          <p className="meta">The installer uploads directly to Vercel Blob and becomes the latest Pilot Portal download.</p>
        </div>
        <span className="badge blue">VERCEL BLOB</span>
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="acars-version">Version</label>
          <input id="acars-version" name="version" placeholder="0.0.14" required />
        </div>
        <div className="field">
          <label htmlFor="acars-installer">Windows installer</label>
          <input ref={fileRef} id="acars-installer" name="installer" type="file" accept=".exe,application/x-msdownload,application/octet-stream" required />
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

      {busy && (
        <div style={{ marginTop: 16 }}>
          <div className="condition-track"><div style={{ width: `${progress}%`, background: "currentColor" }} /></div>
          <p className="meta">Uploading {progress}%</p>
        </div>
      )}
      {message && <div className={message.includes("successfully") ? "feedback success" : "feedback error"} style={{ marginTop: 16 }}>{message}</div>}

      <div className="form-actions" style={{ marginTop: 18 }}>
        <button className="button" type="submit" disabled={busy}>{busy ? `Uploading ${progress}%` : "Upload and publish"}</button>
      </div>
    </form>
  );
}

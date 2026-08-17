"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const allowedExtensions = [".zip", ".7z", ".rar"];

export function LiveryReleaseUploader() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="card acars-release-form"
      style={{ marginTop: 18 }}
      onSubmit={async (event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        const aircraftType = String(form.get("aircraftType") ?? "").trim();
        const addon = String(form.get("addon") ?? "").trim();
        const simulator = form.get("simulator") === "MSFS2020" ? "MSFS2020" : "MSFS2024";
        const registration = String(form.get("registration") ?? "").trim();
        const version = String(form.get("version") ?? "").trim();
        const downloadUrl = String(form.get("downloadUrl") ?? "").trim();
        const notes = String(form.get("notes") ?? "").trim();

        if (!aircraftType || !addon) return setMessage("Aircraft type and add-on are required.");
        if (!/^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?$/.test(version)) return setMessage("Use a version such as 1.0.0.");
        let pathname = "";
        try { pathname = new URL(downloadUrl).pathname.toLowerCase(); } catch { return setMessage("Paste a valid HTTPS Vercel Blob URL."); }
        if (!downloadUrl.startsWith("https://") || !allowedExtensions.some((extension) => pathname.endsWith(extension))) {
          return setMessage("Paste the public Vercel Blob URL of a .zip, .7z or .rar livery package.");
        }

        setBusy(true);
        setMessage(null);
        try {
          const response = await fetch("/api/staff/software/liveries/release", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ aircraftType, addon, simulator, registration, version, downloadUrl, notes }),
          });
          const result = await response.json() as { error?: string };
          if (!response.ok) throw new Error(result.error || "Livery publication failed.");
          formElement.reset();
          setMessage(`${aircraftType} livery ${version} published successfully.`);
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Livery publication failed.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="card-header">
        <div>
          <h2 className="card-title">Publish an aircraft livery</h2>
          <p className="meta">Upload the package to public Vercel Blob first, then register the download link here for Pilot Portal.</p>
        </div>
        <span className="badge blue">VERCEL BLOB</span>
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="livery-aircraft-type">Aircraft type</label>
          <input id="livery-aircraft-type" name="aircraftType" placeholder="A320" required />
        </div>
        <div className="field">
          <label htmlFor="livery-addon">Aircraft add-on</label>
          <input id="livery-addon" name="addon" placeholder="Fenix A320" required />
        </div>
        <div className="field">
          <label htmlFor="livery-simulator">Simulator</label>
          <select id="livery-simulator" name="simulator" defaultValue="MSFS2024">
            <option value="MSFS2024">Microsoft Flight Simulator 2024</option>
            <option value="MSFS2020">Microsoft Flight Simulator 2020</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="livery-registration">Registration</label>
          <input id="livery-registration" name="registration" placeholder="EC-VLC (optional)" />
        </div>
        <div className="field">
          <label htmlFor="livery-version">Livery version</label>
          <input id="livery-version" name="version" placeholder="1.0.0" required />
        </div>
        <div className="field">
          <label htmlFor="livery-download-url">Download URL</label>
          <input id="livery-download-url" name="downloadUrl" type="url" placeholder="https://...public.blob.vercel-storage.com/HISPAFLY-Fenix-A320-v1.0.0.zip" required />
        </div>
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="livery-notes">Notes / installation information</label>
        <textarea id="livery-notes" name="notes" rows={5} placeholder="Official HISPAFLY livery. Copy the extracted folder to your Community folder..." />
      </div>

      {message && <div className={message.includes("successfully") ? "feedback success" : "feedback error"} style={{ marginTop: 16 }}>{message}</div>}

      <div className="form-actions" style={{ marginTop: 18 }}>
        <button className="button" type="submit" disabled={busy}>{busy ? "Publishing..." : "Publish livery"}</button>
      </div>
    </form>
  );
}

import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { requirePilotSession } from "@/lib/pilot/session";

export const dynamic = "force-dynamic";

const RELEASES_URL = "https://github.com/z915084508/hispafly-acars/releases/latest";
const LATEST_RELEASE_API = "https://api.github.com/repos/z915084508/hispafly-acars/releases/latest";
const FALLBACK_DOWNLOAD_URL = "https://github.com/z915084508/hispafly-acars/releases/latest";

type GitHubAsset = {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
};

type GitHubRelease = {
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string | null;
  html_url: string;
  assets: GitHubAsset[];
};

async function getLatestAcarsRelease(): Promise<GitHubRelease | null> {
  try {
    const token = process.env.GITHUB_TOKEN;
    const response = await fetch(LATEST_RELEASE_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "HispaFly-AOC",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    return await response.json() as GitHubRelease;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeZone: "Europe/Madrid" }).format(new Date(value));
}

function releaseHighlights(body: string | null) {
  if (!body) return [
    "Telemetría de combustible y fases de vuelo",
    "Sincronización en tiempo real con FSUIPC7",
    "Envío automático del PIREP al finalizar",
    "Integración con Dispatch y OFP de HispaFly",
  ];
  return body
    .split("\n")
    .map((line) => line.replace(/^[-*#\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

export default async function PilotDownloadsPage() {
  await requirePilotSession();
  const release = await getLatestAcarsRelease();
  const installer = release?.assets.find((asset) => /HispaFly-ACARS-Setup-.*-win-x64\.exe$/i.test(asset.name))
    ?? release?.assets.find((asset) => asset.name.toLowerCase().endsWith(".exe"));
  const version = release?.tag_name?.replace(/^v/i, "") ?? "Latest";
  const downloadUrl = installer?.browser_download_url ?? release?.html_url ?? FALLBACK_DOWNLOAD_URL;
  const highlights = releaseHighlights(release?.body ?? null);

  return (
    <PilotPortalShell>
      <section className="card" style={{ padding: "32px", marginBottom: "18px", background: "linear-gradient(135deg, #ffffff 0%, #fff7f7 100%)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, .7fr)", gap: "28px", alignItems: "center" }}>
          <div>
            <p className="eyebrow">SOFTWARE OFICIAL</p>
            <h1 style={{ margin: "8px 0 12px", fontSize: "clamp(2rem, 4vw, 3.6rem)" }}>HispaFly ACARS</h1>
            <p className="page-copy" style={{ maxWidth: "760px" }}>El cliente oficial para conectar tu simulador, recibir el Dispatch y enviar automáticamente la telemetría y el PIREP.</p>
            <div className="form-actions" style={{ marginTop: "20px" }}>
              <span className="badge amber">BETA CERRADA</span>
              <span className="badge blue">WINDOWS 10/11 · 64 BIT</span>
              <span className="badge gray">REQUIERE FSUIPC7</span>
            </div>
          </div>
          <div className="card" style={{ padding: "22px", background: "#17202b", color: "white", minHeight: "180px", display: "grid", alignContent: "space-between" }}>
            <div><span className="meta" style={{ color: "#c9d2dc" }}>ACARS CLIENT</span><h2 style={{ margin: "8px 0" }}>Dispatch conectado</h2></div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end" }}><span style={{ color: "#c9d2dc" }}>FSUIPC · Telemetry · PIREP</span><strong style={{ fontSize: "2rem" }}>↓</strong></div>
          </div>
        </div>
      </section>

      {!release && <div className="notice">GitHub no respondió con los detalles de la versión. El botón seguirá abriendo la página oficial de Releases para que puedas descargar el instalador.</div>}

      <section className="card" style={{ padding: "0", overflow: "hidden", marginBottom: "18px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, .75fr) minmax(300px, 1.2fr) minmax(260px, .9fr)" }}>
          <div style={{ padding: "28px", borderRight: "1px solid var(--border, #e3e7ee)" }}>
            <span className="meta">ÚLTIMA VERSIÓN</span>
            <strong style={{ display: "block", fontSize: "3rem", margin: "8px 0 18px" }}>{version}</strong>
            <div className="detail-grid" style={{ gridTemplateColumns: "1fr", gap: "10px" }}>
              <div><span className="meta">Publicado</span><strong>{formatDate(release?.published_at ?? null)}</strong></div>
              <div><span className="meta">Tamaño</span><strong>{installer ? formatBytes(installer.size) : "—"}</strong></div>
              <div><span className="meta">Plataforma</span><strong>Windows 10/11 x64</strong></div>
              <div><span className="meta">Estado</span><strong>Beta cerrada</strong></div>
            </div>
          </div>

          <div style={{ padding: "28px", borderRight: "1px solid var(--border, #e3e7ee)" }}>
            <span className="meta">NOVEDADES EN ESTA VERSIÓN</span>
            <div style={{ display: "grid", gap: "13px", marginTop: "18px" }}>{highlights.map((item) => <div key={item} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}><span className="badge green">✓</span><span>{item}</span></div>)}</div>
          </div>

          <div style={{ padding: "28px", display: "grid", alignContent: "center", gap: "12px" }}>
            <a className="button" href={downloadUrl} target="_blank" rel="noreferrer" style={{ textAlign: "center", padding: "18px" }}>↓ Descargar ACARS</a>
            <a className="button secondary" href={release?.html_url ?? RELEASES_URL} target="_blank" rel="noreferrer" style={{ textAlign: "center" }}>Ver en GitHub</a>
            <div className="notice" style={{ margin: 0 }}>Requiere Microsoft Flight Simulator 2020/2024 y FSUIPC7 instalado y ejecutándose.</div>
          </div>
        </div>
      </section>

      <section className="card" style={{ padding: "26px", marginBottom: "18px" }}>
        <div className="card-header"><h2 className="card-title">Guía rápida de instalación</h2></div>
        <div className="detail-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          <div className="card" style={{ padding: "20px" }}><span className="badge red">1</span><h3>Requisitos</h3><p>Instala MSFS 2020/2024 y FSUIPC7.</p></div>
          <div className="card" style={{ padding: "20px" }}><span className="badge red">2</span><h3>Instalación</h3><p>Cierra ACARS y ejecuta el instalador descargado.</p></div>
          <div className="card" style={{ padding: "20px" }}><span className="badge red">3</span><h3>Inicio de sesión</h3><p>Usa las credenciales de tu cuenta HispaFly AOC.</p></div>
          <div className="card" style={{ padding: "20px" }}><span className="badge red">4</span><h3>Comprobación</h3><p>Verifica FSUIPC, fase, combustible y Dispatch.</p></div>
        </div>
        <div className="notice" style={{ marginTop: "18px" }}>Versión beta: mantén ACARS abierto hasta confirmar que el vuelo y la telemetría final se han sincronizado.</div>
      </section>

      <section className="card" style={{ padding: "24px", display: "flex", justifyContent: "space-between", gap: "20px", alignItems: "center" }}>
        <div><h2 className="card-title">¿Necesitas ayuda?</h2><p className="meta">Contacta con el Staff Team en Discord o abre un ticket de soporte.</p></div>
        <div className="form-actions"><a className="button secondary" href="https://discord.com" target="_blank" rel="noreferrer">Discord de HispaFly</a><a className="button secondary" href="/pilot/dashboard">Volver al Portal</a></div>
      </section>
    </PilotPortalShell>
  );
}
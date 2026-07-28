import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { requirePilotSession } from "@/lib/pilot/session";

export const dynamic = "force-dynamic";

const RELEASES_URL = "https://github.com/z915084508/hispafly-acars/releases/latest";
const LATEST_RELEASE_API = "https://api.github.com/repos/z915084508/hispafly-acars/releases/latest";

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
    const response = await fetch(LATEST_RELEASE_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "HispaFly-AOC",
        "X-GitHub-Api-Version": "2022-11-28",
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
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(value));
}

export default async function PilotDownloadsPage() {
  await requirePilotSession();
  const release = await getLatestAcarsRelease();
  const installer = release?.assets.find((asset) => /HispaFly-ACARS-Setup-.*-win-x64\.exe$/i.test(asset.name))
    ?? release?.assets.find((asset) => asset.name.toLowerCase().endsWith(".exe"));
  const version = release?.tag_name?.replace(/^v/i, "") ?? "Última versión";
  const downloadUrl = installer?.browser_download_url ?? release?.html_url ?? RELEASES_URL;

  return (
    <PilotPortalShell>
      <PageHeading
        eyebrow="SOFTWARE DE VUELO"
        title="Descargar HispaFly ACARS"
        copy="Instala el cliente oficial para conectar el simulador, recibir tu Dispatch y enviar automáticamente la telemetría y el PIREP."
      />

      {!release && (
        <div className="notice">
          No se pudo consultar GitHub en este momento. Puedes abrir la página de la última versión y descargar el instalador manualmente.
        </div>
      )}

      <section className="card ranking-card">
        <div className="card-header">
          <div>
            <h2 className="card-title">HispaFly ACARS {version}</h2>
            <span className="meta">Windows 10/11 · 64 bits · Beta cerrada</span>
          </div>
          <span className="badge green">LATEST</span>
        </div>

        <div className="kpi-grid">
          <div className="kpi"><span>Versión</span><strong>{version}</strong></div>
          <div className="kpi"><span>Publicado</span><strong>{formatDate(release?.published_at ?? null)}</strong></div>
          <div className="kpi"><span>Tamaño</span><strong>{installer ? formatBytes(installer.size) : "—"}</strong></div>
          <div className="kpi"><span>Archivo</span><strong>{installer?.name ?? "Abrir Releases"}</strong></div>
        </div>

        <div className="form-actions">
          <a className="action-button pay" href={downloadUrl} target="_blank" rel="noreferrer">
            Descargar ACARS
          </a>
          <a className="action-button" href={release?.html_url ?? RELEASES_URL} target="_blank" rel="noreferrer">
            Ver versión en GitHub
          </a>
        </div>
      </section>

      <section className="card ranking-card">
        <div className="card-header"><h2 className="card-title">Antes de instalar</h2></div>
        <div className="detail-grid">
          <div><strong>1. Requisito</strong><p>MSFS 2020/2024 y FSUIPC7 deben estar instalados y ejecutándose.</p></div>
          <div><strong>2. Instalación</strong><p>Cierra una versión anterior de ACARS y ejecuta el instalador descargado.</p></div>
          <div><strong>3. Inicio de sesión</strong><p>Usa las mismas credenciales de tu cuenta HispaFly AOC.</p></div>
          <div><strong>4. Comprobación</strong><p>Antes de iniciar el vuelo, confirma que FSUIPC, fase, combustible y Dispatch aparecen correctamente.</p></div>
        </div>
        <div className="notice">Versión beta: mantén ACARS abierto hasta que confirme que el vuelo y la telemetría final se han sincronizado.</div>
      </section>

      {release?.body && (
        <section className="card ranking-card">
          <div className="card-header"><h2 className="card-title">Cambios de esta versión</h2></div>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{release.body}</div>
        </section>
      )}
    </PilotPortalShell>
  );
}

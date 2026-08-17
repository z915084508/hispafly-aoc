import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { hasAcarsBetaAccess, requireAcarsPilotAccess } from "@/lib/acars/access";
import { formatReleaseSize, getLatestAcarsRelease } from "@/lib/software/acars-release";
import { getLatestLiveryReleases } from "@/lib/software/livery-release";

export const dynamic = "force-dynamic";

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
  return body.split("\n").map((line) => line.replace(/^[-*#\s]+/, "").trim()).filter(Boolean).slice(0, 5);
}

export default async function PilotDownloadsPage() {
  const user = await requireAcarsPilotAccess();
  const [release, betaRelease, liveries] = await Promise.all([
    getLatestAcarsRelease("STABLE"),
    hasAcarsBetaAccess(user) ? getLatestAcarsRelease("BETA") : Promise.resolve(null),
    getLatestLiveryReleases(),
  ]);
  const highlights = releaseHighlights(release?.notes ?? null);

  return <PilotPortalShell>
    <section className="card" style={{ padding: "32px", marginBottom: "18px", background: "linear-gradient(135deg, #ffffff 0%, #fff7f7 100%)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, .7fr)", gap: "28px", alignItems: "center" }}>
        <div>
          <p className="eyebrow">HISPAFLY DOWNLOAD CENTER</p>
          <h1 style={{ margin: "8px 0 12px", fontSize: "clamp(2rem, 4vw, 3.6rem)" }}>Software & Liveries</h1>
          <p className="page-copy" style={{ maxWidth: "760px" }}>Descarga el cliente oficial ACARS y los paquetes de pintura publicados por HISPAFLY para la flota virtual.</p>
          <div className="form-actions" style={{ marginTop: "20px" }}><span className="badge green">OFFICIAL</span><span className="badge blue">VERCEL BLOB</span><span className="badge gray">PILOT PORTAL</span></div>
        </div>
        <div className="card" style={{ padding: "22px", background: "#17202b", color: "white", minHeight: "180px", display: "grid", alignContent: "space-between" }}>
          <div><span className="meta" style={{ color: "#c9d2dc" }}>DOWNLOAD CENTER</span><h2 style={{ margin: "8px 0" }}>ACARS + Aircraft liveries</h2></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end" }}><span style={{ color: "#c9d2dc" }}>Official HISPAFLY resources</span><strong style={{ fontSize: "2rem" }}>↓</strong></div>
        </div>
      </div>
    </section>

    {!release && <div className="notice">El Staff todavía no ha publicado ningún instalador de ACARS en HispaFly Software Center.</div>}
    {release?.mandatory && <div className="feedback error">Esta versión está marcada como actualización obligatoria. Instálala antes de iniciar el próximo vuelo.</div>}

    <section className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
      <div className="card-header" style={{ padding: "24px 28px 0" }}><div><p className="eyebrow">SOFTWARE OFICIAL</p><h2 className="card-title">HispaFly ACARS</h2></div><span className="badge blue">WINDOWS</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, .75fr) minmax(300px, 1.2fr) minmax(260px, .9fr)" }}>
        <div style={{ padding: 28, borderRight: "1px solid var(--border, #e3e7ee)" }}>
          <span className="meta">ÚLTIMA VERSIÓN</span><strong style={{ display: "block", fontSize: "3rem", margin: "8px 0 18px" }}>{release?.version ?? "—"}</strong>
          <div className="detail-grid" style={{ gridTemplateColumns: "1fr", gap: 10 }}>
            <div><span className="meta">Publicado</span><strong>{formatDate(release?.publishedAt ?? null)}</strong></div>
            <div><span className="meta">Tamaño</span><strong>{release ? formatReleaseSize(release.fileSize) : "—"}</strong></div>
            <div><span className="meta">Plataforma</span><strong>Windows 10/11 x64</strong></div>
            <div><span className="meta">Estado</span><strong>{release?.mandatory ? "Actualización obligatoria" : "Versión estable"}</strong></div>
          </div>
        </div>
        <div style={{ padding: 28, borderRight: "1px solid var(--border, #e3e7ee)" }}>
          <span className="meta">NOVEDADES EN ESTA VERSIÓN</span>
          <div style={{ display: "grid", gap: 13, marginTop: 18 }}>{highlights.map((item) => <div key={item} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><span className="badge green">✓</span><span>{item}</span></div>)}</div>
        </div>
        <div style={{ padding: 28, display: "grid", alignContent: "center", gap: 12 }}>
          {release ? <a className="button" href={release.downloadUrl} style={{ textAlign: "center", padding: 18 }}>↓ Descargar ACARS {release.version}</a> : <button className="button" disabled style={{ padding: 18 }}>Instalador no disponible</button>}
          <div className="notice" style={{ margin: 0 }}>Requiere Microsoft Flight Simulator 2020/2024 y FSUIPC7 instalado y ejecutándose.</div>
        </div>
      </div>
    </section>

    <section className="card" style={{ padding: 26, marginBottom: 18 }}>
      <div className="card-header"><h2 className="card-title">Guía rápida de instalación ACARS</h2></div>
      <div className="detail-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <div className="card" style={{ padding: 20 }}><span className="badge red">1</span><h3>Requisitos</h3><p>Instala MSFS 2020/2024 y FSUIPC7.</p></div>
        <div className="card" style={{ padding: 20 }}><span className="badge red">2</span><h3>Instalación</h3><p>Cierra ACARS y ejecuta el instalador descargado.</p></div>
        <div className="card" style={{ padding: 20 }}><span className="badge red">3</span><h3>Inicio de sesión</h3><p>Usa las credenciales de tu cuenta HispaFly AOC.</p></div>
        <div className="card" style={{ padding: 20 }}><span className="badge red">4</span><h3>Comprobación</h3><p>Verifica FSUIPC, fase, combustible y Dispatch.</p></div>
      </div>
      <div className="notice" style={{ marginTop: 18 }}>Mantén ACARS abierto hasta confirmar que el vuelo y la telemetría final se han sincronizado.</div>
    </section>

    <section className="card" style={{ padding: 26, marginBottom: 18 }}>
      <div className="card-header">
        <div><p className="eyebrow">AIRCRAFT LIVERIES</p><h2 className="card-title">Official HISPAFLY liveries</h2><p className="meta">Paquetes publicados por Staff para Microsoft Flight Simulator.</p></div>
        <span className="badge red">{liveries.length} AVAILABLE</span>
      </div>
      {liveries.length ? <div className="detail-grid" style={{ marginTop: 18, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        {liveries.map((livery) => <article className="card" style={{ padding: 22 }} key={livery.product}>
          <div className="card-header">
            <div>
              <p className="eyebrow">{livery.simulator === "MSFS2024" ? "MSFS 2024" : "MSFS 2020"}</p>
              <h3 className="card-title">{livery.aircraftType} · {livery.addon}</h3>
              <p className="meta">{livery.registration ? `Registration ${livery.registration}` : "HISPAFLY fleet livery"}</p>
            </div>
            <span className="badge green">v{livery.version}</span>
          </div>
          <div className="workflow-summary" style={{ marginTop: 14 }}>
            <div><span>Package</span><strong style={{ fontSize: 13 }}>{livery.fileName}</strong></div>
            <div><span>Size</span><strong>{formatReleaseSize(livery.fileSize)}</strong></div>
            <div><span>Published</span><strong>{formatDate(livery.publishedAt)}</strong></div>
          </div>
          {livery.notes && <p className="page-copy" style={{ marginTop: 14, whiteSpace: "pre-line" }}>{livery.notes}</p>}
          <div className="form-actions" style={{ marginTop: 16 }}><a className="button" href={livery.downloadUrl}>↓ Descargar livery</a></div>
        </article>)}
      </div> : <div className="notice" style={{ marginTop: 16 }}>Todavía no hay liveries publicadas. Cuando Staff registre un paquete en Vercel Blob aparecerá automáticamente aquí.</div>}
      <div className="notice" style={{ marginTop: 18 }}>Descomprime el paquete y sigue las instrucciones incluidas por el autor. Verifica que la versión corresponda a tu simulador y al add-on indicado.</div>
    </section>

    {betaRelease && <section className="card" style={{ padding: 26, marginBottom: 18 }}>
      <div className="card-header">
        <div><p className="eyebrow">BETA ACCESO · EARLY ACCESS</p><h2 className="card-title">Canal de pruebas ACARS {betaRelease.version}</h2><p className="meta">Versión previa para probar futuras funciones. Puede contener errores y no sustituye a la versión estable.</p></div>
        <span className="badge amber">BETA</span>
      </div>
      <div className="form-actions"><a className="button secondary" href={betaRelease.downloadUrl}>Descargar beta {betaRelease.version}</a><span className="meta">{formatReleaseSize(betaRelease.fileSize)} · acceso restringido</span></div>
    </section>}
  </PilotPortalShell>;
}

import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { requireAcarsTestAccess } from "@/lib/acars/access";
import { formatReleaseSize, getLatestAcarsRelease } from "@/lib/software/acars-release";

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
  await requireAcarsTestAccess();
  const release = await getLatestAcarsRelease();
  const highlights = releaseHighlights(release?.notes ?? null);

  return <PilotPortalShell>
    <section className="card" style={{ padding: "32px", marginBottom: "18px", background: "linear-gradient(135deg, #ffffff 0%, #fff7f7 100%)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, .7fr)", gap: "28px", alignItems: "center" }}>
        <div>
          <p className="eyebrow">SOFTWARE OFICIAL</p>
          <h1 style={{ margin: "8px 0 12px", fontSize: "clamp(2rem, 4vw, 3.6rem)" }}>HispaFly ACARS</h1>
          <p className="page-copy" style={{ maxWidth: "760px" }}>El cliente oficial para conectar tu simulador, recibir el Dispatch y enviar automáticamente la telemetría y el PIREP.</p>
          <div className="form-actions" style={{ marginTop: "20px" }}><span className="badge amber">BETA CERRADA</span><span className="badge blue">WINDOWS 10/11 · 64 BIT</span><span className="badge gray">REQUIERE FSUIPC7</span></div>
        </div>
        <div className="card" style={{ padding: "22px", background: "#17202b", color: "white", minHeight: "180px", display: "grid", alignContent: "space-between" }}>
          <div><span className="meta" style={{ color: "#c9d2dc" }}>ACARS CLIENT</span><h2 style={{ margin: "8px 0" }}>Dispatch conectado</h2></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end" }}><span style={{ color: "#c9d2dc" }}>FSUIPC · Telemetry · PIREP</span><strong style={{ fontSize: "2rem" }}>↓</strong></div>
        </div>
      </div>
    </section>

    {!release && <div className="notice">El Staff todavía no ha publicado ningún instalador de ACARS en HispaFly Software Center.</div>}
    {release?.mandatory && <div className="feedback error">Esta versión está marcada como actualización obligatoria. Instálala antes de iniciar el próximo vuelo.</div>}

    <section className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, .75fr) minmax(300px, 1.2fr) minmax(260px, .9fr)" }}>
        <div style={{ padding: 28, borderRight: "1px solid var(--border, #e3e7ee)" }}>
          <span className="meta">ÚLTIMA VERSIÓN</span><strong style={{ display: "block", fontSize: "3rem", margin: "8px 0 18px" }}>{release?.version ?? "—"}</strong>
          <div className="detail-grid" style={{ gridTemplateColumns: "1fr", gap: 10 }}>
            <div><span className="meta">Publicado</span><strong>{formatDate(release?.publishedAt ?? null)}</strong></div>
            <div><span className="meta">Tamaño</span><strong>{release ? formatReleaseSize(release.fileSize) : "—"}</strong></div>
            <div><span className="meta">Plataforma</span><strong>Windows 10/11 x64</strong></div>
            <div><span className="meta">Estado</span><strong>{release?.mandatory ? "Actualización obligatoria" : "Beta cerrada"}</strong></div>
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
      <div className="card-header"><h2 className="card-title">Guía rápida de instalación</h2></div>
      <div className="detail-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <div className="card" style={{ padding: 20 }}><span className="badge red">1</span><h3>Requisitos</h3><p>Instala MSFS 2020/2024 y FSUIPC7.</p></div>
        <div className="card" style={{ padding: 20 }}><span className="badge red">2</span><h3>Instalación</h3><p>Cierra ACARS y ejecuta el instalador descargado.</p></div>
        <div className="card" style={{ padding: 20 }}><span className="badge red">3</span><h3>Inicio de sesión</h3><p>Usa las credenciales de tu cuenta HispaFly AOC.</p></div>
        <div className="card" style={{ padding: 20 }}><span className="badge red">4</span><h3>Comprobación</h3><p>Verifica FSUIPC, fase, combustible y Dispatch.</p></div>
      </div>
      <div className="notice" style={{ marginTop: 18 }}>Versión beta: mantén ACARS abierto hasta confirmar que el vuelo y la telemetría final se han sincronizado.</div>
    </section>
  </PilotPortalShell>;
}

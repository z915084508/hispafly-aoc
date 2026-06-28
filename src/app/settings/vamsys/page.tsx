import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { prisma } from "@/lib/prisma";
import { databaseConfigured } from "@/lib/staff/currentStaff";
import { isVamsysPilotConfigured } from "@/lib/vamsys/config";

type ConnectionRow = {
  id: string;
  name: string;
  callsign: string | null;
  username: string | null;
  status: "connected" | "expired" | "revoked" | "disconnected";
  expiresAt: Date | null;
  updatedAt: Date;
};

async function getConnections(): Promise<ConnectionRow[]> {
  if (!databaseConfigured) return [];
  try {
    const pilots = await prisma.pilot.findMany({
      select: {
        id: true, displayName: true, callsign: true, username: true, updatedAt: true,
        vamsysOAuthToken: { select: { expiresAt: true, revokedAt: true, updatedAt: true } },
      },
      orderBy: { displayName: "asc" },
    });
    return pilots.map((pilot) => {
      const token = pilot.vamsysOAuthToken;
      const status = !token ? "disconnected" : token.revokedAt ? "revoked" : token.expiresAt <= new Date() ? "expired" : "connected";
      return { id: pilot.id, name: pilot.displayName, callsign: pilot.callsign, username: pilot.username, status, expiresAt: token?.expiresAt ?? null, updatedAt: token?.updatedAt ?? pilot.updatedAt };
    });
  } catch (error) {
    console.error("Unable to load vAMSYS connections.", error);
    return [];
  }
}

const labels = { connected: "Conectado", expired: "Expirado", revoked: "Revocado", disconnected: "Sin conectar" };
const tones = { connected: "green", expired: "amber", revoked: "red", disconnected: "gray" } as const;

export default async function VamsysSettingsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const [connections, feedback] = await Promise.all([getConnections(), searchParams]);
  const configured = isVamsysPilotConfigured();
  return <>
    <PageHeading eyebrow="INTEGRACIÓN DE PILOTOS" title="Conexión vAMSYS" copy="Consentimiento OAuth individual mediante Authorization Code + PKCE." />
    {feedback.success && <div className="feedback success">{feedback.success}</div>}
    {feedback.error && <div className="feedback error">{feedback.error}</div>}
    {!configured && <div className="notice">Configura VAMSYS_PILOT_CLIENT_ID y VAMSYS_PILOT_REDIRECT_URI para activar la conexión.</div>}
    <div className="oauth-connect-card card">
      <div><h2 className="card-title">Conectar una cuenta de piloto</h2><p className="page-copy">El piloto será enviado a vAMSYS para autorizar el acceso. HISPAFLY nunca recibe su contraseña.</p></div>
      {configured ? <a className="button" href="/api/vamsys/oauth/start">Conectar vAMSYS</a> : <span className="button disabled-button">Configuración pendiente</span>}
    </div>
    <div className="card"><DataTable
      headers={["Piloto", "Usuario vAMSYS", "Estado del token", "Expira", "Última actualización"]}
      rows={connections.map((row) => [
        <Identity key="pilot" primary={row.name} secondary={row.callsign ?? row.id} />,
        row.username ?? "—",
        <Badge key="status" tone={tones[row.status]}>{labels[row.status]}</Badge>,
        row.expiresAt ? new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }).format(row.expiresAt) + " UTC" : "—",
        new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }).format(row.updatedAt) + " UTC",
      ])}
    /></div>
  </>;
}

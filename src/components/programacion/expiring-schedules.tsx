import Link from "next/link";
import { listExpiringSchedules } from "@/lib/native-scheduling/expiration";
import { renewProgramacionExpiryAction } from "@/app/staff/operations/programacion/expiring/actions";

const DAY_LABELS = ["", "L", "M", "X", "J", "V", "S", "D"];
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const date = (value: Date) => new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeZone: "UTC" }).format(value);
const days = (values: number[]) => values.map((value) => DAY_LABELS[value]).join(" ");

function urgency(daysRemaining: number) {
  if (daysRemaining < 0) return { label: `VENCIDA ${Math.abs(daysRemaining)} d`, badge: "badge red" };
  if (daysRemaining === 0) return { label: "VENCE HOY", badge: "badge red" };
  if (daysRemaining <= 7) return { label: `${daysRemaining} d`, badge: "badge red" };
  if (daysRemaining <= 30) return { label: `${daysRemaining} d`, badge: "badge amber" };
  return { label: `${daysRemaining} d`, badge: "badge blue" };
}

export async function ExpiringSchedules({
  query,
  canManage,
}: {
  query: Record<string, string | undefined>;
  canManage: boolean;
}) {
  const requestedHorizon = Number(query.horizon);
  const horizon = [30, 60, 90, 180].includes(requestedHorizon) ? requestedHorizon : 60;
  const rows = await listExpiringSchedules({ horizonDays: horizon, recentExpiredDays: 30 });
  const expired = rows.filter((row) => row.daysRemaining < 0).length;
  const sevenDays = rows.filter((row) => row.daysRemaining >= 0 && row.daysRemaining <= 7).length;
  const thirtyDays = rows.filter((row) => row.daysRemaining > 7 && row.daysRemaining <= 30).length;

  return <>
    <div className="page-header">
      <div>
        <div className="eyebrow">OPERACIONES · PROGRAMACIÓN</div>
        <h1>Vencimientos de programación</h1>
        <p>Controla qué rutas y vuelos programados están próximos a finalizar y decide si deben continuar operando.</p>
      </div>
      <Link className="button secondary" href="/staff/operations/programacion">← Volver a Programación</Link>
    </div>

    {query.renewed === "1" && <div className="feedback success"><strong>Programación renovada.</strong> Se han generado {query.generated ?? "0"} nuevas instancias de vuelo dentro del horizonte operativo.</div>}
    {query.generationWarning === "1" && <div className="feedback error">La vigencia se renovó, pero no se pudieron generar automáticamente las nuevas instancias. Revisa la programación y vuelve a generar los vuelos.</div>}
    {query.error && <div className="feedback error">{query.error}</div>}

    <section className="planner-summary" style={{ marginBottom: 18 }}>
      <div><span>VENCIDAS RECIENTES</span><strong className={expired ? "danger-text" : ""}>{expired}</strong></div>
      <div><span>VENCEN ≤ 7 DÍAS</span><strong className={sevenDays ? "danger-text" : ""}>{sevenDays}</strong></div>
      <div><span>VENCEN 8–30 DÍAS</span><strong>{thirtyDays}</strong></div>
      <div><span>EN VENTANA</span><strong>{rows.length}</strong></div>
    </section>

    <form className="audit-filters" method="get">
      <label>Ventana de control
        <select name="horizon" defaultValue={String(horizon)}>
          <option value="30">Próximos 30 días</option>
          <option value="60">Próximos 60 días</option>
          <option value="90">Próximos 90 días</option>
          <option value="180">Próximos 180 días</option>
        </select>
      </label>
      <button className="button secondary">APLICAR</button>
    </form>

    {!rows.length ? <div className="empty-state card">No hay programaciones con fecha fin dentro de esta ventana.</div> : <div className="table-wrap programacion-table">
      <table>
        <thead><tr><th>Programación</th><th>Ruta</th><th>Operación</th><th>Flota / aeronave</th><th>Vigencia</th><th>Vencimiento</th><th>Estado</th><th>Decisión</th></tr></thead>
        <tbody>{rows.map((row) => {
          const warning = urgency(row.daysRemaining);
          return <tr key={row.id}>
            <td><strong>{row.route.flightNumber ?? row.code}</strong><br/><span className="meta">{row.code}</span></td>
            <td><strong>{row.route.departure} → {row.route.arrival}</strong></td>
            <td>{days(row.daysOfWeek)}<br/><span className="meta">{hhmm(row.departureTimeMinutesUtc)} → {hhmm(row.arrivalTimeMinutesUtc)} UTC</span></td>
            <td>{row.defaultFleet?.code ?? row.defaultFleet?.name ?? "Libre"}<br/><span className="meta">{row.assignedAircraft?.registration ?? "Sin aeronave fija"}</span></td>
            <td>{date(row.effectiveFrom)}<br/><span className="meta">hasta {date(row.effectiveUntil)}</span></td>
            <td><span className={warning.badge}>{warning.label}</span></td>
            <td><span className={row.status === "ACTIVE" ? "badge green" : row.status === "EXPIRED" ? "badge red" : "badge amber"}>{row.status}</span></td>
            <td>
              {canManage ? <form action={renewProgramacionExpiryAction} className="button-row" style={{ flexWrap: "wrap" }}>
                <input type="hidden" name="id" value={row.id}/>
                <input type="hidden" name="horizon" value={horizon}/>
                <button className="button secondary" name="extendDays" value="30">+30 d</button>
                <button className="button secondary" name="extendDays" value="90">+90 d</button>
                <button className="button secondary" name="extendDays" value="180">+180 d</button>
                <button className="button secondary" name="extendDays" value="365">+1 año</button>
                <button className="button" name="mode" value="NO_EXPIRY">Sin fecha fin</button>
              </form> : <span className="meta">Solo lectura</span>}
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>}

    <div className="notice" style={{ marginTop: 18 }}>
      Si Staff no toma ninguna acción, la programación deja de operar al superar su fecha fin. Renovar una programación vencida la reactiva y vuelve a generar los vuelos que correspondan dentro de su horizonte de generación.
    </div>
  </>;
}

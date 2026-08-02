"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { bulkPublishProgramacionAction } from "@/app/staff/operations/programacion/actions";
import styles from "./publication-queue.module.css";

export type PublicationQueueRow = {
  id: string;
  code: string;
  flightNumber: string;
  route: string;
  days: string;
  utc: string;
  fleet: string;
  aircraft: string;
  effectivePeriod: string;
  state: "READY" | "WARNING" | "BLOCKED";
  errors: number;
  warnings: number;
  expectedCreated: number;
  existing: number;
  warningFingerprint: string;
  issues: Array<{ code: string; message: string }>;
};

const stateLabel = (state: PublicationQueueRow["state"]) => state === "READY" ? "LISTA" : state === "WARNING" ? "ADVERTENCIAS" : "BLOQUEADA";
const stateClass = (state: PublicationQueueRow["state"]) => state === "READY" ? "badge" : state === "WARNING" ? "badge amber" : "badge red";
const rowClass = (state: PublicationQueueRow["state"]) => state === "READY" ? styles.ready : state === "WARNING" ? styles.warning : styles.blocked;

export function PublicationQueue({
  rows,
  canPublish,
  returnTo,
}: {
  rows: PublicationQueueRow[];
  canPublish: boolean;
  returnTo: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState(false);

  useEffect(() => {
    const visible = new Set(rows.map(({ id }) => id));
    setSelected((current) => new Set([...current].filter((id) => visible.has(id))));
  }, [rows]);

  const selectedRows = useMemo(() => rows.filter(({ id }) => selected.has(id)), [rows, selected]);
  const selectedReady = selectedRows.filter(({ state }) => state === "READY").length;
  const selectedWarnings = selectedRows.filter(({ state }) => state === "WARNING").length;
  const selectedBlocked = selectedRows.filter(({ state }) => state === "BLOCKED").length;
  const expectedCreated = selectedRows.reduce((sum, row) => sum + row.expectedCreated, 0);

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectAll = () => setSelected(new Set(rows.map(({ id }) => id)));
  const selectReady = () => setSelected(new Set(rows.filter(({ state }) => state === "READY").map(({ id }) => id)));

  return <form action={bulkPublishProgramacionAction} className={styles.queue}>
    <input type="hidden" name="returnTo" value={returnTo}/>
    {rows.map((row) => <input key={`fingerprint-${row.id}`} type="hidden" name={`warningFingerprint:${row.id}`} value={row.warningFingerprint}/>) }

    <section className={`${styles.summary} card`}>
      <div><span>SELECCIONADAS</span><strong>{selectedRows.length}</strong></div>
      <div><span>LISTAS</span><strong>{selectedReady}</strong></div>
      <div><span>CON ADVERTENCIAS</span><strong>{selectedWarnings}</strong></div>
      <div><span>BLOQUEADAS</span><strong>{selectedBlocked}</strong></div>
      <div><span>FLIGHTS PREVISTOS</span><strong>{expectedCreated}</strong></div>
    </section>

    <div className={`${styles.toolbar} card`}>
      <div className="button-row">
        <button type="button" className="button secondary" onClick={selectAll} disabled={!rows.length}>SELECCIONAR TODO</button>
        <button type="button" className="button secondary" onClick={selectReady} disabled={!rows.some(({ state }) => state === "READY")}>SOLO LISTAS</button>
        <button type="button" className="button secondary" onClick={() => setSelected(new Set())} disabled={!selected.size}>LIMPIAR</button>
        <button type="button" className="button secondary" onClick={() => router.refresh()}>ACTUALIZAR VALIDACIÓN</button>
      </div>
      {selectedWarnings > 0 && <label className="programacion-ack">
        <input type="checkbox" name="acknowledgeWarnings" value="yes" checked={acknowledgeWarnings} onChange={(event) => setAcknowledgeWarnings(event.target.checked)}/>
        He revisado y acepto las advertencias actuales de las programaciones seleccionadas.
      </label>}
      {canPublish ? <div className="button-row">
        <button className="button secondary" name="batchMode" value="ready" disabled={!selectedReady}>PUBLICAR LISTAS</button>
        <button className="button" name="batchMode" value="selected" disabled={!selectedRows.length || (selectedWarnings > 0 && !acknowledgeWarnings)}>PUBLICAR SELECCIONADAS</button>
      </div> : <p className="meta">Tu usuario puede revisar la cola, pero no dispone de permiso para publicar.</p>}
    </div>

    <div className={`table-wrap programacion-table ${styles.table}`}><table>
      <thead><tr><th><span className="sr-only">Seleccionar</span></th><th>Programación</th><th>Ruta</th><th>Días / UTC</th><th>Flota / aeronave</th><th>Vigencia</th><th>Validación</th><th>Flights</th><th>Acciones</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id} className={rowClass(row.state)}>
        <td><input type="checkbox" name="scheduleId" value={row.id} checked={selected.has(row.id)} onChange={() => toggle(row.id)} disabled={!canPublish} aria-label={`Seleccionar ${row.code}`}/></td>
        <td><strong>{row.code}</strong><span className="secondary">{row.flightNumber}</span></td>
        <td>{row.route}</td>
        <td>{row.days}<span className="secondary">{row.utc}</span></td>
        <td>{row.fleet}<span className="secondary">{row.aircraft}</span></td>
        <td>{row.effectivePeriod}</td>
        <td><span className={stateClass(row.state)}>{stateLabel(row.state)}</span><span className="secondary">{row.errors} conflictos · {row.warnings} advertencias</span>{row.issues.length > 0 && <details className={styles.issues}><summary>Ver problemas</summary><ul>{row.issues.map((issue, index) => <li key={`${row.id}-${issue.code}-${index}`}><strong>{issue.code}</strong> · {issue.message}</li>)}</ul></details>}</td>
        <td>{row.expectedCreated}<span className="secondary">{row.existing} existentes</span></td>
        <td><Link href={`/staff/operations/programacion/${row.id}`}>ABRIR DETALLE</Link></td>
      </tr>)}</tbody>
    </table></div>
  </form>;
}

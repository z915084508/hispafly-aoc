"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkPublishProgramacionAction } from "@/app/staff/operations/programacion/actions";
import {
  archiveProgramacionDraftsAction,
  type ProgramacionArchiveResult,
} from "@/app/staff/operations/programacion/archive-actions";
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
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => new Set());
  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState(false);
  const [archiveResult, setArchiveResult] = useState<ProgramacionArchiveResult | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archivePending, startArchiveTransition] = useTransition();

  const visibleRows = useMemo(() => rows.filter(({ id }) => !archivedIds.has(id)), [rows, archivedIds]);

  useEffect(() => {
    const visible = new Set(visibleRows.map(({ id }) => id));
    setSelected((current) => new Set([...current].filter((id) => visible.has(id))));
  }, [visibleRows]);

  const selectedRows = useMemo(() => visibleRows.filter(({ id }) => selected.has(id)), [visibleRows, selected]);
  const selectedReady = selectedRows.filter(({ state }) => state === "READY").length;
  const selectedWarnings = selectedRows.filter(({ state }) => state === "WARNING").length;
  const selectedBlocked = selectedRows.filter(({ state }) => state === "BLOCKED").length;
  const expectedCreated = selectedRows.reduce((sum, row) => sum + row.expectedCreated, 0);

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectAll = () => setSelected(new Set(visibleRows.map(({ id }) => id)));
  const selectReady = () => setSelected(new Set(visibleRows.filter(({ state }) => state === "READY").map(({ id }) => id)));

  const archiveRows = (scheduleIds: string[], label: string) => {
    if (!scheduleIds.length || archivePending) return;
    const confirmed = window.confirm(
      scheduleIds.length === 1
        ? `¿Archivar la programación ${label}? Seguirá disponible en la lista con estado ARCHIVED.`
        : `¿Archivar las ${scheduleIds.length} programaciones seleccionadas? Seguirán disponibles en la lista con estado ARCHIVED.`,
    );
    if (!confirmed) return;

    setArchiveError(null);
    setArchiveResult(null);
    startArchiveTransition(async () => {
      try {
        const result = await archiveProgramacionDraftsAction(scheduleIds);
        const archived = result.items.filter((item) => item.archived).map((item) => item.scheduleId);
        setArchivedIds((current) => new Set([...current, ...archived]));
        setSelected((current) => new Set([...current].filter((id) => !archived.includes(id))));
        setArchiveResult(result);
        router.refresh();
      } catch (error) {
        setArchiveError(error instanceof Error ? error.message : "No se pudieron archivar las programaciones seleccionadas.");
      }
    });
  };

  return <form action={bulkPublishProgramacionAction} className={styles.queue}>
    <input type="hidden" name="returnTo" value={returnTo}/>
    {visibleRows.map((row) => <input key={`fingerprint-${row.id}`} type="hidden" name={`warningFingerprint:${row.id}`} value={row.warningFingerprint}/>) }

    {archiveResult && <div className="feedback success"><strong>Archivo completado.</strong> {archiveResult.archived} archivadas y {archiveResult.failed} no archivadas.{archiveResult.failed > 0 && <ul>{archiveResult.items.filter((item) => !item.archived).map((item) => <li key={item.scheduleId}>{item.code ?? item.scheduleId} · {item.message ?? "No se pudo archivar."}</li>)}</ul>}</div>}
    {archiveError && <div className="feedback error"><strong>No se pudo completar el archivo.</strong> {archiveError}</div>}

    <section className={`${styles.summary} card`}>
      <div><span>SELECCIONADAS</span><strong>{selectedRows.length}</strong></div>
      <div><span>LISTAS</span><strong>{selectedReady}</strong></div>
      <div><span>CON ADVERTENCIAS</span><strong>{selectedWarnings}</strong></div>
      <div><span>BLOQUEADAS</span><strong>{selectedBlocked}</strong></div>
      <div><span>FLIGHTS PREVISTOS</span><strong>{expectedCreated}</strong></div>
    </section>

    <div className={`${styles.toolbar} card`}>
      <div className="button-row">
        <button type="button" className="button secondary" onClick={selectAll} disabled={!visibleRows.length || archivePending}>SELECCIONAR TODO</button>
        <button type="button" className="button secondary" onClick={selectReady} disabled={!visibleRows.some(({ state }) => state === "READY") || archivePending}>SOLO LISTAS</button>
        <button type="button" className="button secondary" onClick={() => setSelected(new Set())} disabled={!selected.size || archivePending}>LIMPIAR</button>
        <button type="button" className="button secondary" onClick={() => router.refresh()} disabled={archivePending}>ACTUALIZAR VALIDACIÓN</button>
      </div>
      {selectedWarnings > 0 && <label className="programacion-ack">
        <input type="checkbox" name="acknowledgeWarnings" value="yes" checked={acknowledgeWarnings} onChange={(event) => setAcknowledgeWarnings(event.target.checked)}/>
        He revisado y acepto las advertencias actuales de las programaciones seleccionadas.
      </label>}
      {canPublish ? <div className="button-row">
        <button className="button secondary" name="batchMode" value="ready" disabled={!selectedReady || archivePending}>PUBLICAR LISTAS</button>
        <button className="button" name="batchMode" value="selected" disabled={!selectedRows.length || (selectedWarnings > 0 && !acknowledgeWarnings) || archivePending}>PUBLICAR SELECCIONADAS</button>
        <button type="button" className={styles.archiveButton} onClick={() => archiveRows(selectedRows.map(({ id }) => id), "seleccionadas")} disabled={!selectedRows.length || archivePending}>{archivePending ? "ARCHIVANDO…" : "ARCHIVAR SELECCIONADAS"}</button>
      </div> : <p className="meta">Tu usuario puede revisar la cola, pero no dispone de permiso para publicar o archivar.</p>}
    </div>

    <div className={`table-wrap programacion-table ${styles.table}`}><table>
      <thead><tr><th><span className="sr-only">Seleccionar</span></th><th>Programación</th><th>Ruta</th><th>Días / UTC</th><th>Flota / aeronave</th><th>Vigencia</th><th>Validación</th><th>Flights</th><th>Acciones</th></tr></thead>
      <tbody>{visibleRows.map((row) => <tr key={row.id} className={rowClass(row.state)}>
        <td><input type="checkbox" name="scheduleId" value={row.id} checked={selected.has(row.id)} onChange={() => toggle(row.id)} disabled={!canPublish || archivePending} aria-label={`Seleccionar ${row.code}`}/></td>
        <td><strong>{row.code}</strong><span className="secondary">{row.flightNumber}</span></td>
        <td>{row.route}</td>
        <td>{row.days}<span className="secondary">{row.utc}</span></td>
        <td>{row.fleet}<span className="secondary">{row.aircraft}</span></td>
        <td>{row.effectivePeriod}</td>
        <td><span className={stateClass(row.state)}>{stateLabel(row.state)}</span><span className="secondary">{row.errors} conflictos · {row.warnings} advertencias</span>{row.issues.length > 0 && <details className={styles.issues}><summary>Ver problemas</summary><ul>{row.issues.map((issue, index) => <li key={`${row.id}-${issue.code}-${index}`}><strong>{issue.code}</strong> · {issue.message}</li>)}</ul></details>}</td>
        <td>{row.expectedCreated}<span className="secondary">{row.existing} existentes</span></td>
        <td><div className={styles.rowActions}><Link href={`/staff/operations/programacion/${row.id}`}>ABRIR DETALLE</Link>{canPublish && <button type="button" onClick={() => archiveRows([row.id], row.code)} disabled={archivePending}>ARCHIVAR</button>}</div></td>
      </tr>)}</tbody>
    </table></div>
  </form>;
}

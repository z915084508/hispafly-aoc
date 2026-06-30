"use client";

import { useRef, useState } from "react";

type BatchResponse = {
  ok: boolean;
  scanned?: number;
  fuelUpdated?: number;
  expensesGenerated?: number;
  skipped?: number;
  errors?: string[];
  nextCursor?: string | null;
  done?: boolean;
  error?: string;
};

export function EconomyBackfillRunner({ total }: { total: number }) {
  const [running, setRunning] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [fuelUpdated, setFuelUpdated] = useState(0);
  const [expensesUpdated, setExpensesUpdated] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const stopRequested = useRef(false);

  async function start() {
    setRunning(true);
    setProcessed(0);
    setFuelUpdated(0);
    setExpensesUpdated(0);
    setMessage(null);
    stopRequested.current = false;
    let cursor: string | null = null;
    let scannedTotal = 0;
    let fuelTotal = 0;
    let expenseTotal = 0;

    try {
      do {
        const response = await fetch("/api/staff/economy/backfill", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cursor, limit: 10 }),
        });
        const batch = await response.json() as BatchResponse;
        if (!response.ok || !batch.ok) throw new Error(batch.error ?? "No se pudo procesar el lote.");
        scannedTotal += batch.scanned ?? 0;
        fuelTotal += batch.fuelUpdated ?? 0;
        expenseTotal += batch.expensesGenerated ?? 0;
        setProcessed(scannedTotal);
        setFuelUpdated(fuelTotal);
        setExpensesUpdated(expenseTotal);
        if (batch.errors?.length) setMessage(`Aviso: ${batch.errors[0]}`);
        cursor = batch.nextCursor ?? null;
        if (batch.done || !cursor) break;
      } while (!stopRequested.current);

      if (stopRequested.current) setMessage(`Pausado después de ${scannedTotal} PIREPs. Puedes iniciar de nuevo para una revisión completa.`);
      else {
        setMessage(`Completado: ${scannedTotal} PIREPs revisados, ${fuelTotal} fuel snapshots y ${expenseTotal} gastos actualizados.`);
        window.setTimeout(() => window.location.reload(), 1800);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "El proceso se detuvo por un error.");
    } finally {
      setRunning(false);
    }
  }

  const progress = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  return <div className="settings-link">
    <div className="workflow-summary">
      <div><strong>{processed} / {total}</strong><span>Revisados en esta ejecución ({progress}%)</span></div>
      <div><strong>{fuelUpdated}</strong><span>Fuel snapshots actualizados</span></div>
      <div><strong>{expensesUpdated}</strong><span>Gastos generados / actualizados</span></div>
    </div>
    <div className="pirep-toolbar">
      <button className="button" type="button" onClick={start} disabled={running}>{running ? `Procesando ${processed} / ${total}...` : "Procesar todos los PIREPs"}</button>
      {running && <button className="action-button reject" type="button" onClick={() => { stopRequested.current = true; }}>Pausar después del lote actual</button>}
    </div>
    {message && <div className={message.startsWith("Completado") ? "feedback success" : "feedback error"}>{message}</div>}
    <p className="meta">Una sola pulsación inicia todos los lotes. Mantén esta pestaña abierta hasta que llegue al 100%.</p>
  </div>;
}

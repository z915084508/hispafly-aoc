"use client";

import { deleteProgramacionAction } from "@/app/staff/operations/programacion/actions";

export function DeleteProgramacionForm({ id, code }: { id: string; code: string }) {
  return <form action={deleteProgramacionAction} className="card" onSubmit={(event) => {
    if (!window.confirm(`¿Seguro que deseas eliminar la programación ${code}? Esta acción no se puede deshacer.`)) event.preventDefault();
  }}>
    <h2>Eliminar programación</h2>
    <p className="meta">Solo se eliminará si nunca se publicó y no tiene vuelos relacionados.</p>
    <input type="hidden" name="id" value={id}/>
    <button className="button secondary">Eliminar</button>
  </form>;
}

type Option = { value: string; label: string };

export function PilotListStyles() {
  return <style>{`
    .pilot-list-tools { display: grid; gap: 12px; margin-bottom: 16px; }
    .pilot-filter-bar { display: grid; grid-template-columns: minmax(220px, 1.5fr) repeat(3, minmax(150px, .7fr)) auto auto; gap: 10px; align-items: end; }
    .pilot-filter-field { display: grid; gap: 6px; }
    .pilot-filter-field label { color: var(--muted); font-size: 9px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; }
    .pilot-filter-field input, .pilot-filter-field select { width: 100%; border: 1px solid var(--line); border-radius: 9px; padding: 10px 11px; background: #fbfcfe; color: var(--ink); }
    .pilot-filter-meta { color: var(--muted); font-size: 11px; }
    .weekly-payroll { display: grid; gap: 14px; }
    .weekly-payroll details { overflow: hidden; }
    .weekly-payroll summary { cursor: pointer; list-style: none; }
    .weekly-payroll summary::-webkit-details-marker { display: none; }
    .weekly-summary { display: grid; grid-template-columns: minmax(180px, 1.2fr) repeat(5, minmax(100px, .7fr)); gap: 12px; align-items: center; padding: 18px 20px; }
    .weekly-summary strong { display: block; font-size: 17px; }
    .weekly-summary span { color: var(--muted); font-size: 10px; }
    @media (max-width: 1050px) { .pilot-filter-bar { grid-template-columns: 1fr 1fr; } .weekly-summary { grid-template-columns: 1fr 1fr 1fr; } }
    @media (max-width: 620px) { .pilot-filter-bar, .weekly-summary { grid-template-columns: 1fr; } }
  `}</style>;
}

export function PilotFilterBar({ q = "", month = "", sort = "date_desc", extra, clearHref }: {
  q?: string; month?: string; sort?: string; clearHref: string;
  extra?: { name: string; label: string; value?: string; options: Option[] };
}) {
  return <form className="card pilot-filter-bar" method="get">
    <div className="pilot-filter-field"><label>Buscar</label><input name="q" defaultValue={q} placeholder="Vuelo, ruta, aeronave, referencia..." /></div>
    <div className="pilot-filter-field"><label>Mes</label><input name="month" type="month" defaultValue={month} /></div>
    {extra && <div className="pilot-filter-field"><label>{extra.label}</label><select name={extra.name} defaultValue={extra.value ?? ""}><option value="">Todos</option>{extra.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>}
    <div className="pilot-filter-field"><label>Orden</label><select name="sort" defaultValue={sort}><option value="date_desc">Más reciente</option><option value="date_asc">Más antiguo</option><option value="amount_desc">Importe mayor</option><option value="amount_asc">Importe menor</option></select></div>
    <button className="action-button approve" type="submit">Aplicar</button>
    <a className="action-button" href={clearHref}>Limpiar</a>
  </form>;
}

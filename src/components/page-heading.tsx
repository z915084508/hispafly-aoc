export function PageHeading({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: string }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-copy">{copy}</p></div>{action && <button className="button">{action}</button>}</div>;
}

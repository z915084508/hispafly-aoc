export function CareerProgressBar({ percent, small = false }: { percent: number; small?: boolean }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return <div className={`career-progress${small ? " small" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
    <div style={{ width: `${value}%` }} />
    <span style={{ width: `${Math.max(value, 6)}%` }}>{value}%</span>
  </div>;
}

import type { ReactNode } from "react";

export function DataTable({ headers, rows }: { headers: ReactNode[]; rows: ReactNode[][] }) {
  return <div className="table-wrap"><table><thead><tr>{headers.map((h, index) => <th key={typeof h === "string" ? h : index}>{h}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

export function Identity({ primary, secondary }: { primary: string; secondary: string }) {
  return <span className="primary">{primary}<span className="secondary">{secondary}</span></span>;
}

export function Badge({ children, tone = "green" }: { children: ReactNode; tone?: "green" | "blue" | "amber" | "red" | "gray" }) {
  return <span className={`badge ${tone === "green" ? "" : tone}`}>{children}</span>;
}

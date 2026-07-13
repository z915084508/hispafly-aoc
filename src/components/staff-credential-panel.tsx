"use client";

import { useActionState, useState } from "react";
import { generateTemporaryPasswordAction, type TemporaryPasswordState } from "@/app/staff/admin/users/actions";

const initialState: TemporaryPasswordState = { status: "idle" };

export function StaffCredentialPanel({
  staffUserId,
  configured,
  mustChangePassword,
  lockedUntil,
  lastLoginAt,
  activeSessionCount,
}: {
  staffUserId: string;
  configured: boolean;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  activeSessionCount: number;
}) {
  const [state, formAction, pending] = useActionState(generateTemporaryPasswordAction, initialState);
  const [copied, setCopied] = useState(false);

  async function copyPassword() {
    if (!state.password) return;
    await navigator.clipboard.writeText(state.password);
    setCopied(true);
  }

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <div className="eyebrow">LOGIN SECURITY</div>
          <h2 className="card-title">Staff credentials</h2>
        </div>
        <span className="meta">{configured ? "Password configured" : "No password"}</span>
      </div>
      <div className="grid stats">
        <div><div className="stat-label">First login change</div><div className="stat-value">{mustChangePassword ? "Required" : "No"}</div></div>
        <div><div className="stat-label">Active sessions</div><div className="stat-value">{activeSessionCount}</div></div>
        <div><div className="stat-label">Last login</div><div className="stat-value">{lastLoginAt ?? "Never"}</div></div>
        <div><div className="stat-label">Locked until</div><div className="stat-value">{lockedUntil ?? "Not locked"}</div></div>
      </div>

      <form action={formAction} className="settings-grid" style={{ marginTop: 18 }}>
        <input type="hidden" name="id" value={staffUserId} />
        <label>
          Reset reason
          <input name="reason" required placeholder="New account, forgotten password, security reset..." />
        </label>
        <button className="button" type="submit" disabled={pending}>{pending ? "Generating..." : "Generate temporary password"}</button>
      </form>

      {state.message && <div className={`feedback ${state.status === "error" ? "error" : "success"}`}>{state.message}</div>}
      {state.password && (
        <div className="notice" style={{ marginTop: 14 }}>
          <strong>This password will only be shown once.</strong>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <code style={{ fontSize: 16, padding: "10px 12px", background: "#fff", borderRadius: 8 }}>{state.password}</code>
            <button className="action-button approve" type="button" onClick={copyPassword}>{copied ? "Copied" : "Copy"}</button>
          </div>
        </div>
      )}
    </section>
  );
}

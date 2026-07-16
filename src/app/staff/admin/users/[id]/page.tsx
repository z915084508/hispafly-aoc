import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { PERMISSION_GROUPS } from "@/lib/staff/access/catalog";
import { resolvePermissionCodes } from "@/lib/staff/access/resolve";
import { getStaffCredentialStatus } from "@/lib/staff/auth/credentials";
import { StaffCredentialPanel } from "@/components/staff-credential-panel";
import { setPermissionOverrideAction, updateStaffAction } from "../actions";

export default async function StaffDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { id } = await params;
  const actor = await requireStaffPermission("STAFF_VIEW", { entityType: "StaffUser", entityId: id, attemptedAction: "view Staff detail" });
  const [staff, roles, query, audit, credentialStatus] = await Promise.all([
    prisma.staffUser.findUnique({
      where: { id },
      include: {
        roleTemplate: { include: { permissions: { include: { permission: true } } } },
        permissionOverrides: { include: { permission: true } },
      },
    }),
    prisma.staffRoleTemplate.findMany({ where: { active: true, code: { not: "OWNER" } }, orderBy: { displayOrder: "asc" } }),
    searchParams,
    prisma.aocAuditLog.findMany({ where: { entityType: "StaffUser", entityId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    getStaffCredentialStatus(id),
  ]);
  if (!staff) notFound();

  const inherited = new Set(staff.roleTemplate?.permissions.map((item) => item.permission.code) ?? []);
  const overrides = new Map(staff.permissionOverrides.map((item) => [item.permission.code, item.effect]));
  const effective = resolvePermissionCodes({
    legacyRole: staff.role,
    isSystemOwner: staff.isSystemOwner,
    rolePermissions: [...inherited],
    overrides: staff.permissionOverrides.map((item) => ({ code: item.permission.code, effect: item.effect })),
  });
  const canManageCredentials = Boolean(actor.isSystemOwner || actor.permissions?.includes("STAFF_CREDENTIAL_MANAGE") || actor.role === "ADMIN");

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">{staff.staffCode ?? "STAFF"}</div>
          <h1>{staff.name}</h1>
          <p>{staff.email} · {staff.roleTemplate?.name ?? `Legacy ${staff.role}`}</p>
        </div>
      </div>
      {query.success && <div className="feedback success">{query.success}</div>}
      {query.error && <div className="feedback error">{query.error}</div>}

      <form action={updateStaffAction} className="card settings-grid">
        <input type="hidden" name="id" value={id} />
        <label>Department<input name="department" defaultValue={staff.department ?? ""} /></label>
        <label>Job title<input name="jobTitle" defaultValue={staff.jobTitle ?? ""} /></label>
        <label>Role template<select name="roleTemplateId" defaultValue={staff.roleTemplateId ?? ""}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
        <label className="checkbox-row"><input name="active" type="checkbox" defaultChecked={staff.active} /> Active</label>
        <label>Reason<input name="reason" placeholder="Required for role/status changes" /></label>
        <button className="button">Save profile</button>
      </form>

      {canManageCredentials && (
        <StaffCredentialPanel
          staffUserId={id}
          configured={credentialStatus.configured}
          mustChangePassword={credentialStatus.mustChangePassword}
          lockedUntil={credentialStatus.lockedUntil?.toLocaleString() ?? null}
          lastLoginAt={credentialStatus.lastLoginAt?.toLocaleString() ?? null}
          activeSessionCount={credentialStatus.activeSessionCount}
        />
      )}

      {Object.entries(PERMISSION_GROUPS).map(([module, codes]) => (
        <section className="card" key={module}>
          <h2>{module}</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Permission</th><th>Inherited</th><th>Override</th><th>Effective</th><th>Change</th></tr></thead>
              <tbody>
                {codes.map((code) => (
                  <tr key={code}>
                    <td>{code}</td>
                    <td>{inherited.has(code) ? "Allow" : "—"}</td>
                    <td>{overrides.get(code) ?? "Inherit"}</td>
                    <td>{effective.has(code) ? "ALLOW" : "DENY"}</td>
                    <td>
                      <form action={setPermissionOverrideAction} className="inline-action-form">
                        <input type="hidden" name="id" value={id} />
                        <input type="hidden" name="permissionCode" value={code} />
                        <select name="effect" defaultValue={overrides.get(code) ?? "INHERIT"}>
                          <option>INHERIT</option><option>ALLOW</option><option>DENY</option>
                        </select>
                        <input name="reason" placeholder="Reason" />
                        <button className="action-button approve">Apply</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="card">
        <h2>Permission and security history</h2>
        {audit.map((entry) => <p key={entry.id}><strong>{entry.action}</strong> · {entry.createdAt.toLocaleString()}<br /><span className="meta">{entry.message}</span></p>)}
      </section>
    </>
  );
}

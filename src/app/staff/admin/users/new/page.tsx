import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { createStaffAction } from "../actions";

export default async function NewStaff({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireStaffPermission("STAFF_CREATE", { entityType: "StaffUser", attemptedAction: "create Staff" });
  const [roles, query] = await Promise.all([
    prisma.staffRoleTemplate.findMany({ where: { active: true, code: { not: "OWNER" } }, orderBy: { displayOrder: "asc" } }),
    searchParams,
  ]);
  return (
    <>
      <div className="page-header"><div><div className="eyebrow">STAFF ADMINISTRATION</div><h1>Create Staff</h1><p>Create the identity first, then generate a one-time temporary password from the Staff security section.</p></div></div>
      {query.error && <div className="notice">{query.error}</div>}
      <form action={createStaffAction} className="route-form">
        <fieldset>
          <legend><span>01</span>Staff identity</legend>
          <div className="route-form-grid">
            <label>Staff code<input name="staffCode" required maxLength={20} placeholder="NET001" /></label>
            <label>Display name<input name="name" required /></label>
            <label>Email<input name="email" type="email" required /></label>
            <label>Role template<select name="roleTemplateId" required><option value="">Select role</option>{roles.map((role) => <option value={role.id} key={role.id}>{role.name}</option>)}</select></label>
            <label>Department<input name="department" /></label>
            <label>Job title<input name="jobTitle" /></label>
            <label className="route-toggle"><input name="active" type="checkbox" defaultChecked /><span><strong>Active access</strong><small>A password must be generated before the first personal login.</small></span></label>
          </div>
        </fieldset>
        <div className="route-form-submit"><div><strong>Create Staff identity</strong><span>OWNER cannot be assigned here.</span></div><button className="button">Create Staff</button></div>
      </form>
    </>
  );
}

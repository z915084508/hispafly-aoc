"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { createStaff, setOverride, updateStaffProfile } from "@/lib/staff/admin/service";
import { generateTemporaryPassword, hashStaffPassword } from "@/lib/staff/auth/password";
import { setTemporaryStaffPassword } from "@/lib/staff/auth/credentials";
import { revokeAllStaffSessions } from "@/lib/staff/auth/session";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

export type TemporaryPasswordState = {
  status: "idle" | "success" | "error";
  message?: string;
  password?: string;
};

export async function createStaffAction(formData: FormData) {
  let target;
  try {
    const actor = await requireStaffPermission("STAFF_CREATE", { entityType: "StaffUser", attemptedAction: "create Staff" });
    const row = await createStaff({
      staffCode: text(formData, "staffCode").toUpperCase(),
      name: text(formData, "name"),
      email: text(formData, "email").toLowerCase(),
      department: text(formData, "department") || undefined,
      jobTitle: text(formData, "jobTitle") || undefined,
      roleTemplateId: text(formData, "roleTemplateId"),
      active: formData.get("active") === "on",
    }, actor);
    target = `/staff/admin/users/${row.id}?success=Staff%20created`;
  } catch (error) {
    target = `/staff/admin/users/new?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create Staff.")}`;
  }
  redirect(target);
}

export async function updateStaffAction(formData: FormData) {
  const id = text(formData, "id");
  let target;
  try {
    const actor = await requireStaffPermission("STAFF_EDIT", { entityType: "StaffUser", entityId: id, attemptedAction: "update Staff" });
    await updateStaffProfile(id, {
      department: text(formData, "department") || undefined,
      jobTitle: text(formData, "jobTitle") || undefined,
      roleTemplateId: text(formData, "roleTemplateId"),
      active: formData.get("active") === "on",
      reason: text(formData, "reason"),
    }, actor);
    target = `/staff/admin/users/${id}?success=Staff%20updated`;
  } catch (error) {
    target = `/staff/admin/users/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to update Staff.")}`;
  }
  redirect(target);
}

export async function setPermissionOverrideAction(formData: FormData) {
  const id = text(formData, "id");
  let target;
  try {
    const actor = await requireStaffPermission("STAFF_PERMISSION_MANAGE", { entityType: "StaffUser", entityId: id, attemptedAction: "change Staff permission" });
    await setOverride(id, text(formData, "permissionCode"), text(formData, "effect") as "ALLOW" | "DENY" | "INHERIT", text(formData, "reason"), actor);
    target = `/staff/admin/users/${id}?success=Permission%20updated`;
  } catch (error) {
    target = `/staff/admin/users/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to update permission.")}`;
  }
  redirect(target);
}

export async function generateTemporaryPasswordAction(
  _previous: TemporaryPasswordState,
  formData: FormData,
): Promise<TemporaryPasswordState> {
  const id = text(formData, "id");
  const reason = text(formData, "reason");
  try {
    const actor = await requireStaffPermission("STAFF_CREDENTIAL_MANAGE", { entityType: "StaffUser", entityId: id, attemptedAction: "reset Staff credentials" });
    if (!reason) throw new Error("A reason is required.");
    const target = await prisma.staffUser.findUnique({ where: { id } });
    if (!target) throw new Error("Staff account not found.");
    if (target.isSystemOwner && !actor.isSystemOwner) throw new Error("Only the system owner may reset OWNER credentials.");

    const password = generateTemporaryPassword();
    await setTemporaryStaffPassword(id, await hashStaffPassword(password));
    await revokeAllStaffSessions(id, "temporary_password_created");
    await prisma.aocAuditLog.create({
      data: {
        staffUserId: actor.id === "development-staff" ? undefined : actor.id,
        action: "STAFF_TEMPORARY_PASSWORD_CREATED",
        entityType: "StaffUser",
        entityId: id,
        message: `A temporary password was created for ${target.name}.`,
        metadata: { targetStaffCode: target.staffCode, reason },
      },
    });
    return { status: "success", message: "Temporary password created. It will only be shown once.", password };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to create a temporary password." };
  }
}

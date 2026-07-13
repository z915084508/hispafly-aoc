import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { changeOwnPasswordAction } from "@/app/admin-login/actions";

const messages: Record<string, string> = {
  current_password: "The current or temporary password is incorrect.",
  password_mismatch: "The new passwords do not match.",
  password_reused: "Choose a password different from the current password.",
};

export default async function ChangeStaffPassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [staff, params] = await Promise.all([getCurrentStaff(), searchParams]);
  if (!staff) redirect("/admin-login?error=staff_access_denied");
  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">ACCOUNT SECURITY</div>
          <h1>Change password</h1>
          <p>{staff.mustChangePassword ? "You must replace your temporary password before continuing." : "Update your personal Staff password."}</p>
        </div>
      </div>
      {params.error && <div className="feedback error">{messages[params.error] ?? params.error}</div>}
      <form action={changeOwnPasswordAction} className="card settings-grid">
        <label>Current or temporary password<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
        <label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
        <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
        <p className="meta">Use at least 12 characters and at least three of: uppercase, lowercase, number and symbol.</p>
        <button className="button" type="submit">Change password</button>
      </form>
    </>
  );
}

import { StaffPortalShell } from "@/components/portal-shell";
import { requireAdminStaff } from "@/lib/staff/requireAdmin";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  await requireAdminStaff();
  return <StaffPortalShell>{children}</StaffPortalShell>;
}

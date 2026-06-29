import { PortalShell } from "@/components/portal-shell";
import { requireAdminStaff } from "@/lib/staff/requireAdmin";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  await requireAdminStaff();
  return <PortalShell>{children}</PortalShell>;
}

import { StaffPortalShell } from "@/components/portal-shell";
import { requireActiveStaff } from "@/lib/staff/requireActive";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  await requireActiveStaff();
  return <StaffPortalShell>{children}</StaffPortalShell>;
}

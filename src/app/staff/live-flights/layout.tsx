import { requireStaffPermission } from "@/lib/staff/authorization";
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireStaffPermission("DISPATCH_VIEW", { entityType: "AcarsSession", attemptedAction: "view live operations" });
  return children;
}

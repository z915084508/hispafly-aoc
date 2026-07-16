import { requireStaffPermission } from "@/lib/staff/authorization";
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireStaffPermission("AIRPORT_VIEW", { entityType: "Airport", attemptedAction: "view airport management" });
  return children;
}

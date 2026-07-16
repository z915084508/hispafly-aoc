import { requireStaffPermission } from "@/lib/staff/authorization";
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireStaffPermission("ROUTE_VIEW", { entityType: "Route", attemptedAction: "view route management" });
  return children;
}

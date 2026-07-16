import { requireStaffPermission } from "@/lib/staff/authorization";
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireStaffPermission("FLIGHT_VIEW", { entityType: "Flight", attemptedAction: "view native flights" });
  return children;
}

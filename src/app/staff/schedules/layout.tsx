import { requireStaffPermission } from "@/lib/staff/authorization";
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireStaffPermission("SCHEDULE_VIEW", { entityType: "FlightSchedule", attemptedAction: "view native schedules" });
  return children;
}

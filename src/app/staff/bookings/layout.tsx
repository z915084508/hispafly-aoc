import { requireStaffPermission } from "@/lib/staff/authorization";
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireStaffPermission("BOOKING_VIEW", { entityType: "PilotBooking", attemptedAction: "view booking management" });
  return children;
}

import "@/app/airport-programacion-board.css";
import "@/app/airport-movement-timeline.css";
import "@/app/airport-movement-tooltip-fix.css";
import { requireStaffPermission } from "@/lib/staff/authorization";

export default async function AirportProgramacionLayout({ children }: { children: React.ReactNode }) {
  await requireStaffPermission("SCHEDULE_VIEW", {
    entityType: "FlightSchedule",
    attemptedAction: "view Programación by airport",
  });
  return children;
}

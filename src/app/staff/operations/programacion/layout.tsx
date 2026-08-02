import { requireStaffPermission } from "@/lib/staff/authorization";
import "@/app/programacion-workspace.css";
export default async function ProgramacionLayout({ children }: { children: React.ReactNode }) { await requireStaffPermission("SCHEDULE_VIEW", { entityType: "FlightSchedule", attemptedAction: "view Programación" }); return children; }

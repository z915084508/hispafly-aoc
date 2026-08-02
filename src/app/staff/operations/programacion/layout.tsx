import { requireStaffPermission } from "@/lib/staff/authorization";
export default async function ProgramacionLayout({ children }: { children: React.ReactNode }) { await requireStaffPermission("SCHEDULE_VIEW", { entityType: "FlightSchedule", attemptedAction: "view Programación" }); return children; }

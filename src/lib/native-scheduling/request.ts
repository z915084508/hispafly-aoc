import type { StaffIdentity } from "@/lib/staff/currentStaff";
import { staffHasPermission } from "@/lib/staff/permissions";

export function scheduleValidationAccessStatus(staff: StaffIdentity | null): 200 | 401 | 403 {
  if (!staff) return 401;
  return staffHasPermission(staff, "SCHEDULE_CREATE") ? 200 : 403;
}

export { parseScheduleValidationPayload } from "./payload";

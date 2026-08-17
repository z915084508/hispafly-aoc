import { ExpiringSchedules } from "@/components/programacion/expiring-schedules";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { staffHasPermission } from "@/lib/staff/permissions";

export const dynamic = "force-dynamic";

export default async function ProgramacionExpiringPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [query, staff] = await Promise.all([searchParams, getCurrentStaff()]);
  return <ExpiringSchedules query={query} canManage={staffHasPermission(staff, "SCHEDULE_STATUS_MANAGE")} />;
}

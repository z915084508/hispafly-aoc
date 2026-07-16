import { requireStaffPermission } from "@/lib/staff/authorization";
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireStaffPermission("NATIVE_CUTOVER_VIEW", { entityType: "NativeCutover", attemptedAction: "view Native cutover" });
  return children;
}

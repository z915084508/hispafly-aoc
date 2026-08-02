import { redirect } from "next/navigation";
const allowed = ["aircraftId", "week", "scheduleId", "includeExpired"];
export default async function LegacyPlannerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const source = await searchParams, target = new URLSearchParams({ view: "planner" });
  for (const key of allowed) { const value = source[key]; if (typeof value === "string") target.set(key, value); }
  redirect(`/staff/operations/programacion?${target.toString()}`);
}

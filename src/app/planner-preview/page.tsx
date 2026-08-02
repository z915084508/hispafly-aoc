import { notFound } from "next/navigation";
import { WeeklyPlanner } from "@/components/programacion/weekly-planner";
import { buildDevelopmentPlannerData } from "@/lib/native-scheduling/planner-service";

export default function PlannerPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const data=buildDevelopmentPlannerData(new Date("2026-08-03T00:00:00Z"));
  return <main className="planner-preview-shell"><div className="page-header"><div><div className="eyebrow">HISPAFLY · OPERACIONES</div><h1>Planificador semanal</h1><p>Rotación EC-VLC · 03–09 AGO 2026</p></div><span className="badge">HORARIO UTC</span></div><WeeklyPlanner week={data.week} schedules={data.schedules} aircraftId="demo-aircraft" fleetId="demo-fleet" canCreate canEdit/></main>;
}

import { PageHeading } from "@/components/page-heading";
import { prisma } from "@/lib/prisma";
import { requireAdminStaff } from "@/lib/staff/requireAdmin";
import { saveAircraftPerformanceAction } from "./actions";

export const dynamic = "force-dynamic";
export default async function FleetPerformancePage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  await requireAdminStaff(); const messages = await searchParams;
  const aircraft = await prisma.aircraft.findMany({ include: { performanceProfile: true }, orderBy: [{ registration: "asc" }, { vamsysAircraftId: "asc" }] });
  return <><PageHeading eyebrow="HISPAFLY FLEET" title="Aircraft Performance" copy="Tail-specific weights, cost index and fuel bias used when preparing SimBrief dispatches."/>
    {messages.success && <div className="feedback success">{messages.success}</div>}{messages.error && <div className="feedback error">{messages.error}</div>}
    {aircraft.map((item) => { const p = item.performanceProfile; return <section className="card" key={item.id}><div className="card-header"><h2 className="card-title">{item.registration ?? item.vamsysAircraftId} · {item.aircraftType ?? "Unknown type"}</h2><span className="meta">{p?.sampleSize ?? 0} calibration flights · FOB {item.fuelOnBoardKg ?? "—"} kg</span></div>
      <form action={saveAircraftPerformanceAction} className="form-grid"><input type="hidden" name="aircraftId" value={item.id}/>
        <label>OEW kg<input name="operatingEmptyWeightKg" type="number" defaultValue={p?.operatingEmptyWeightKg ?? ""}/></label><label>MZFW kg<input name="maxZeroFuelWeightKg" type="number" defaultValue={p?.maxZeroFuelWeightKg ?? ""}/></label><label>MTOW kg<input name="maxTakeoffWeightKg" type="number" defaultValue={p?.maxTakeoffWeightKg ?? item.mtowKg ?? ""}/></label><label>MLW kg<input name="maxLandingWeightKg" type="number" defaultValue={p?.maxLandingWeightKg ?? ""}/></label><label>Max fuel kg<input name="maxFuelKg" type="number" defaultValue={p?.maxFuelKg ?? ""}/></label><label>Max payload kg<input name="maxPayloadKg" type="number" defaultValue={p?.maxPayloadKg ?? ""}/></label><label>Cost index<input name="defaultCostIndex" type="number" defaultValue={p?.defaultCostIndex ?? ""}/></label><label>Fuel bias %<input name="fuelBiasPercent" type="number" step="0.1" min="-10" max="15" defaultValue={p?.fuelBiasPercent ?? 0}/></label><label>Taxi fuel kg<input name="taxiFuelKg" type="number" defaultValue={p?.taxiFuelKg ?? ""}/></label><label><input name="locked" type="checkbox" value="yes" defaultChecked={p?.locked}/> Lock automatic calibration</label><label>Notes<input name="notes" defaultValue={p?.notes ?? ""}/></label><button className="button" type="submit">Save performance</button>
      </form></section>; })}
  </>;
}

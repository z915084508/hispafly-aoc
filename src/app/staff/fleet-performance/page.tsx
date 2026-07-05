import { PageHeading } from "@/components/page-heading";
import { prisma } from "@/lib/prisma";
import { requireAdminStaff } from "@/lib/staff/requireAdmin";
import { groupAircraftByFleet } from "@/lib/fleet-performance/fleet";
import { importAircraftPerformanceAction, saveAircraftPerformanceAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function FleetPerformancePage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  await requireAdminStaff();
  const messages = await searchParams;
  const aircraft = await prisma.aircraft.findMany({ include: { performanceProfile: true }, orderBy: [{ fleetName: "asc" }, { aircraftType: "asc" }, { registration: "asc" }] });
  const fleets = groupAircraftByFleet(aircraft);

  return <>
    <PageHeading eyebrow="HISPAFLY FLEET" title="Aircraft Performance" copy="Fleet-level weights, capacity, cost index and fuel bias used for every aircraft in SimBrief dispatches."/>
    {messages.success && <div className="feedback success">{messages.success}</div>}
    {messages.error && <div className="feedback error">{messages.error}</div>}
    <section className="card performance-import-card">
      <div className="card-header"><div><h2 className="card-title">Bulk update with Excel</h2><p className="meta">Each row represents one fleet. Importing a row applies its values to every aircraft in that fleet.</p></div><a className="button" href="/api/staff/fleet-performance/export">Export fleet template</a></div>
      <form action={importAircraftPerformanceAction} className="performance-import-form"><input name="file" type="file" accept=".csv,text/csv" required/><button className="button" type="submit">Import completed template</button></form>
      <p className="meta">Complete the template in Excel and save it as CSV. Do not rename columns or change fleetKey. Maximum file size: 2 MB.</p>
    </section>
    {fleets.map(({ fleetKey, members }) => {
      const item = members[0];
      const profile = members.find((member) => member.performanceProfile)?.performanceProfile;
      return <section className="card" key={fleetKey}>
        <div className="card-header"><div><h2 className="card-title">{item.fleetName ?? item.fleetId ?? item.aircraftType ?? "Unassigned fleet"}</h2><p className="meta">{item.aircraftType ?? "Unknown type"} · {members.length} aircraft</p></div><span className="meta">Values apply to the entire fleet</span></div>
        <form action={saveAircraftPerformanceAction} className="form-grid"><input type="hidden" name="fleetKey" value={fleetKey}/>
          <label>Maximum seats<input name="seatCapacity" type="number" min="0" defaultValue={item.seatCapacity ?? ""}/></label>
          <label>Cargo capacity kg<input name="cargoCapacityKg" type="number" min="0" defaultValue={item.cargoCapacityKg ?? ""}/></label>
          <label>OEW kg<input name="operatingEmptyWeightKg" type="number" min="0" defaultValue={profile?.operatingEmptyWeightKg ?? ""}/></label>
          <label>MZFW kg<input name="maxZeroFuelWeightKg" type="number" min="0" defaultValue={profile?.maxZeroFuelWeightKg ?? ""}/></label>
          <label>MTOW kg<input name="maxTakeoffWeightKg" type="number" min="0" defaultValue={profile?.maxTakeoffWeightKg ?? item.mtowKg ?? ""}/></label>
          <label>MLW kg<input name="maxLandingWeightKg" type="number" min="0" defaultValue={profile?.maxLandingWeightKg ?? ""}/></label>
          <label>Max fuel kg<input name="maxFuelKg" type="number" min="0" defaultValue={profile?.maxFuelKg ?? ""}/></label>
          <label>Max payload kg<input name="maxPayloadKg" type="number" min="0" defaultValue={profile?.maxPayloadKg ?? ""}/></label>
          <label>Cost index<input name="defaultCostIndex" type="number" min="0" max="999" defaultValue={profile?.defaultCostIndex ?? ""}/></label>
          <label>Fuel bias %<input name="fuelBiasPercent" type="number" step="0.1" min="-10" max="15" defaultValue={profile?.fuelBiasPercent ?? 0}/></label>
          <label>Taxi fuel kg<input name="taxiFuelKg" type="number" min="0" defaultValue={profile?.taxiFuelKg ?? ""}/></label>
          <label><input name="locked" type="checkbox" value="yes" defaultChecked={profile?.locked}/> Lock automatic calibration</label>
          <label>Notes<input name="notes" defaultValue={profile?.notes ?? ""}/></label>
          <button className="button" type="submit">Apply to {members.length} aircraft</button>
        </form>
      </section>;
    })}
  </>;
}

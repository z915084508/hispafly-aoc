import { LiveOperations } from "@/components/live-operations/live-operations";
import { getLiveFlights } from "@/lib/acars/live-tracking";

export const dynamic = "force-dynamic";

export default async function PilotLiveFlightsPage() {
  return <LiveOperations initialFlights={await getLiveFlights()} apiPrefix="/api/pilot/live-flights" />;
}

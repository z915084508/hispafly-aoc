import { LiveOperations } from "@/components/live-operations/live-operations";
import { getLiveFlights } from "@/lib/acars/live-tracking";
export const dynamic = "force-dynamic";
export default async function Page() {
  return <LiveOperations initialFlights={await getLiveFlights()} />;
}

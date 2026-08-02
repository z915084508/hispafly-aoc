import { NextResponse } from "next/server";
import { requireStaffPermission } from "@/lib/staff/authorization";

const DATASET_URL = "https://raw.githubusercontent.com/mborsetti/airportsdata/main/airportsdata/airports.csv";

function parseCsvRow(line: string) {
  const values: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { value += '"'; index++; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { values.push(value); value = ""; }
    else value += character;
  }
  values.push(value);
  return values;
}

export async function GET(request: Request) {
  await requireStaffPermission("AIRPORT_CREATE", { entityType: "Airport", attemptedAction: "look up airport details" });
  const icao = new URL(request.url).searchParams.get("icao")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{4}$/.test(icao)) return NextResponse.json({ error: "A valid 4-letter ICAO code is required." }, { status: 400 });
  try {
    const response = await fetch(DATASET_URL, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error(`Airport dataset returned ${response.status}`);
    const csv = await response.text();
    const line = csv.split("\n").find((candidate) => candidate.startsWith(`"${icao}",`));
    if (!line) return NextResponse.json({ error: "Airport not found." }, { status: 404 });
    const [foundIcao, iata, name, city, subdivision, country, , latitude, longitude, timezone] = parseCsvRow(line.trim());
    const countryName = new Intl.DisplayNames(["en"], { type: "region" }).of(country) ?? country;
    return NextResponse.json({
      icao: foundIcao, iata, name, city, country: countryName, region: subdivision, timezone,
      latitude: latitude ? Number(latitude) : null, longitude: longitude ? Number(longitude) : null,
    });
  } catch {
    return NextResponse.json({ error: "Airport lookup is temporarily unavailable." }, { status: 503 });
  }
}

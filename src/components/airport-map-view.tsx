"use client";

import dynamic from "next/dynamic";
import type { AirportMapItem } from "./airport-map";

const AirportMap = dynamic(() => import("./airport-map"), { ssr: false, loading: () => <div className="fleet-map-loading"/> });
export function AirportMapView({ airports }: { airports: AirportMapItem[] }) {
  return <section className="card airport-map-card"><div className="card-header"><div><h2>Airport map</h2><p className="meta">{airports.length} airports with coordinates. Select a marker to open its record.</p></div></div><AirportMap airports={airports}/></section>;
}

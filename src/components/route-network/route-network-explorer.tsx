"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { RouteMapAirport, RouteMapRoute } from "./types";

const RouteNetworkMap = dynamic(() => import("./route-network-map"), { ssr: false, loading: () => <div className="fleet-map-loading"/> });

export function RouteNetworkExplorer({ airports, routes, initialAirport }: { airports: RouteMapAirport[]; routes: RouteMapRoute[]; initialAirport?: string | null }) {
  const [selected, setSelected] = useState(initialAirport && airports.some((airport) => airport.icao === initialAirport) ? initialAirport : null);
  const outbound = useMemo(() => selected ? routes.filter((route) => route.departure === selected) : [], [routes, selected]);
  return <div className="route-network-layout">
    <section className="card route-network-map-card"><div className="card-header"><div><h2>HISPAFLY route network</h2><p className="meta">Click an airport to display every active route departing from it.</p></div>{selected && <button className="action-button" onClick={() => setSelected(null)}>Show full network</button>}</div><RouteNetworkMap airports={airports} routes={routes} selected={selected} onSelect={setSelected}/></section>
    <aside className="card route-network-list"><h2>{selected ? `Routes from ${selected}` : "Select an airport"}</h2><p className="meta">{selected ? `${outbound.length} active outbound routes` : `${routes.length} active routes across ${airports.length} airports`}</p>{outbound.map((route) => <div className="route-network-row" key={route.id}><strong>{route.departure} → {route.arrival}</strong><span>{route.flightNumber ?? route.routeCode ?? "HISPAFLY"}{route.duration ? ` · ${route.duration} min` : ""}</span></div>)}</aside>
  </div>;
}

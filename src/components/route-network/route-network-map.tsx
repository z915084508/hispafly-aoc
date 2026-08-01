"use client";

import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { RouteMapAirport, RouteMapRoute } from "./types";

export default function RouteNetworkMap({ airports, routes, selected, onSelect }: { airports: RouteMapAirport[]; routes: RouteMapRoute[]; selected: string | null; onSelect: (icao: string) => void }) {
  const airportByIcao = new Map(airports.map((airport) => [airport.icao, airport]));
  const visible = selected ? routes.filter((route) => route.departure === selected) : routes;
  return <MapContainer className="route-network-map" center={[39.5, -3.5]} zoom={4} scrollWheelZoom>
    <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
    {visible.map((route) => {
      const departure = airportByIcao.get(route.departure), arrival = airportByIcao.get(route.arrival);
      if (!departure || !arrival) return null;
      return <Polyline key={route.id} positions={[[departure.latitude, departure.longitude], [arrival.latitude, arrival.longitude]]} pathOptions={{ color: selected ? "#d71920" : "#64748b", weight: selected ? 3 : 1.5, opacity: selected ? 0.9 : 0.35 }}><Tooltip>{route.departure} → {route.arrival}</Tooltip></Polyline>;
    })}
    {airports.map((airport) => <CircleMarker key={airport.id} center={[airport.latitude, airport.longitude]} radius={selected === airport.icao ? 9 : 6} pathOptions={{ color: selected === airport.icao ? "#d71920" : "#172234", fillColor: selected === airport.icao ? "#d71920" : "#ffffff", fillOpacity: 1, weight: 2 }} eventHandlers={{ click: () => onSelect(airport.icao) }}>
      <Tooltip direction="top">{airport.icao} · {airport.outboundCount} outbound</Tooltip>
      <Popup><strong>{airport.icao}</strong><br/>{airport.name ?? "HISPAFLY airport"}<br/>{airport.outboundCount} outbound routes</Popup>
    </CircleMarker>)}
  </MapContainer>;
}

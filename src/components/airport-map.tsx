"use client";

import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type AirportMapItem = { id: string; icao: string; iata: string | null; name: string | null; city: string | null; country: string | null; latitude: number; longitude: number; status: string };

export default function AirportMap({ airports }: { airports: AirportMapItem[] }) {
  return <MapContainer className="airport-management-map" center={[39.5, -3.5]} zoom={3} scrollWheelZoom>
    <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
    {airports.map((airport) => <CircleMarker key={airport.id} center={[airport.latitude, airport.longitude]} radius={6} pathOptions={{ color: airport.status === "ACTIVE" ? "#d71920" : "#64748b", fillColor: airport.status === "ACTIVE" ? "#d71920" : "#94a3b8", fillOpacity: .85, weight: 2 }}>
      <Tooltip direction="top">{airport.icao}{airport.iata ? ` / ${airport.iata}` : ""}</Tooltip>
      <Popup><strong>{airport.icao}{airport.iata ? ` / ${airport.iata}` : ""}</strong><br/>{airport.name ?? "HispaFly airport"}<br/>{[airport.city, airport.country].filter(Boolean).join(", ")}<br/><a href={`/staff/airports/${airport.id}`}>Open airport</a></Popup>
    </CircleMarker>)}
  </MapContainer>;
}

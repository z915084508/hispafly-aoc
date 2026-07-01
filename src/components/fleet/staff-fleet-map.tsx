"use client";

import { useEffect, useMemo } from "react";
import L, { type LatLngTuple } from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { AircraftLocationMapItem, FleetMapLabels } from "./types";

const STALE_MS = 72 * 60 * 60 * 1000;
const SPAIN_CENTER: LatLngTuple = [40.4168, -3.7038];

function isStale(item: AircraftLocationMapItem) { return Date.now() - new Date(item.updatedAt).getTime() > STALE_MS; }
function markerState(items: AircraftLocationMapItem[]) {
  if (items.some((item) => item.status === "UNKNOWN" || isStale(item))) return "danger";
  if (items.some((item) => item.status === "IN_FLIGHT")) return "flight";
  if (items.some((item) => item.status === "RESERVED")) return "reserved";
  if (items.some((item) => item.status === "MAINTENANCE")) return "maintenance";
  return "available";
}
function repositionUrl(item: AircraftLocationMapItem) {
  const query = new URLSearchParams({ type: "AIRCRAFT_REPOSITION", aircraftId: item.vamsysAircraftId, departure: item.currentAirportIcao ?? "", aircraftRegistration: item.registration ?? "", aircraftType: item.aircraftType ?? "" });
  return `/staff/flight-offers?${query}`;
}
function canReposition(item: AircraftLocationMapItem) { return item.status === "AVAILABLE" && Boolean(item.currentAirportIcao); }

function FitAircraftBounds({ positions }: { positions: LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length) map.fitBounds(positions, { padding: [40, 40], maxZoom: 8 });
    else map.setView(SPAIN_CENTER, 5);
  }, [map, positions]);
  return null;
}

export default function StaffFleetMap({ aircraft, labels, locale }: { aircraft: AircraftLocationMapItem[]; labels: FleetMapLabels; locale: string }) {
  const groups = useMemo(() => {
    const result = new Map<string, AircraftLocationMapItem[]>();
    for (const item of aircraft) {
      if (item.latitude === null || item.longitude === null || !item.currentAirportIcao) continue;
      result.set(item.currentAirportIcao, [...(result.get(item.currentAirportIcao) ?? []), item]);
    }
    return [...result.entries()];
  }, [aircraft]);
  const positions = useMemo<LatLngTuple[]>(() => groups.map(([, items]) => [items[0].latitude!, items[0].longitude!]), [groups]);

  if (!groups.length) return <div className="empty-state fleet-map-empty">{labels.empty}</div>;
  return <MapContainer className="staff-fleet-map" center={SPAIN_CENTER} zoom={5} scrollWheelZoom>
    <TileLayer url={process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"} attribution={process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? "© OpenStreetMap contributors"} maxZoom={18} />
    <FitAircraftBounds positions={positions} />
    {groups.map(([icao, items]) => {
      const position: LatLngTuple = [items[0].latitude!, items[0].longitude!];
      const icon = L.divIcon({ className: "fleet-marker-host", html: `<div class="fleet-marker fleet-marker-${markerState(items)}"><span>${icao}</span><strong>${items.length}</strong></div>`, iconSize: [64, 48], iconAnchor: [32, 24] });
      return <Marker key={icao} position={position} icon={icon}><Popup maxWidth={380}><div className="fleet-map-popup">
        <strong>{labels.aircraftAtAirport.replace("{airport}", icao).replace("{count}", String(items.length))}</strong>
        {items.map((item) => <div className="fleet-popup-aircraft" key={item.id}>
          <b>{item.registration ?? item.vamsysAircraftId} · {item.aircraftType ?? "—"}</b>
          <small>{labels.status}: {labels.statusValues[item.status]} · {labels.source}: {labels.sourceValues[item.source]}</small>
          <small>{labels.updatedAt}: {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.updatedAt))}</small>
          {item.lastBookingId && <small>{labels.lastBooking}: {item.lastBookingId}</small>}
          {item.lastVamsysPirepId && <small>{labels.lastPirep}: {item.lastVamsysPirepId}</small>}
          {isStale(item) && <span className="fleet-popup-warning">{labels.staleLocation}</span>}
          {item.source === "VAMSYS_EXTERNAL" && <span className="fleet-popup-warning">{labels.externalMovement}</span>}
          {canReposition(item)
            ? <a className="action-button approve" href={repositionUrl(item)}>{labels.createRepositionOffer}</a>
            : <button className="action-button" disabled title={labels.unavailable}>{labels.createRepositionOffer}</button>}
        </div>)}
      </div></Popup></Marker>;
    })}
  </MapContainer>;
}

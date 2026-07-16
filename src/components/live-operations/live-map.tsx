"use client";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { LiveFlight, TrackPoint } from "./types";
const icon=(status:string)=>L.divIcon({className:"live-marker-host",html:`<div class="live-marker live-${status.toLowerCase()}">✈</div>`,iconSize:[36,36],iconAnchor:[18,18]});
export default function LiveMap({flights,track}:{flights:LiveFlight[];track:TrackPoint[]}){
 const visible=flights.filter(x=>x.latitude!==null&&x.longitude!==null);
 return <MapContainer className="live-ops-map" center={[40.2,-3.7]} zoom={5} scrollWheelZoom>
  <TileLayer url={process.env.NEXT_PUBLIC_MAP_TILE_URL??"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"} attribution="© OpenStreetMap contributors"/>
  {track.length>1&&<Polyline positions={track.filter(x=>x.latitude!==null&&x.longitude!==null).map(x=>[x.latitude!,x.longitude!])} pathOptions={{color:"#d71920",weight:3}}/>}
  {visible.map(x=><Marker key={x.id} position={[x.latitude!,x.longitude!]} icon={icon(x.connectionStatus)}><Popup><strong>{x.flightNumber}</strong><br/>{x.departureIcao} → {x.arrivalIcao}<br/>{x.phase} · {x.altitudeFeet?.toFixed(0)??"—"} ft</Popup></Marker>)}
 </MapContainer>;
}

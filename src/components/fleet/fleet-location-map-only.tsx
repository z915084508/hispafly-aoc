"use client";
import dynamic from "next/dynamic";
import type { AircraftLocationMapItem, FleetMapLabels } from "./types";
const Map=dynamic(()=>import("./staff-fleet-map"),{ssr:false,loading:()=> <div className="fleet-map-loading"/>});
export function FleetLocationMapOnly({aircraft,labels,locale,title}:{aircraft:AircraftLocationMapItem[];labels:FleetMapLabels;locale:string;title:string}){return <section className="card fleet-map-card"><div className="card-header"><h2>{title}</h2><span className="meta">© OpenStreetMap contributors</span></div><Map aircraft={aircraft} labels={labels} locale={locale}/></section>}

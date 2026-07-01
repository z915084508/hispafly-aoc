"use client";

import dynamic from "next/dynamic";
import type { AircraftLocationMapItem, FleetMapLabels } from "./types";

const FleetMap = dynamic(() => import("./staff-fleet-map"), { ssr: false, loading: () => <div className="fleet-map-loading" /> });

export function PilotFleetMapView({ aircraft, labels, locale, title }: { aircraft: AircraftLocationMapItem[]; labels: FleetMapLabels; locale: string; title: string }) {
  return <section className="card fleet-map-card"><div className="card-header"><h2 className="card-title">{title}</h2><span className="meta">© OpenStreetMap contributors</span></div><FleetMap aircraft={aircraft} labels={labels} locale={locale} allowReposition={false} /></section>;
}

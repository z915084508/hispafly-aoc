"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./airport-route-catalog.module.css";

type RouteLeg = {
  id: string;
  flightNumber: string | null;
  routeCode: string | null;
  departure: string;
  arrival: string;
  fleet: string;
  scheduleCount: number;
  direction: "SALIDA" | "LLEGADA";
  target: string;
};

type RoutePair = { key: string; airports: string[]; legs: RouteLeg[]; scheduleCount: number; complete: boolean };

export function AirportRouteCatalog({ routes, canCreate }: { routes: RouteLeg[]; canCreate: boolean }) {
  const [search, setSearch] = useState("");
  const [coverage, setCoverage] = useState("ALL");
  const [sort, setSort] = useState("AIRPORT_ASC");

  const pairs = useMemo(() => groupRoutePairs(routes), [routes]);
  const visiblePairs = useMemo(() => {
    const term = search.trim().toLocaleUpperCase();
    return pairs
      .filter((pair) => coverage === "ALL" || (coverage === "COMPLETE" ? pair.complete : !pair.complete))
      .filter((pair) => !term || [...pair.airports, ...pair.legs.flatMap((leg) => [leg.flightNumber, leg.routeCode, leg.fleet])].some((value) => value?.toLocaleUpperCase().includes(term)))
      .sort((left, right) => {
        if (sort === "SCHEDULED_FIRST") return right.scheduleCount - left.scheduleCount || left.key.localeCompare(right.key);
        if (sort === "UNSCHEDULED_FIRST") return left.scheduleCount - right.scheduleCount || left.key.localeCompare(right.key);
        if (sort === "FLIGHT_ASC") return routeIdentity(left.legs[0]).localeCompare(routeIdentity(right.legs[0]), undefined, { numeric: true });
        return left.key.localeCompare(right.key);
      });
  }, [coverage, pairs, search, sort]);

  return <>
    <div className={styles.toolbar}>
      <label>Buscar ruta
        <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Vuelo, ICAO, código o flota…" aria-label="Buscar en la red de rutas"/>
      </label>
      <label>Cobertura
        <select value={coverage} onChange={(event) => setCoverage(event.target.value)}>
          <option value="ALL">Todas las rutas</option>
          <option value="COMPLETE">Ida y vuelta completas</option>
          <option value="INCOMPLETE">Falta un sentido</option>
        </select>
      </label>
      <label>Ordenar por
        <select value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="AIRPORT_ASC">Aeropuerto conectado</option>
          <option value="FLIGHT_ASC">Número de vuelo</option>
          <option value="UNSCHEDULED_FIRST">Sin programación primero</option>
          <option value="SCHEDULED_FIRST">Con programación primero</option>
        </select>
      </label>
    </div>
    <div className={styles.resultCount}>{visiblePairs.length} de {pairs.length} rutas de ida y vuelta · {routes.length} tramos</div>
    {!visiblePairs.length ? <div className="airport-board-empty">No hay rutas que coincidan con la búsqueda y los filtros.</div> : <div className="airport-movement-list">{visiblePairs.map((pair) => <article className="airport-movement-card" key={pair.key}>
      <div className="airport-movement-head"><strong>{pair.airports.join(" ⇄ ")}</strong><span className={`airport-schedule-status ${pair.complete ? "active" : "draft"}`}>{pair.complete ? "IDA Y VUELTA" : "INCOMPLETA"}</span></div>
      <div className={styles.legs}>{pair.legs.map((leg) => <div className={styles.leg} key={leg.id}>
        <div><strong>{routeIdentity(leg)}</strong><span>{leg.direction}</span></div>
        <div className="airport-movement-route"><strong>{leg.departure}</strong><span>→</span><strong>{leg.arrival}</strong></div>
        <div className="airport-movement-meta"><div><span>Flota propuesta</span><strong>{leg.fleet}</strong></div><div><span>PROGRAMACIÓN actual</span><strong>{leg.scheduleCount || "NINGUNA"}</strong></div></div>
        {canCreate && <div className="airport-movement-actions"><Link className="button" href={leg.target}>PROGRAMAR ESTE TRAMO →</Link></div>}
      </div>)}</div>
      {!pair.complete && <div className={styles.missing}>Falta configurar el tramo inverso de esta conexión.</div>}
    </article>)}</div>}
  </>;
}

function groupRoutePairs(routes: RouteLeg[]): RoutePair[] {
  const pairs = new Map<string, RoutePair>();
  for (const route of routes) {
    const airports = [route.departure, route.arrival].sort();
    const key = airports.join("-");
    const pair = pairs.get(key) ?? { key, airports, legs: [], scheduleCount: 0, complete: false };
    pair.legs.push(route);
    pair.scheduleCount += route.scheduleCount;
    pair.complete = pair.legs.some((leg) => leg.departure === airports[0]) && pair.legs.some((leg) => leg.departure === airports[1]);
    pairs.set(key, pair);
  }
  return [...pairs.values()].map((pair) => ({ ...pair, legs: pair.legs.sort((left, right) => left.direction === "SALIDA" ? -1 : right.direction === "SALIDA" ? 1 : routeIdentity(left).localeCompare(routeIdentity(right))) }));
}

function routeIdentity(route: Pick<RouteLeg, "flightNumber" | "routeCode">) {
  return route.flightNumber ?? route.routeCode ?? "Sin número";
}

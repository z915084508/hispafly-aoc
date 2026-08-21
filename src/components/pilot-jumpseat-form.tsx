"use client";

import { useMemo, useState } from "react";
import { purchaseJumpseatAction } from "@/app/pilot/flight-offers/self-dispatch/actions";
import styles from "./pilot-jumpseat-form.module.css";

type Airport = {
  id: string;
  icao: string;
  name: string | null;
  distanceKm: number;
  costCents: number;
};

const money = (cents: number) => `EUR ${(cents / 100).toFixed(2)}`;

export function PilotJumpseatForm({
  currentIcao,
  airports,
  balanceCents,
}: {
  currentIcao: string;
  airports: Airport[];
  balanceCents: number;
}) {
  const [open, setOpen] = useState(false);
  const [airportId, setAirportId] = useState("");
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);

  const selected = useMemo(
    () => airports.find((item) => item.id === airportId),
    [airports, airportId],
  );

  const filteredAirports = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return airports.slice(0, 12);
    return airports
      .filter((airport) =>
        `${airport.icao} ${airport.name ?? ""}`.toLocaleLowerCase().includes(normalized),
      )
      .slice(0, 12);
  }, [airports, query]);

  const chooseAirport = (airport: Airport) => {
    setAirportId(airport.id);
    setQuery(`${airport.icao} · ${airport.name ?? "Unnamed"}`);
    setShowResults(false);
  };

  const togglePanel = () => {
    setOpen((value) => !value);
    setShowResults(false);
  };

  return (
    <section className={`card ${styles.panel}`}>
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          <h2>Need to depart elsewhere?</h2>
          <p>
            Use Jumpseat to move your crew position. The distance-based fare is deducted from your wallet before the operation is created.
          </p>
        </div>
        <button type="button" className={`button secondary ${styles.toggle}`} onClick={togglePanel}>
          {open ? "Close" : "Book Jumpseat"}
        </button>
      </div>

      {open && (
        <form action={purchaseJumpseatAction} className={styles.form}>
          <input type="hidden" name="fromIcao" value={currentIcao} />
          <input type="hidden" name="arrivalAirportId" value={airportId} />

          <div className={styles.selector}>
            <label className={styles.selectorLabel} htmlFor="jumpseat-airport-search">
              Destination airport
            </label>
            <input
              id="jumpseat-airport-search"
              className={styles.searchInput}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setAirportId("");
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              placeholder="Search by ICAO or airport name"
              autoComplete="off"
              role="combobox"
              aria-expanded={showResults}
              aria-controls="jumpseat-airport-results"
            />
            <span className={styles.chevron} aria-hidden="true">⌄</span>

            {showResults && (
              <div className={styles.results} id="jumpseat-airport-results" role="listbox">
                {filteredAirports.length ? (
                  filteredAirports.map((airport) => (
                    <button
                      type="button"
                      className={styles.resultButton}
                      key={airport.id}
                      onClick={() => chooseAirport(airport)}
                      role="option"
                      aria-selected={airport.id === airportId}
                    >
                      <span className={styles.airportIdentity}>
                        <strong>{airport.icao}</strong>
                        <span>{airport.name ?? "Unnamed airport"}</span>
                      </span>
                      <span className={styles.fare}>
                        <strong>{money(airport.costCents)}</strong>
                        <span>{airport.distanceKm} km</span>
                      </span>
                    </button>
                  ))
                ) : (
                  <div className={styles.emptyResults}>No matching airport found.</div>
                )}
              </div>
            )}
          </div>

          <div className={styles.summary}>
            <span>Jumpseat fare</span>
            <strong>{selected ? money(selected.costCents) : "—"}</strong>
            <small className={selected && selected.costCents > balanceCents ? styles.insufficient : undefined}>
              Wallet balance: {money(balanceCents)}
              {selected && selected.costCents > balanceCents ? " · Insufficient balance" : ""}
            </small>
          </div>

          <button
            className={`button ${styles.submit}`}
            disabled={!selected || selected.costCents > balanceCents}
          >
            Confirm Jumpseat
          </button>
        </form>
      )}
    </section>
  );
}

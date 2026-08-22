type OperationalEvent = {
  id: string; eventType: string; severity: string; timestamp: Date; flightPhase: string | null;
  altitudeFeet: number | null; groundSpeedKnots: number | null; metadata: unknown;
};

const number = (value: number | null, suffix: string) => value == null ? null : `${Math.round(value)} ${suffix}`;

export function OperationalEventsTimeline({ events }: { events: OperationalEvent[] }) {
  if (!events.length) return <p className="meta">No structured operational events were recorded for this flight.</p>;
  return <div className="operational-events-timeline">
    {events.map((event) => {
      const detail = [number(event.groundSpeedKnots, "kt"), number(event.altitudeFeet, "ft"), event.flightPhase].filter(Boolean).join(" · ");
      return <article className={`operational-event operational-event-${event.severity.toLowerCase()}`} key={event.id}>
        <time>{new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(event.timestamp)}</time>
        <strong>{event.eventType.replaceAll("_", " ")}</strong>
        <span>{detail || event.severity}</span>
      </article>;
    })}
  </div>;
}

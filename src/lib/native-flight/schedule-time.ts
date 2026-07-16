export type LocalDate = { year: number; month: number; day: number };

export type LocalDateTimeResolution =
  | { ok: true; instant: Date }
  | { ok: false; code: "INVALID_TIMEZONE" | "NONEXISTENT_LOCAL_TIME" | "AMBIGUOUS_LOCAL_TIME"; message: string };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let value = formatterCache.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, value);
  }
  return value;
}

function partsAt(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

export function isValidTimeZone(timeZone: string) {
  try {
    formatter(timeZone).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveLocalDateTime(
  date: LocalDate,
  minutesAfterMidnight: number,
  timeZone: string,
): LocalDateTimeResolution {
  if (!isValidTimeZone(timeZone)) {
    return { ok: false, code: "INVALID_TIMEZONE", message: `Unknown IANA time zone: ${timeZone}` };
  }

  const hour = Math.floor(minutesAfterMidnight / 60);
  const minute = minutesAfterMidnight % 60;
  const naiveUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  const offsets = new Set<number>();

  for (const deltaHours of [-36, -24, -12, 0, 12, 24, 36]) {
    const sample = new Date(naiveUtc + deltaHours * 3_600_000);
    const local = partsAt(sample, timeZone);
    offsets.add(Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) - sample.getTime());
  }

  const matches = [...offsets]
    .map((offset) => new Date(naiveUtc - offset))
    .filter((instant) => {
      const local = partsAt(instant, timeZone);
      return (
        local.year === date.year &&
        local.month === date.month &&
        local.day === date.day &&
        local.hour === hour &&
        local.minute === minute
      );
    })
    .filter((instant, index, all) => all.findIndex((candidate) => candidate.getTime() === instant.getTime()) === index)
    .sort((a, b) => a.getTime() - b.getTime());

  if (matches.length === 0) {
    return {
      ok: false,
      code: "NONEXISTENT_LOCAL_TIME",
      message: `Local time does not exist because of a time-zone transition in ${timeZone}.`,
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      code: "AMBIGUOUS_LOCAL_TIME",
      message: `Local time occurs twice because of a time-zone transition in ${timeZone}.`,
    };
  }
  return { ok: true, instant: matches[0] };
}

export function parseIsoDate(value: string): LocalDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const check = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return check.getUTCFullYear() === date.year && check.getUTCMonth() + 1 === date.month && check.getUTCDate() === date.day
    ? date
    : null;
}

export function formatIsoDate(date: LocalDate) {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export function addLocalDays(date: LocalDate, days: number): LocalDate {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

export function localWeekday(date: LocalDate) {
  const sundayBased = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return sundayBased === 0 ? 7 : sundayBased;
}

export function formatMinutes(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

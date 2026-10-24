// Event-date parsing for scraped items (PLAN.md §5 "Dates"). Pure T1: the reference date is
// always the run's fetchedAt, never the wall clock, so a rebuild parses identically.
import type { EventDate, ISODate } from "@ftb/types";

export type Window = { since: ISODate; until: ISODate };

const UNKNOWN: EventDate = { basis: "unknown", precision: "day" };

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function iso(y: number, m: number, d: number): ISODate {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDays(date: ISODate, days: number): ISODate {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Exact platform timestamp ("2026-10-03T14:02:11.000Z") → published, day precision. */
export function fromTimestamp(ts: string | undefined): EventDate {
  if (!ts) return UNKNOWN;
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return UNKNOWN;
  return { date: new Date(t).toISOString().slice(0, 10), basis: "published", precision: "day" };
}

/**
 * Search-result date strings as SerpApi returns them: "Oct 3, 2026", "3 days ago",
 * "2 weeks ago". Relative dates are resolved against fetchedAt and keep a coarser precision.
 * Anything unrecognized is "unknown", never fetchedAt.
 */
export function fromSearchDate(raw: string | undefined, fetchedAt: ISODate): EventDate {
  if (!raw) return UNKNOWN;
  const s = raw.trim().toLowerCase();

  const abs = /^([a-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})$/.exec(s);
  if (abs) {
    const m = MONTHS[abs[1]!];
    if (m)
      return { date: iso(Number(abs[3]), m, Number(abs[2])), basis: "published", precision: "day" };
  }

  const rel = /^(\d+|an?) (minute|hour|day|week|month|year)s? ago$/.exec(s);
  if (rel) {
    const n = rel[1] === "a" || rel[1] === "an" ? 1 : Number(rel[1]);
    const unit = rel[2]!;
    const days = { minute: 0, hour: 0, day: n, week: 7 * n, month: 30 * n, year: 365 * n }[unit]!;
    const precision: EventDate["precision"] =
      unit === "minute" || unit === "hour" || unit === "day"
        ? "day"
        : unit === "week"
          ? "week"
          : unit === "month"
            ? "month"
            : "year";
    // "5 hours ago" may still be the previous day in the source's timezone; day precision is
    // the best we can claim.
    return { date: addDays(fetchedAt, -days), basis: "published", precision };
  }

  return UNKNOWN;
}

/** Undated items are kept (labeled unknown); dated items outside the window are dropped. */
export function inWindow(d: EventDate, w: Window): boolean {
  if (!d.date) return true;
  return d.date >= w.since && d.date <= w.until;
}

/** Google `tbs` custom date range, e.g. "cdr:1,cd_min:11/8/2025,cd_max:11/3/2026". */
export function googleDateRange(w: Window): string {
  const us = (d: ISODate) => {
    const [y, m, day] = d.split("-").map(Number);
    return `${m}/${day}/${y}`;
  };
  return `cdr:1,cd_min:${us(w.since)},cd_max:${us(w.until)}`;
}

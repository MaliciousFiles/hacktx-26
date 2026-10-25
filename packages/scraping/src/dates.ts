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
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^(?:streamed|premiered|published|posted|updated|last updated|live)\s+(?:on\s+)?/, "");

  const validDay = (y: number, m: number | undefined, d: number): ISODate | undefined => {
    if (!m) return undefined;
    const date = iso(y, m, d);
    return !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
      ? date
      : undefined;
  };
  // "Oct 3, 2026", "October 3 2026", "Oct. 3rd, 2026"
  const abs = /^([a-z]{3})[a-z]*\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/.exec(s);
  // "3 Oct 2026"
  const dmy = /^(\d{1,2}) ([a-z]{3})[a-z]*\.?,? (\d{4})$/.exec(s);
  const absDate = abs
    ? validDay(Number(abs[3]), MONTHS[abs[1]!], Number(abs[2]))
    : dmy
      ? validDay(Number(dmy[3]), MONTHS[dmy[2]!], Number(dmy[1]))
      : /^(\d{4})-(\d{2})-(\d{2})$/.test(s)
        ? validDay(Number(s.slice(0, 4)), Number(s.slice(5, 7)), Number(s.slice(8, 10)))
        : undefined;
  if (absDate) return { date: absDate, basis: "published", precision: "day" };

  // "3 weeks ago", "an hour ago", and YouTube's compact "3w ago" / "10d ago" / "2y ago" / "4mo ago"
  const rel =
    /^(?:(\d+) ?|an? )(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mos?|years?|yrs?|[smhdwy]) ago$/.exec(
      s,
    );
  if (rel) {
    const n = rel[1] ? Number(rel[1]) : 1;
    const token = rel[2]!;
    const unit = /^(s|sec)/.test(token)
      ? "minute"
      : /^mo/.test(token)
        ? "month"
        : /^m/.test(token)
          ? "minute"
          : /^h/.test(token)
            ? "hour"
            : /^d/.test(token)
              ? "day"
              : /^w/.test(token)
                ? "week"
                : "year";
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

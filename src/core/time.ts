import type { ISODate } from "./domain/types";

/** UAE does not observe DST; Gulf Standard Time is always UTC+4. */
export const UAE_OFFSET = "+04:00";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/**
 * Parse an ISO date. Date-only values are interpreted in UAE time; when used as
 * an *end* boundary they cover the whole day (an offer "ending 31 Oct" is valid
 * until 23:59:59 on 31 Oct in Dubai).
 */
export function parseDate(value: ISODate, boundary: "start" | "end" = "start"): Date {
  if (DATE_ONLY.test(value)) {
    return new Date(
      boundary === "start" ? `${value}T00:00:00${UAE_OFFSET}` : `${value}T23:59:59.999${UAE_OFFSET}`,
    );
  }
  return new Date(value);
}

export function toISODate(date: Date): ISODate {
  return date.toISOString();
}

/** Calendar date (YYYY-MM-DD) in UAE time. */
export function uaeDateOnly(date: Date): ISODate {
  const shifted = new Date(date.getTime() + 4 * 3_600_000);
  return shifted.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

export function daysSince(value: ISODate | undefined, now: Date): number | undefined {
  if (!value) return undefined;
  return daysBetween(parseDate(value), now);
}

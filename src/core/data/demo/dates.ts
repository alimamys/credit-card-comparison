import { addDays, uaeDateOnly } from "../../time";

/**
 * Demo data is generated relative to a reference date so the demonstration
 * always has active, upcoming, expiring and expired offers. Real data from
 * providers uses absolute dates.
 */
export interface DemoDates {
  reference: Date;
  /** Calendar date `n` days after the reference (UAE time), e.g. "2026-10-31". */
  in(n: number): string;
  /** Calendar date `n` days before the reference. */
  ago(n: number): string;
}

export function demoDates(reference: Date): DemoDates {
  return {
    reference,
    in: (n) => uaeDateOnly(addDays(reference, n)),
    ago: (n) => uaeDateOnly(addDays(reference, -n)),
  };
}

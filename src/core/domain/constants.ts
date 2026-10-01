import type { RewardCurrency } from "./types";

/** Reward currency id for plain AED cashback / statement credits. */
export const CASH_CURRENCY_ID = "aed_cash";

/** Built-in cash currency; always valued at exactly AED 1 per unit. */
export const CASH_CURRENCY: RewardCurrency = {
  id: CASH_CURRENCY_ID,
  name: "Cashback (AED)",
  shortName: "AED",
  type: "cash",
  unitSingular: "AED",
  unitPlural: "AED",
  badge: "CASHBACK",
  rounding: "cents",
  dataStatus: "verified",
  valuation: {
    currencyId: CASH_CURRENCY_ID,
    aedValuePerUnit: 1,
    valuationMethod: "fixed_redemption",
    lowEstimate: 1,
    highEstimate: 1,
    lastUpdatedAt: "2026-01-01",
    confidence: "high",
    notes: "Cashback is credited in AED at face value.",
    dataStatus: "verified",
  },
};

/** Ordered from most to least trustworthy; used to aggregate freshness. */
export const DATA_STATUS_ORDER = ["live", "verified", "cached", "estimated", "demo", "expired"] as const;

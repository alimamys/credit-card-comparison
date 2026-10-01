import { CASH_CURRENCY } from "../src/core/domain/constants";
import type { Card, CardOffer, RewardCurrency, Transaction } from "../src/core/domain/types";
import { ValuationEngine } from "../src/core/engines/valuationEngine";

export const NOW = new Date("2026-10-01T10:00:00+04:00");

export const etihad: RewardCurrency = {
  id: "etihad",
  name: "Etihad Guest Miles",
  shortName: "Etihad Guest",
  type: "airline_miles",
  unitSingular: "Mile",
  unitPlural: "Miles",
  badge: "ETIHAD MILES",
  rounding: "round",
  dataStatus: "demo",
  valuation: {
    currencyId: "etihad",
    aedValuePerUnit: 0.035,
    lowEstimate: 0.025,
    highEstimate: 0.045,
    valuationMethod: "market_estimate",
    lastUpdatedAt: "2026-09-01",
    confidence: "medium",
    dataStatus: "demo",
  },
};

export const skywards: RewardCurrency = {
  ...etihad,
  id: "skywards",
  name: "Emirates Skywards Miles",
  badge: "SKYWARDS MILES",
  valuation: { ...etihad.valuation, currencyId: "skywards", aedValuePerUnit: 0.045, lowEstimate: 0.03, highEstimate: 0.06 },
};

export const points: RewardCurrency = {
  ...etihad,
  id: "pts",
  name: "Bank Points",
  type: "bank_points",
  unitSingular: "Point",
  unitPlural: "Points",
  badge: "REWARD POINTS",
  valuation: { ...etihad.valuation, currencyId: "pts", aedValuePerUnit: 0.01, lowEstimate: 0.01, highEstimate: 0.01, valuationMethod: "fixed_redemption", confidence: "high" },
};

export const currencies = [CASH_CURRENCY, etihad, skywards, points];
export const valuations = new ValuationEngine(currencies);

export function card(partial: Partial<Card> & Pick<Card, "id" | "rewardCurrencyId" | "earnRules">): Card {
  return {
    bankId: "bank_a",
    name: partial.id,
    network: "Visa",
    networkTier: "Visa Signature",
    dataStatus: "demo",
    design: { from: "#000", to: "#111" },
    ...partial,
  };
}

export function offer(partial: Partial<CardOffer> & Pick<CardOffer, "id" | "offerType">): CardOffer {
  return {
    title: partial.id,
    startDate: "2026-09-01",
    endDate: "2026-10-31",
    stackingRule: "stack",
    publisher: "Test Bank",
    sourceType: "bank",
    sourceUrl: "https://example.test/offer",
    lastVerifiedAt: "2026-09-30",
    status: "active",
    dataStatus: "demo",
    ...partial,
  };
}

export function tx(partial: Partial<Transaction> = {}): Transaction {
  return { amount: 200, currency: "AED", category: "other", region: "domestic", date: NOW.toISOString(), ...partial };
}

import type { ResultConfidence, RewardCurrency, RewardValuation } from "../domain/types";
import { CASH_CURRENCY, CASH_CURRENCY_ID } from "../domain/constants";
import { round2 } from "../format";

/**
 * Valuation engine: converts any reward currency into a comparable AED value.
 *
 * Miles and points do not have a guaranteed cash value. Every valuation
 * therefore carries a method, a confidence level and (where known) a low/high
 * range. User-defined valuations override defaults for personalised ranking.
 */

export interface ResolvedValuation {
  currency: RewardCurrency;
  aedValuePerUnit: number;
  low: number;
  high: number;
  method: RewardValuation["valuationMethod"];
  confidence: RewardValuation["confidence"];
  isUserDefined: boolean;
  defaultAedValuePerUnit: number;
  /** "exact" only for cash-equivalent currencies with a fixed 1:1 value. */
  resultConfidence: ResultConfidence;
  lastUpdatedAt: string;
}

export interface ValuedQuantity {
  quantity: number;
  aed: number;
  low: number;
  high: number;
  valuation?: ResolvedValuation;
  missing: boolean;
}

export class ValuationEngine {
  private readonly currencies: Map<string, RewardCurrency>;

  constructor(
    currencies: RewardCurrency[],
    private readonly overrides: Record<string, number> = {},
  ) {
    this.currencies = new Map(currencies.map((c) => [c.id, c]));
    if (!this.currencies.has(CASH_CURRENCY_ID)) this.currencies.set(CASH_CURRENCY_ID, CASH_CURRENCY);
  }

  withOverrides(overrides: Record<string, number>): ValuationEngine {
    return new ValuationEngine([...this.currencies.values()], overrides);
  }

  getCurrency(id: string): RewardCurrency | undefined {
    return this.currencies.get(id);
  }

  resolve(currencyId: string): ResolvedValuation | undefined {
    const currency = this.currencies.get(currencyId);
    if (!currency) return undefined;
    const v = currency.valuation;
    const override = this.overrides[currencyId];
    if (override !== undefined && Number.isFinite(override) && override >= 0 && currency.type !== "cash") {
      return {
        currency,
        aedValuePerUnit: override,
        low: override,
        high: override,
        method: "user_defined",
        confidence: "high",
        isUserDefined: true,
        defaultAedValuePerUnit: v.aedValuePerUnit,
        resultConfidence: "estimated",
        lastUpdatedAt: v.lastUpdatedAt,
      };
    }
    const isCash = currency.type === "cash" && v.valuationMethod === "fixed_redemption";
    return {
      currency,
      aedValuePerUnit: v.aedValuePerUnit,
      low: v.lowEstimate ?? v.aedValuePerUnit,
      high: v.highEstimate ?? v.aedValuePerUnit,
      method: v.valuationMethod,
      confidence: v.confidence,
      isUserDefined: false,
      defaultAedValuePerUnit: v.aedValuePerUnit,
      resultConfidence: isCash ? "exact" : "estimated",
      lastUpdatedAt: v.lastUpdatedAt,
    };
  }

  /** Value a quantity of reward units. Never invents a value: unknown currencies are worth 0 and flagged. */
  value(quantity: number, currencyId: string): ValuedQuantity {
    const valuation = this.resolve(currencyId);
    if (!valuation) return { quantity, aed: 0, low: 0, high: 0, missing: true };
    return {
      quantity,
      aed: quantity * valuation.aedValuePerUnit,
      low: quantity * valuation.low,
      high: quantity * valuation.high,
      valuation,
      missing: false,
    };
  }
}

/** Round earned units according to the currency's rules. */
export function roundUnits(quantity: number, currency: RewardCurrency | undefined): number {
  if (!currency) return quantity;
  switch (currency.rounding) {
    case "cents":
      return round2(quantity);
    case "floor":
      return Math.floor(quantity + 1e-9);
    case "round":
    default:
      return Math.round(quantity);
  }
}

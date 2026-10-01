import type { Dataset, RewardCurrency } from "../domain/types";
import { ValuationEngine } from "../engines/valuationEngine";

/** Builds valuation engines that honour the user's personal overrides. */
export class ValuationService {
  private readonly base: ValuationEngine;
  private lastOverridesKey?: string;
  private lastEngine?: ValuationEngine;

  constructor(private readonly currencies: RewardCurrency[]) {
    this.base = new ValuationEngine(currencies);
  }

  static from(dataset: Pick<Dataset, "rewardCurrencies">): ValuationService {
    return new ValuationService(dataset.rewardCurrencies);
  }

  all(): RewardCurrency[] {
    return this.currencies;
  }

  get(id: string): RewardCurrency | undefined {
    return this.base.getCurrency(id);
  }

  engine(overrides: Record<string, number> = {}): ValuationEngine {
    const key = JSON.stringify(overrides);
    if (key === "{}") return this.base;
    if (key !== this.lastOverridesKey || !this.lastEngine) {
      this.lastEngine = this.base.withOverrides(overrides);
      this.lastOverridesKey = key;
    }
    return this.lastEngine;
  }
}

import type { Dataset } from "../../domain/types";
import { demoBanks } from "./banks";
import { demoCards } from "./cards";
import { demoCurrencies } from "./currencies";
import { demoDates } from "./dates";
import { demoMccs, demoMerchants } from "./merchants";
import { demoOffers } from "./offers";

export { SAMPLE_WALLET } from "./cards";

export const DEMO_DATASET_VERSION = "demo-2026.10";

/**
 * Build the bundled demonstration dataset. Every card, bank and offer in it is
 * FICTIONAL and marked `dataStatus: "demo"`. Dates are relative to `reference`
 * so the demo always contains active, upcoming and expired offers.
 */
export function createDemoDataset(reference: Date = new Date()): Dataset {
  const d = demoDates(reference);
  return {
    version: DEMO_DATASET_VERSION,
    generatedAt: reference.toISOString(),
    dataStatus: "demo",
    banks: demoBanks(d),
    cards: demoCards(d),
    rewardCurrencies: demoCurrencies(d),
    merchants: demoMerchants(d),
    mccs: demoMccs(d),
    offers: demoOffers(d),
  };
}

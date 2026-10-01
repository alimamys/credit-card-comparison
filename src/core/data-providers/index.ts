export * from "./types";
export * from "./bankProvider";
export * from "./merchantOffersProvider";
export * from "./cardNetworkOffersProvider";
export * from "./loyaltyValuationProvider";
export * from "./htmlPageProvider";

import { createDemoBankProvider } from "./bankProvider";
import { createDemoNetworkOffersProvider } from "./cardNetworkOffersProvider";
import { createDemoValuationProvider } from "./loyaltyValuationProvider";
import { createDemoOffersProvider } from "./merchantOffersProvider";
import type { DataProvider } from "./types";

export function demoProviders(): DataProvider[] {
  // Order matters: currencies before the cards that reference them, cards before offers.
  return [createDemoValuationProvider(), createDemoBankProvider(), createDemoOffersProvider(), createDemoNetworkOffersProvider()];
}

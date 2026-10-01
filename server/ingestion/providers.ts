import { demoProviders, createHttpOffersProvider, createHttpBankProvider, createHttpValuationProvider, type DataProvider } from "../../src/core/data-providers";

/**
 * Provider registry. Demo providers are enabled by default. Real feeds are
 * enabled by environment variables (see README → "Connecting live data").
 */
export function configuredProviders(env = process.env): DataProvider[] {
  const providers: DataProvider[] = env.TAPWISE_DISABLE_DEMO === "1" ? [] : demoProviders();
  if (env.TAPWISE_BANK_FEED_URL) {
    providers.push(createHttpBankProvider({ id: "bank-feed", name: "Bank product feed", url: env.TAPWISE_BANK_FEED_URL, publisher: env.TAPWISE_BANK_FEED_PUBLISHER ?? "Bank feed" }));
  }
  if (env.TAPWISE_OFFERS_FEED_URL) {
    providers.push(createHttpOffersProvider({ id: "offers-feed", name: "Offers feed", url: env.TAPWISE_OFFERS_FEED_URL, publisher: env.TAPWISE_OFFERS_FEED_PUBLISHER ?? "Offers feed" }));
  }
  if (env.TAPWISE_VALUATIONS_FEED_URL) {
    providers.push(createHttpValuationProvider({ id: "valuations-feed", name: "Valuations feed", url: env.TAPWISE_VALUATIONS_FEED_URL, publisher: env.TAPWISE_VALUATIONS_FEED_PUBLISHER ?? "Valuations feed" }));
  }
  return providers;
}

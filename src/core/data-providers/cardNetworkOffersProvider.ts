import { demoDates } from "../data/demo/dates";
import { demoOffers } from "../data/demo/offers";
import type { CardOffer } from "../domain/types";
import { fetchJson, sourceFor, stamp } from "./httpJson";
import { type DataProvider, REFRESH_POLICIES } from "./types";

/** Visa / Mastercard / Amex offer portals (via a partner API or an approved feed). */

export function createDemoNetworkOffersProvider(): DataProvider {
  return {
    id: "demo-network-offers",
    name: "Demo network offers (fictional)",
    kind: "cardNetworkOffers",
    refreshPolicy: REFRESH_POLICIES.cardNetworkOffers,
    async fetch({ now }) {
      return {
        providerId: "demo-network-offers",
        fetchedAt: now.toISOString(),
        source: { url: "demo://network-offers", publisher: "Demo dataset", retrievedAt: now.toISOString() },
        offers: demoOffers(demoDates(now)).filter((o) => o.sourceType === "network"),
        errors: [],
      };
    },
  };
}

export function createHttpNetworkOffersProvider(opts: { id: string; name: string; url: string; network: "Visa" | "Mastercard" | "Amex"; headers?: Record<string, string> }): DataProvider {
  return {
    id: opts.id,
    name: opts.name,
    kind: "cardNetworkOffers",
    refreshPolicy: REFRESH_POLICIES.cardNetworkOffers,
    async fetch(ctx) {
      const source = sourceFor(opts.url, `${opts.network} offers`, ctx.now);
      try {
        const body = (await fetchJson(ctx, opts.url, opts.headers)) as { offers?: CardOffer[] };
        const offers = stamp(body.offers, source, ctx.now).map((o) => ({ ...o, network: o.network ?? opts.network, sourceType: "network" as const }));
        return { providerId: opts.id, fetchedAt: ctx.now.toISOString(), source, offers, errors: [] };
      } catch (e) {
        return { providerId: opts.id, fetchedAt: ctx.now.toISOString(), source, errors: [(e as Error).message] };
      }
    },
  };
}

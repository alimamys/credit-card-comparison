import { demoDates } from "../data/demo/dates";
import { demoMccs, demoMerchants } from "../data/demo/merchants";
import { demoOffers } from "../data/demo/offers";
import type { CardOffer, Merchant } from "../domain/types";
import { fetchJson, sourceFor, stamp } from "./httpJson";
import { type DataProvider, REFRESH_POLICIES } from "./types";

/** Bank promotion pages, merchant promotion pages and admin-verified deals. */

export function createDemoOffersProvider(): DataProvider {
  return {
    id: "demo-offers",
    name: "Demo offers & merchants (fictional offers)",
    kind: "merchantOffers",
    refreshPolicy: REFRESH_POLICIES.merchantOffers,
    async fetch({ now }) {
      const d = demoDates(now);
      return {
        providerId: "demo-offers",
        fetchedAt: now.toISOString(),
        source: { url: "demo://offers", publisher: "Demo dataset", retrievedAt: now.toISOString() },
        offers: demoOffers(d).filter((o) => o.sourceType !== "network"),
        merchants: demoMerchants(d),
        mccs: demoMccs(d),
        errors: [],
      };
    },
  };
}

export interface HttpOffersProviderOptions {
  id: string;
  name: string;
  /** Endpoint returning { offers: CardOffer[], merchants?: Merchant[] }. */
  url: string;
  publisher: string;
  sourceType?: CardOffer["sourceType"];
  headers?: Record<string, string>;
}

export function createHttpOffersProvider(opts: HttpOffersProviderOptions): DataProvider {
  return {
    id: opts.id,
    name: opts.name,
    kind: "merchantOffers",
    refreshPolicy: REFRESH_POLICIES.merchantOffers,
    async fetch(ctx) {
      const source = sourceFor(opts.url, opts.publisher, ctx.now);
      try {
        const body = (await fetchJson(ctx, opts.url, opts.headers)) as { offers?: CardOffer[]; merchants?: Merchant[] };
        const offers = stamp(body.offers, source, ctx.now).map((o) => ({ ...o, sourceType: o.sourceType ?? opts.sourceType ?? "bank", publisher: o.publisher ?? opts.publisher }));
        return { providerId: opts.id, fetchedAt: ctx.now.toISOString(), source, offers, merchants: stamp(body.merchants, source, ctx.now), errors: [] };
      } catch (e) {
        return { providerId: opts.id, fetchedAt: ctx.now.toISOString(), source, errors: [(e as Error).message] };
      }
    },
  };
}

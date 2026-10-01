import { demoCurrencies } from "../data/demo/currencies";
import { demoDates } from "../data/demo/dates";
import type { RewardValuation } from "../domain/types";
import { fetchJson, sourceFor } from "./httpJson";
import { type DataProvider, REFRESH_POLICIES } from "./types";

/** Airline/hotel/bank loyalty programme valuations. */

export function createDemoValuationProvider(): DataProvider {
  return {
    id: "demo-valuations",
    name: "Demo loyalty currencies & valuations",
    kind: "loyaltyValuation",
    refreshPolicy: REFRESH_POLICIES.loyaltyValuation,
    async fetch({ now }) {
      return {
        providerId: "demo-valuations",
        fetchedAt: now.toISOString(),
        source: { url: "demo://valuations", publisher: "Demo dataset", retrievedAt: now.toISOString() },
        rewardCurrencies: demoCurrencies(demoDates(now)),
        errors: [],
      };
    },
  };
}

/**
 * A valuation feed returns { valuations: RewardValuation[] } — e.g. from your
 * own analysis of award-chart redemptions. Only the valuation is updated; the
 * currency definition is kept.
 */
export function createHttpValuationProvider(opts: { id: string; name: string; url: string; publisher: string; headers?: Record<string, string> }): DataProvider {
  return {
    id: opts.id,
    name: opts.name,
    kind: "loyaltyValuation",
    refreshPolicy: REFRESH_POLICIES.loyaltyValuation,
    async fetch(ctx) {
      const source = sourceFor(opts.url, opts.publisher, ctx.now);
      try {
        const body = (await fetchJson(ctx, opts.url, opts.headers)) as { valuations?: RewardValuation[] };
        const valuations = (body.valuations ?? []).map((v) => ({
          ...v,
          dataStatus: v.dataStatus ?? "estimated",
          sourceUrls: [...(v.sourceUrls ?? []), opts.url],
          lastUpdatedAt: v.lastUpdatedAt ?? ctx.now.toISOString(),
        }));
        return { providerId: opts.id, fetchedAt: ctx.now.toISOString(), source, valuations, errors: [] };
      } catch (e) {
        return { providerId: opts.id, fetchedAt: ctx.now.toISOString(), source, errors: [(e as Error).message] };
      }
    },
  };
}

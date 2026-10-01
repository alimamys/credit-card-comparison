import type { CardOffer } from "../domain/types";
import { sourceFor } from "./httpJson";
import { type DataProvider, type ProviderKind, REFRESH_POLICIES } from "./types";

/**
 * Generic adapter for official web pages (bank promotion pages, T&C pages).
 * You supply an `extract` function that turns the page HTML into normalised
 * offers. Extractors MUST return only what the page states; anything uncertain
 * (e.g. stacking) should be left as "unknown" for an admin to confirm.
 *
 * Respect each site's terms of use and robots.txt; prefer official APIs/feeds.
 */
export function createHtmlPageProvider(opts: {
  id: string;
  name: string;
  kind?: ProviderKind;
  url: string;
  publisher: string;
  extract: (html: string, ctx: { url: string; now: Date }) => CardOffer[];
}): DataProvider {
  const kind = opts.kind ?? "merchantOffers";
  return {
    id: opts.id,
    name: opts.name,
    kind,
    refreshPolicy: REFRESH_POLICIES[kind],
    async fetch(ctx) {
      const source = sourceFor(opts.url, opts.publisher, ctx.now);
      try {
        const res = await ctx.fetch(opts.url, { headers: { accept: "text/html" } });
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${opts.url}`);
        const offers = opts.extract(await res.text(), { url: opts.url, now: ctx.now }).map((o) => ({
          ...o,
          dataStatus: o.dataStatus ?? "live",
          lastCheckedAt: ctx.now.toISOString(),
          sources: [...(o.sources ?? []), source],
        }));
        return { providerId: opts.id, fetchedAt: ctx.now.toISOString(), source, offers, errors: [] };
      } catch (e) {
        return { providerId: opts.id, fetchedAt: ctx.now.toISOString(), source, errors: [(e as Error).message] };
      }
    },
  };
}

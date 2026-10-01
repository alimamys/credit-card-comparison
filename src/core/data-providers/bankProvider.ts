import { demoBanks } from "../data/demo/banks";
import { demoCards } from "../data/demo/cards";
import { demoDates } from "../data/demo/dates";
import type { Bank, Card } from "../domain/types";
import { fetchJson, sourceFor, stamp } from "./httpJson";
import { type DataProvider, REFRESH_POLICIES } from "./types";

/** Issuer product data (cards, earn rules, caps). */

export function createDemoBankProvider(): DataProvider {
  return {
    id: "demo-banks",
    name: "Demo issuers (fictional)",
    kind: "bank",
    refreshPolicy: REFRESH_POLICIES.bank,
    async fetch({ now }) {
      const d = demoDates(now);
      return {
        providerId: "demo-banks",
        fetchedAt: now.toISOString(),
        source: { url: "demo://banks", publisher: "Demo dataset", retrievedAt: now.toISOString() },
        banks: demoBanks(d),
        cards: demoCards(d),
        errors: [],
      };
    },
  };
}

export interface HttpBankProviderOptions {
  id: string;
  name: string;
  /** Endpoint returning { banks?: Bank[], cards: Card[] }. */
  url: string;
  publisher: string;
  headers?: Record<string, string>;
}

export function createHttpBankProvider(opts: HttpBankProviderOptions): DataProvider {
  return {
    id: opts.id,
    name: opts.name,
    kind: "bank",
    refreshPolicy: REFRESH_POLICIES.bank,
    async fetch(ctx) {
      const source = sourceFor(opts.url, opts.publisher, ctx.now);
      try {
        const body = (await fetchJson(ctx, opts.url, opts.headers)) as { banks?: Bank[]; cards?: Card[] };
        return { providerId: opts.id, fetchedAt: ctx.now.toISOString(), source, banks: stamp(body.banks, source, ctx.now), cards: stamp(body.cards, source, ctx.now), errors: [] };
      } catch (e) {
        return { providerId: opts.id, fetchedAt: ctx.now.toISOString(), source, errors: [(e as Error).message] };
      }
    },
  };
}

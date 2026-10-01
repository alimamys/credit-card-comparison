import type { DataSource, DataStatus } from "../domain/types";
import type { ProviderContext } from "./types";

/**
 * Shared helpers for JSON-feed providers. A feed is any HTTPS endpoint (an
 * issuer/partner API, or your own scraper service) returning records that
 * already follow this app's schema, e.g. { "offers": [ ... ] }.
 */

export async function fetchJson(ctx: ProviderContext, url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await ctx.fetch(url, { headers: { accept: "application/json", ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

/** Stamp provenance onto every record coming from a live source. */
export function stamp<T extends object>(records: T[] | undefined, source: DataSource, now: Date, status: DataStatus = "live"): T[] {
  return (records ?? []).map((r) => ({
    ...r,
    dataStatus: (r as { dataStatus?: DataStatus }).dataStatus ?? status,
    lastCheckedAt: now.toISOString(),
    sources: [...(((r as { sources?: DataSource[] }).sources) ?? []), source],
  }));
}

export function sourceFor(url: string, publisher: string, now: Date): DataSource {
  return { url, publisher, retrievedAt: now.toISOString() };
}

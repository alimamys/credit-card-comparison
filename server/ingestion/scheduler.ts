import type { DataProvider } from "../../src/core/data-providers";
import { expireOffers, runProviders } from "../../src/core/ingestion/pipeline";
import type { FileStore } from "../store";

/** Which providers are due, according to each provider's refresh policy. */
export function dueProviders(providers: DataProvider[], lastRun: Record<string, string>, now: Date): DataProvider[] {
  return providers.filter((p) => {
    const last = lastRun[p.id];
    if (!last) return true;
    return now.getTime() - new Date(last).getTime() >= p.refreshPolicy.intervalHours * 3_600_000;
  });
}

export async function refresh(store: FileStore, providers: DataProvider[], now = new Date(), log = console.log) {
  if (!providers.length) return [];
  const result = await runProviders(store.state.dataset, providers, now);
  const dataset = result.dataset;
  dataset.dataStatus = [...dataset.cards, ...dataset.offers].some((x) => x.dataStatus === "demo") ? "demo" : "cached";
  store.state.dataset = dataset;
  store.appendAudit(result.audit);
  store.state.pending = [...result.pending, ...store.state.pending].slice(0, 500);
  store.state.runs = [...result.reports, ...store.state.runs].slice(0, 200);
  for (const r of result.reports) store.state.providerLastRun[r.providerId] = r.ranAt;
  store.save();
  for (const r of result.reports) {
    log(`[ingest] ${r.providerId}: +${r.created} ~${r.updated} =${r.unchanged} ✗${r.rejected} review:${r.queuedForReview}${r.errors.length ? ` errors: ${r.errors.join("; ")}` : ""}`);
  }
  return result.reports;
}

/** Hourly tick: run due providers and expire finished offers. */
export function startScheduler(store: FileStore, providers: DataProvider[], onChange: () => void, log = console.log): () => void {
  const tick = async () => {
    const now = new Date();
    const due = dueProviders(providers, store.state.providerLastRun, now);
    if (due.length) {
      await refresh(store, due, now, log);
      onChange();
    }
    const expired = expireOffers(store.state.dataset, now);
    if (expired.audit.length) {
      store.state.dataset = expired.dataset;
      store.appendAudit(expired.audit);
      store.save();
      log(`[ingest] expired ${expired.audit.length} offer(s)`);
      onChange();
    }
  };
  const handle = setInterval(() => void tick().catch((e) => log(`[ingest] tick failed: ${e}`)), 3_600_000);
  return () => clearInterval(handle);
}

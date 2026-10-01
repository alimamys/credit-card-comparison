import type { CollectionName, Dataset } from "../domain/types";
import { getOfferStatus } from "../engines/offerEligibilityEngine";
import type { DataProvider, ProviderResult } from "../data-providers/types";
import { entityId, validateEntity } from "../validation/validate";

/**
 * Ingestion pipeline: provider results → validate → normalise → merge.
 *
 *  - Invalid records are rejected (never silently "fixed").
 *  - Records an administrator has verified are NOT overwritten by automated
 *    sources; detected differences are queued for review instead.
 *  - Unchanged records only get their `lastCheckedAt` bumped.
 *  - Expired offers are kept for history with status "expired".
 *  - Every change is written to the audit log.
 */

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  collection: CollectionName;
  entityId: string;
  action: "create" | "update" | "delete" | "verify" | "pending_review" | "expire";
  before?: unknown;
  after?: unknown;
  note?: string;
}

export interface PendingReview {
  id: string;
  detectedAt: string;
  providerId: string;
  collection: CollectionName;
  entityId: string;
  current: unknown;
  proposed: unknown;
}

export interface ProviderRunReport {
  providerId: string;
  providerName: string;
  ranAt: string;
  ok: boolean;
  errors: string[];
  created: number;
  updated: number;
  unchanged: number;
  rejected: number;
  queuedForReview: number;
  rejections: { collection: CollectionName; id: string; message: string }[];
}

const VOLATILE = new Set(["lastCheckedAt", "sources", "lastVerifiedAt", "dataStatus"]);

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object)
      .filter((k) => !VOLATILE.has(k) && (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function materiallyEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

let seq = 0;
export function newId(prefix: string): string {
  seq = (seq + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}`;
}

/** Apply valuation-only updates onto the matching currencies. */
function mergeValuations(result: ProviderResult, dataset: Dataset): ProviderResult {
  if (!result.valuations?.length) return result;
  const currencies = [...(result.rewardCurrencies ?? [])];
  for (const v of result.valuations) {
    const existing = currencies.find((c) => c.id === v.currencyId) ?? dataset.rewardCurrencies.find((c) => c.id === v.currencyId);
    if (!existing) continue;
    const updated = { ...existing, valuation: v, lastCheckedAt: result.fetchedAt };
    const idx = currencies.findIndex((c) => c.id === v.currencyId);
    if (idx >= 0) currencies[idx] = updated;
    else currencies.push(updated);
  }
  return { ...result, rewardCurrencies: currencies };
}

export function mergeProviderResult(
  dataset: Dataset,
  rawResult: ProviderResult,
  provider: Pick<DataProvider, "id" | "name">,
  now: Date,
): { dataset: Dataset; audit: AuditEntry[]; pending: PendingReview[]; report: ProviderRunReport } {
  const result = mergeValuations(rawResult, dataset);
  const audit: AuditEntry[] = [];
  const pending: PendingReview[] = [];
  const report: ProviderRunReport = {
    providerId: provider.id,
    providerName: provider.name,
    ranAt: now.toISOString(),
    ok: result.errors.length === 0,
    errors: [...result.errors],
    created: 0,
    updated: 0,
    unchanged: 0,
    rejected: 0,
    queuedForReview: 0,
    rejections: [],
  };
  const next: Dataset = { ...dataset };
  const actor = `ingestion:${provider.id}`;
  const collections: CollectionName[] = ["banks", "rewardCurrencies", "merchants", "mccs", "cards", "offers"];

  for (const collection of collections) {
    const incoming = (result[collection] ?? []) as unknown as Record<string, unknown>[];
    if (!incoming.length) continue;
    const list = [...(next[collection] as unknown as Record<string, unknown>[])];
    const index = new Map(list.map((e, i) => [entityId(collection, e), i]));

    for (let record of incoming) {
      const id = entityId(collection, record);
      const errors = validateEntity(collection, record, next).filter((i) => i.severity === "error");
      if (errors.length) {
        report.rejected++;
        report.rejections.push({ collection, id, message: errors.map((e) => `${e.field ?? ""} ${e.message}`.trim()).join("; ") });
        continue;
      }
      if (collection === "offers" && getOfferStatus(record as never, now) === "expired" && record.status !== "expired") {
        record = { ...record, status: "expired" };
      }
      const pos = index.get(id);
      if (pos === undefined) {
        list.push(record);
        index.set(id, list.length - 1);
        report.created++;
        audit.push({ id: newId("aud"), at: now.toISOString(), actor, collection, entityId: id, action: "create", after: record });
        continue;
      }
      const current = list[pos];
      if (materiallyEqual(current, record)) {
        list[pos] = { ...current, lastCheckedAt: now.toISOString() };
        report.unchanged++;
        continue;
      }
      if (current.dataStatus === "verified") {
        pending.push({ id: newId("rev"), detectedAt: now.toISOString(), providerId: provider.id, collection, entityId: id, current, proposed: record });
        list[pos] = { ...current, lastCheckedAt: now.toISOString() };
        report.queuedForReview++;
        audit.push({ id: newId("aud"), at: now.toISOString(), actor, collection, entityId: id, action: "pending_review", note: "Source changed for an admin-verified record" });
        continue;
      }
      list[pos] = record;
      report.updated++;
      audit.push({ id: newId("aud"), at: now.toISOString(), actor, collection, entityId: id, action: "update", before: current, after: record });
    }
    (next as unknown as Record<string, unknown>)[collection] = list;
  }

  next.generatedAt = now.toISOString();
  return { dataset: next, audit, pending, report };
}

/** Mark offers whose end date has passed as expired (kept for history). */
export function expireOffers(dataset: Dataset, now: Date, actor = "scheduler"): { dataset: Dataset; audit: AuditEntry[] } {
  const audit: AuditEntry[] = [];
  const offers = dataset.offers.map((o) => {
    if (o.status !== "expired" && getOfferStatus(o, now) === "expired") {
      audit.push({ id: newId("aud"), at: now.toISOString(), actor, collection: "offers", entityId: o.id, action: "expire", note: `Ended ${o.endDate}` });
      return { ...o, status: "expired" as const };
    }
    if (o.status === "upcoming" && getOfferStatus(o, now) === "active") return { ...o, status: "active" as const };
    return o;
  });
  return { dataset: { ...dataset, offers }, audit };
}

export async function runProviders(
  dataset: Dataset,
  providers: DataProvider[],
  now: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<{ dataset: Dataset; audit: AuditEntry[]; pending: PendingReview[]; reports: ProviderRunReport[] }> {
  let current = dataset;
  const audit: AuditEntry[] = [];
  const pending: PendingReview[] = [];
  const reports: ProviderRunReport[] = [];
  for (const provider of providers) {
    let result: ProviderResult;
    try {
      result = await provider.fetch({ now, fetch: fetchImpl });
    } catch (e) {
      result = { providerId: provider.id, fetchedAt: now.toISOString(), source: { url: "", publisher: provider.name, retrievedAt: now.toISOString() }, errors: [(e as Error).message] };
    }
    const merged = mergeProviderResult(current, result, provider, now);
    current = merged.dataset;
    audit.push(...merged.audit);
    pending.push(...merged.pending);
    reports.push(merged.report);
  }
  const expired = expireOffers(current, now);
  audit.push(...expired.audit);
  return { dataset: expired.dataset, audit, pending, reports };
}

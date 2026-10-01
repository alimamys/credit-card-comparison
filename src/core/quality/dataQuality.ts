import type { Card, CardOffer, Dataset, RewardCurrency } from "../domain/types";
import { getOfferStatus, offerFingerprint } from "../engines/offerEligibilityEngine";
import { ruleSpecificity } from "../engines/rewardEngine";
import { daysBetween, daysSince, parseDate } from "../time";
import { validateDataset, type ValidationIssue } from "../validation/validate";

/**
 * Data-quality checks for the admin dashboard. Designed to stay useful once
 * the database holds hundreds of cards and offers.
 */

export interface QualityThresholds {
  cardStaleDays: number;
  valuationStaleDays: number;
  offerExpiringSoonDays: number;
  offerStaleDays: number;
}

export const DEFAULT_THRESHOLDS: QualityThresholds = {
  cardStaleDays: 30,
  valuationStaleDays: 60,
  offerExpiringSoonDays: 7,
  offerStaleDays: 14,
};

export interface QualityItem {
  collection: "cards" | "offers" | "rewardCurrencies" | "merchants" | "banks" | "mccs";
  id: string;
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
}

export interface DataQualityReport {
  generatedAt: string;
  expiredOffers: QualityItem[];
  expiringSoon: QualityItem[];
  staleCards: QualityItem[];
  staleOffers: QualityItem[];
  valuationsNeedingUpdate: QualityItem[];
  missingSources: QualityItem[];
  conflicts: QualityItem[];
  validation: ValidationIssue[];
  totals: { cards: number; offers: number; activeOffers: number; currencies: number; merchants: number; demoRecords: number };
}

function hasSource(x: { sources?: unknown[]; sourceUrl?: string }): boolean {
  const real = (u?: string) => !!u && !u.startsWith("demo://");
  return (x.sources ?? []).length > 0 || real(x.sourceUrl);
}

function cardConflicts(card: Card): QualityItem[] {
  const out: QualityItem[] = [];
  const rules = card.earnRules;
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i];
      const b = rules[j];
      if (ruleSpecificity(a) !== ruleSpecificity(b)) continue;
      if ((a.minMonthlySpendAED ?? 0) !== (b.minMonthlySpendAED ?? 0)) continue;
      if ((a.match.region ?? "any") !== (b.match.region ?? "any")) continue;
      const overlap = (x?: string[], y?: string[]) => (!x?.length && !y?.length) || (x ?? []).some((v) => (y ?? []).includes(v));
      if (overlap(a.match.categories, b.match.categories) && overlap(a.match.merchantIds, b.match.merchantIds) && overlap(a.match.mccs, b.match.mccs) && a.unitsPerAED !== b.unitsPerAED) {
        out.push({
          collection: "cards",
          id: card.id,
          title: `${card.name}: conflicting earn rules`,
          detail: `"${a.label}" (${a.unitsPerAED}/AED) and "${b.label}" (${b.unitsPerAED}/AED) match the same spend. The engine uses the higher rate until resolved.`,
          severity: "high",
        });
      }
    }
  }
  return out;
}

function offerConflicts(offers: CardOffer[]): QualityItem[] {
  const out: QualityItem[] = [];
  const byCanonical = new Map<string, CardOffer[]>();
  for (const o of offers) if (o.canonicalOfferId) byCanonical.set(o.canonicalOfferId, [...(byCanonical.get(o.canonicalOfferId) ?? []), o]);
  for (const [cid, group] of byCanonical) {
    const fps = new Set(group.map(offerFingerprint));
    if (fps.size > 1) {
      out.push({
        collection: "offers",
        id: group[0].id,
        title: `Campaign ${cid}: sources disagree`,
        detail: `${group.length} records describe this campaign with different terms (${group.map((g) => g.publisher).join(", ")}). Bank terms take precedence.`,
        severity: "high",
      });
    }
  }
  return out;
}

export function computeDataQuality(dataset: Dataset, now: Date, t: QualityThresholds = DEFAULT_THRESHOLDS): DataQualityReport {
  const expiredOffers: QualityItem[] = [];
  const expiringSoon: QualityItem[] = [];
  const staleOffers: QualityItem[] = [];
  let activeOffers = 0;

  for (const o of dataset.offers) {
    const status = getOfferStatus(o, now);
    if (status === "expired") {
      expiredOffers.push({
        collection: "offers",
        id: o.id,
        title: o.title,
        detail: `Ended ${o.endDate}${o.status !== "expired" ? ` — stored status is still "${o.status}" (excluded from calculations automatically)` : ""}`,
        severity: o.status !== "expired" ? "medium" : "low",
      });
      continue;
    }
    if (status === "active") {
      activeOffers++;
      const daysLeft = daysBetween(now, parseDate(o.endDate, "end"));
      if (daysLeft <= t.offerExpiringSoonDays) {
        expiringSoon.push({ collection: "offers", id: o.id, title: o.title, detail: `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (${o.endDate})`, severity: "medium" });
      }
      const age = daysSince(o.lastVerifiedAt, now) ?? Infinity;
      if (age > t.offerStaleDays) {
        staleOffers.push({ collection: "offers", id: o.id, title: o.title, detail: `Active offer last verified ${age} days ago`, severity: "medium" });
      }
    }
  }

  const staleCards = dataset.cards
    .map((c) => ({ c, age: daysSince(c.lastVerifiedAt, now) }))
    .filter(({ age }) => age === undefined || age > t.cardStaleDays)
    .sort((a, b) => (b.age ?? Infinity) - (a.age ?? Infinity))
    .map(({ c, age }) => ({
      collection: "cards" as const,
      id: c.id,
      title: c.name,
      detail: age === undefined ? "Never verified" : `Last verified ${age} days ago`,
      severity: (age === undefined || age > t.cardStaleDays * 2 ? "high" : "medium") as QualityItem["severity"],
    }));

  const valuationsNeedingUpdate = dataset.rewardCurrencies
    .filter((c) => c.type !== "cash")
    .flatMap((c: RewardCurrency): QualityItem[] => {
      const age = daysSince(c.valuation.lastUpdatedAt, now) ?? Infinity;
      const items: QualityItem[] = [];
      if (c.valuation.aedValuePerUnit <= 0) {
        items.push({ collection: "rewardCurrencies", id: c.id, title: c.name, detail: "No valuation set — rewards in this currency are counted as AED 0", severity: "high" });
      } else if (age > t.valuationStaleDays) {
        items.push({ collection: "rewardCurrencies", id: c.id, title: c.name, detail: `Valuation last updated ${age} days ago`, severity: "medium" });
      } else if (c.valuation.confidence === "low") {
        items.push({ collection: "rewardCurrencies", id: c.id, title: c.name, detail: "Low-confidence valuation", severity: "low" });
      }
      return items;
    });

  const missingSources: QualityItem[] = [
    ...dataset.cards.filter((c) => !hasSource(c) && !c.earnRules.every((r) => r.sources?.length)).map((c) => ({
      collection: "cards" as const, id: c.id, title: c.name, detail: "Card earning rules have no source", severity: "high" as const,
    })),
    ...dataset.offers.filter((o) => !hasSource(o)).map((o) => ({
      collection: "offers" as const, id: o.id, title: o.title, detail: o.sourceUrl.startsWith("demo://") ? "Demo placeholder source" : "No source URL", severity: "high" as const,
    })),
    ...dataset.rewardCurrencies.filter((c) => c.type !== "cash" && !(c.valuation.sourceUrls?.length)).map((c) => ({
      collection: "rewardCurrencies" as const, id: c.id, title: c.name, detail: "Valuation has no cited source", severity: "medium" as const,
    })),
  ];

  const conflicts = [...dataset.cards.flatMap(cardConflicts), ...offerConflicts(dataset.offers)];

  const all = [...dataset.banks, ...dataset.cards, ...dataset.offers, ...dataset.rewardCurrencies, ...dataset.merchants];
  return {
    generatedAt: now.toISOString(),
    expiredOffers,
    expiringSoon,
    staleCards,
    staleOffers,
    valuationsNeedingUpdate,
    missingSources,
    conflicts,
    validation: validateDataset(dataset),
    totals: {
      cards: dataset.cards.length,
      offers: dataset.offers.length,
      activeOffers,
      currencies: dataset.rewardCurrencies.length,
      merchants: dataset.merchants.length,
      demoRecords: all.filter((x) => x.dataStatus === "demo").length,
    },
  };
}

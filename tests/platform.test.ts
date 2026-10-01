import { describe, expect, it } from "vitest";
import { deleteEntity, upsertEntity, ValidationError, verifyEntity } from "../src/core/admin/mutations";
import { createDemoDataset, SAMPLE_WALLET } from "../src/core/data/demo";
import { createDemoOffersProvider, demoProviders } from "../src/core/data-providers";
import type { Card, CardOffer, Dataset } from "../src/core/domain/types";
import { dedupeOffers, getOfferStatus, isOfferActive } from "../src/core/engines/offerEligibilityEngine";
import { recommend } from "../src/core/engines/rankingEngine";
import { ValuationEngine } from "../src/core/engines/valuationEngine";
import { createHistoryEntry, summariseByMonth } from "../src/core/history/history";
import { mergeProviderResult, runProviders } from "../src/core/ingestion/pipeline";
import { parseTransactionInput, toTransaction } from "../src/core/parser/transactionParser";
import { computeDataQuality } from "../src/core/quality/dataQuality";
import { createCatalog } from "../src/core/services/catalog";
import { MerchantService } from "../src/core/services/merchantService";
import { validateDataset } from "../src/core/validation/validate";
import { card, currencies, NOW, offer, tx } from "./fixtures";

const demo = createDemoDataset(NOW);
const catalog = createCatalog(demo);
const merchants = new MerchantService(demo);

describe("freshness: isOfferActive", () => {
  const o = offer({ id: "o", offerType: "cashback", rate: 0.1, startDate: "2026-10-01", endDate: "2026-10-31" });
  it("is inclusive of the whole end day in UAE time", () => {
    expect(isOfferActive(o, new Date("2026-10-31T23:59:00+04:00"))).toBe(true);
    expect(isOfferActive(o, new Date("2026-11-01T00:00:01+04:00"))).toBe(false);
    expect(isOfferActive(o, new Date("2026-09-30T23:59:59+04:00"))).toBe(false);
    expect(isOfferActive(o, new Date("2026-10-01T00:00:00+04:00"))).toBe(true);
  });
  it("derives status from dates; an admin-withdrawn offer stays expired", () => {
    expect(getOfferStatus(o, new Date("2026-09-15"))).toBe("upcoming");
    expect(getOfferStatus(o, new Date("2026-11-15"))).toBe("expired");
    expect(isOfferActive({ ...o, status: "expired" }, new Date("2026-10-10"))).toBe(false);
  });
  it("the demo's stale 'active' offer is excluded by date", () => {
    const stale = demo.offers.find((x) => x.id === "o_dining_stars_expired")!;
    expect(stale.status).toBe("active");
    expect(catalog.offers.active(NOW).some((d) => d.offer.id === stale.id)).toBe(false);
  });
});

describe("valuation engine", () => {
  const engine = new ValuationEngine(currencies);
  it("values miles with a range and respects user overrides", () => {
    const v = engine.value(500, "etihad");
    expect(v.aed).toBeCloseTo(17.5);
    expect(v.low).toBeCloseTo(12.5);
    expect(v.high).toBeCloseTo(22.5);
    const custom = engine.withOverrides({ etihad: 0.05 }).resolve("etihad")!;
    expect(custom.aedValuePerUnit).toBe(0.05);
    expect(custom.method).toBe("user_defined");
    expect(custom.defaultAedValuePerUnit).toBe(0.035);
  });
  it("never invents a value for unknown currencies; cash cannot be overridden", () => {
    expect(engine.value(100, "nope")).toMatchObject({ aed: 0, missing: true });
    expect(engine.withOverrides({ aed_cash: 5 }).resolve("aed_cash")!.aedValuePerUnit).toBe(1);
  });
  it("user valuations change the ranking", () => {
    const miles = card({ id: "miles", rewardCurrencyId: "etihad", earnRules: [{ id: "b", label: "b", unitsPerAED: 1, match: {} }] });
    const cash = card({ id: "cash", rewardCurrencyId: "aed_cash", earnRules: [{ id: "b", label: "b", unitsPerAED: 0.04, match: {} }] });
    const args = { walletCards: [miles, cash], transaction: tx({ amount: 1000 }), activeOffers: [], now: NOW };
    expect(recommend({ ...args, valuations: engine }).bestCard?.cardId).toBe("cash");
    expect(recommend({ ...args, valuations: engine.withOverrides({ etihad: 0.05 }) }).bestCard?.cardId).toBe("miles");
  });
});

describe("transaction parser", () => {
  const cases: [string, Partial<ReturnType<typeof parseTransactionInput>>][] = [
    ["AED 200 petrol at ENOC", { amount: 200, merchantId: "enoc", category: "fuel" }],
    ["500 Carrefour", { amount: 500, merchantId: "carrefour", category: "groceries" }],
    ["120 Talabat", { amount: 120, merchantId: "talabat", category: "food_delivery", channel: "online" }],
    ["AED 3,500 Emirates flight", { amount: 3500, merchantId: "emirates", category: "airline" }],
    ["2500 school fees", { amount: 2500, category: "education" }],
    ["800 Amazon", { amount: 800, merchantId: "amazon_ae", category: "online_shopping" }],
    ["3.5k dinner", { amount: 3500, category: "dining" }],
    ["150.50 dhs Spinneys", { amount: 150.5, merchantId: "spinneys" }],
    ["AED 370 Emirates ID renewal", { amount: 370, category: "government" }],
    ["300 carefour", { amount: 300, merchantId: "carrefour", fuzzyMerchant: true }],
    ["200 Carrefour with Apple Pay", { merchantId: "carrefour", paymentMethod: "Apple Pay" }],
  ];
  for (const [input, expected] of cases) {
    it(`parses "${input}"`, () => {
      expect(parseTransactionInput(input, merchants)).toMatchObject(expected);
    });
  }
  it("does not mistake 'Emirates ID' for the airline", () => {
    expect(parseTransactionInput("AED 370 Emirates ID renewal", merchants).merchantId).toBeUndefined();
  });
  it("converts foreign currency and marks it international", () => {
    const p = parseTransactionInput("$100 hotel in London", merchants);
    expect(p).toMatchObject({ amount: 367.25, originalAmount: 100, originalCurrency: "USD", region: "international", category: "hotel" });
    expect(toTransaction(p, NOW)?.amount).toBe(367.25);
  });
  it("returns no transaction without an amount", () => {
    expect(toTransaction(parseTransactionInput("Carrefour", merchants), NOW)).toBeUndefined();
  });
});

describe("demo dataset", () => {
  it("is valid, fully marked as demo, and internally consistent", () => {
    expect(validateDataset(demo).filter((i) => i.severity === "error")).toEqual([]);
    expect(demo.cards.every((c) => c.dataStatus === "demo")).toBe(true);
    expect(demo.offers.every((o) => o.dataStatus === "demo" && o.sourceUrl.startsWith("demo://"))).toBe(true);
    expect(demo.banks.every((b) => b.name.includes("(Demo)"))).toBe(true);
  });
  it("contains no fabricated valuations for real bank programmes", () => {
    for (const id of ["enbd_plus_points", "adcb_touchpoints", "fab_rewards", "citi_thankyou_points"]) {
      expect(demo.rewardCurrencies.find((c) => c.id === id)?.valuation.aedValuePerUnit).toBe(0);
    }
  });
  it("de-duplicates the ENOC campaign published twice", () => {
    const enoc = catalog.offers.active(NOW).filter((d) => d.offer.canonicalOfferId === "camp_enoc_duo");
    expect(enoc).toHaveLength(1);
    expect(enoc[0].duplicateOfferIds).toEqual(["o_enoc_duo_merchant"]);
  });

  const run = (text: string, wallet = SAMPLE_WALLET, state?: Parameters<typeof catalog.recommend>[0]["userRewardState"]) =>
    catalog.recommend({ walletCardIds: wallet, transaction: toTransaction(parseTransactionInput(text, merchants), NOW)!, now: NOW, userRewardState: state });

  it("ENOC: the fuel card wins; the registration-dependent deal is surfaced as potential", () => {
    const r = run("AED 200 petrol at ENOC");
    expect(r.bestCard?.cardId).toBe("marina_rta");
    expect(r.bestCard?.totalEstimatedAEDValue).toBe(20);
    expect(r.potentialHighlights.find((h) => h.cardId === "saffron_duo")).toMatchObject({ wouldRank: 1, potentialAEDValue: 34 });
    // Once registered, the deal applies and changes the winner.
    const reg = run("AED 200 petrol at ENOC", SAMPLE_WALLET, { registeredOfferIds: ["o_enoc_duo_bank"], cards: {} });
    expect(reg.bestCard?.cardId).toBe("saffron_duo");
    expect(reg.dealHighlights[0]).toMatchObject({ cardId: "saffron_duo", rankWith: 1 });
  });

  it("only wallet cards are ranked; better non-wallet cards go to missingOut", () => {
    const r = run("AED 3,500 Emirates flight");
    expect(r.allCards.every((c) => SAMPLE_WALLET.includes(c.cardId))).toBe(true);
    expect(r.missingOut[0].cardId).toBe("corniche_skywards");
    expect(r.missingOut[0].totalEstimatedAEDValue).toBeGreaterThan(r.bestCard!.totalEstimatedAEDValue);
  });

  it("Carrefour: a 5X promotion moves the points card to #1", () => {
    const r = run("500 Carrefour");
    expect(r.bestCard?.cardId).toBe("saffron_plus");
    expect(r.bestCard?.totalEstimatedAEDValue).toBe(50);
    expect(r.dealHighlights.some((d) => d.cardId === "saffron_plus")).toBe(true);
  });
});

describe("data quality dashboard", () => {
  const q = computeDataQuality(demo, NOW);
  it("flags expired, expiring, stale, unvalued, unsourced and conflicting data", () => {
    expect(q.expiredOffers.map((i) => i.id)).toContain("o_dining_stars_expired");
    expect(q.expiringSoon.map((i) => i.id)).toContain("o_booking_falcon");
    expect(q.staleCards.find((i) => i.id === "pearl_365")?.detail).toBe("Last verified 47 days ago");
    expect(q.valuationsNeedingUpdate.map((i) => i.id)).toEqual(expect.arrayContaining(["adcb_touchpoints", "marriott_bonvoy_points"]));
    expect(q.missingSources.length).toBeGreaterThan(0);
    expect(q.conflicts.map((c) => c.id)).toContain("falcon_bonvoy");
  });
});

describe("ingestion pipeline & admin", () => {
  const empty: Dataset = { ...demo, banks: [], cards: [], offers: [], rewardCurrencies: [], merchants: [], mccs: [] };

  it("seeds an empty store from providers and is idempotent", async () => {
    const first = await runProviders(empty, demoProviders(), NOW, fetch);
    expect(first.reports.every((r) => r.rejected === 0)).toBe(true);
    expect(first.dataset.cards).toHaveLength(demo.cards.length);
    const again = await runProviders(first.dataset, demoProviders(), NOW, fetch);
    expect(again.reports.reduce((a, r) => a + r.created + r.updated, 0)).toBe(0);
    // expired demo offer has been marked expired but kept for history
    expect(first.dataset.offers.find((o) => o.id === "o_dining_stars_expired")?.status).toBe("expired");
  });

  it("rejects invalid records and queues changes to admin-verified records for review", async () => {
    const verified: Dataset = { ...demo, offers: demo.offers.map((o) => (o.id === "o_mc_vox" ? { ...o, dataStatus: "verified" as const } : o)) };
    const bad = { ...demo.offers[0], id: "bad", rate: 15 } as CardOffer;
    const changed = { ...demo.offers.find((o) => o.id === "o_mc_vox")!, rate: 0.2 };
    const res = mergeProviderResult(verified, { providerId: "p", fetchedAt: NOW.toISOString(), source: { url: "x", publisher: "x", retrievedAt: "" }, offers: [bad, changed], errors: [] }, { id: "p", name: "p" }, NOW);
    expect(res.report.rejected).toBe(1);
    expect(res.report.queuedForReview).toBe(1);
    expect(res.dataset.offers.find((o) => o.id === "o_mc_vox")?.rate).toBe(0.1);
  });

  it("admin edits are validated and audited without code changes", () => {
    const o = demo.offers.find((x) => x.id === "o_mc_vox")!;
    const r = upsertEntity(demo, "offers", { ...o, rate: 0.2 } as never, "admin:test", NOW);
    expect(r.audit).toMatchObject({ action: "update", entityId: "o_mc_vox", actor: "admin:test" });
    expect(r.dataset.offers.find((x) => x.id === "o_mc_vox")?.rate).toBe(0.2);
    expect(() => upsertEntity(demo, "offers", { ...o, sourceUrl: "" } as never, "a", NOW)).toThrow(ValidationError);
    const v = verifyEntity(demo, "cards", "pearl_365", "a", NOW);
    expect(v.dataset.cards.find((c) => c.id === "pearl_365")?.lastVerifiedAt).toBe(NOW.toISOString());
    expect(v.dataset.cards.find((c) => c.id === "pearl_365")?.dataStatus).toBe("demo");
    expect(deleteEntity(demo, "offers", "o_mc_vox", "a", NOW).dataset.offers).toHaveLength(demo.offers.length - 1);
  });

  it("demo offers provider returns normalised data", async () => {
    const r = await createDemoOffersProvider().fetch({ now: NOW, fetch });
    expect(r.offers?.every((o) => o.sourceType !== "network")).toBe(true);
  });
});

describe("history", () => {
  it("summarises extra value vs baseline per month", () => {
    const r = catalog.recommend({ walletCardIds: SAMPLE_WALLET, transaction: tx({ amount: 200, merchantId: "enoc", category: "fuel" }), now: NOW });
    const e = createHistoryEntry(r, "marina_rta", "saffron_duo")!;
    expect(e.valueAED).toBe(20);
    expect(e.baselineValueAED).toBe(4);
    const [month] = summariseByMonth([e, { ...e, id: "2" }]);
    expect(month).toMatchObject({ period: "2026-10", transactions: 2, spendAED: 400, rewardsAED: 40, extraValueAED: 32, followedRecommendation: 2 });
  });
});

describe("performance", () => {
  it("ranks 200 cards against 500 offers in well under 500 ms", () => {
    const cards: Card[] = Array.from({ length: 200 }, (_, i) => ({ ...demo.cards[i % demo.cards.length], id: `c${i}` }));
    const offers: CardOffer[] = Array.from({ length: 500 }, (_, i) =>
      offer({ id: `o${i}`, offerType: "cashback", rate: 0.01 * (i % 10), cardIds: [`c${i % 200}`], merchants: [i % 2 ? "enoc" : "carrefour"], minimumSpend: i }),
    );
    const engine = new ValuationEngine(demo.rewardCurrencies);
    const started = performance.now();
    const r = recommend({ walletCards: cards, transaction: tx({ amount: 400, merchantId: "enoc", category: "fuel" }), activeOffers: dedupeOffers(offers), valuations: engine, now: NOW });
    const elapsed = performance.now() - started;
    expect(r.allCards).toHaveLength(200);
    expect(elapsed).toBeLessThan(500);
  });
});

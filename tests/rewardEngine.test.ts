import { describe, expect, it } from "vitest";
import { dedupeOffers } from "../src/core/engines/offerEligibilityEngine";
import { recommend } from "../src/core/engines/rankingEngine";
import { calculateTransactionValue } from "../src/core/engines/transactionValueEngine";
import { card, NOW, offer, tx, valuations } from "./fixtures";
import type { CardOffer, UserRewardState } from "../src/core/domain/types";

const calc = (c: ReturnType<typeof card>, t = tx(), offers: CardOffer[] = [], state?: UserRewardState) =>
  calculateTransactionValue({ card: c, transaction: t, activeOffers: dedupeOffers(offers), rewardValuations: valuations, userRewardState: state, now: NOW });

// ---------------------------------------------------------------------------
// Spec example 1: AED 200 at ENOC
// ---------------------------------------------------------------------------
describe("spec example: AED 200 at ENOC", () => {
  const rta = card({ id: "rta", rewardCurrencyId: "aed_cash", earnRules: [
    { id: "b", label: "Base", unitsPerAED: 0.005, match: {} },
    { id: "f", label: "Fuel", unitsPerAED: 0.1, match: { categories: ["fuel"] } },
  ] });
  const ey = card({ id: "ey", rewardCurrencyId: "etihad", earnRules: [{ id: "b", label: "Base", unitsPerAED: 1.2, match: {} }] });
  const x = card({ id: "x", rewardCurrencyId: "pts", earnRules: [{ id: "b", label: "Base", unitsPerAED: 3, match: {} }] });
  const fuel = tx({ amount: 200, merchantId: "enoc", merchantName: "ENOC", category: "fuel" });

  it("ranks by total AED value and preserves the native reward", () => {
    const r = recommend({ walletCards: [x, ey, rta], transaction: fuel, activeOffers: [], valuations, now: NOW });
    expect(r.allCards.map((c) => c.cardId)).toEqual(["rta", "ey", "x"]);
    const [first, second, third] = r.topThree;
    expect(first.totalEstimatedAEDValue).toBe(20);
    expect(first.effectiveReturnPercentage).toBe(10);
    expect(first.confidence).toBe("exact");
    expect(second.baseReward.quantity).toBe(240);
    expect(second.baseReward.currency).toBe("Etihad Guest Miles");
    expect(second.totalEstimatedAEDValue).toBe(8.4);
    expect(second.effectiveReturnPercentage).toBe(4.2);
    expect(second.confidence).toBe("estimated");
    expect(second.valueRange).toEqual({ low: 6, high: 10.8 });
    expect(third.baseReward.quantity).toBe(600);
    expect(third.totalEstimatedAEDValue).toBe(6);
    expect(r.bestCard?.cardId).toBe("rta");
  });
});

// ---------------------------------------------------------------------------
// Spec examples 22 & 23: AED 1,000 Emirates flight, then a 3X promotion
// ---------------------------------------------------------------------------
describe("spec example: AED 1,000 Emirates flight", () => {
  const a = card({ id: "A", rewardCurrencyId: "skywards", earnRules: [{ id: "b", label: "Base", unitsPerAED: 0.5, match: {} }] });
  const b = card({ id: "B", rewardCurrencyId: "aed_cash", earnRules: [{ id: "b", label: "Base", unitsPerAED: 0.03, match: {} }] });
  const c = card({ id: "C", rewardCurrencyId: "etihad", earnRules: [{ id: "b", label: "Base", unitsPerAED: 2 / 3, match: {} }] });
  const flight = tx({ amount: 1000, merchantId: "emirates", merchantName: "Emirates", category: "airline" });

  it("cashback beats miles when it is worth more", () => {
    const r = recommend({ walletCards: [a, b, c], transaction: flight, activeOffers: [], valuations, now: NOW });
    expect(r.allCards.map((x) => [x.cardId, x.totalEstimatedAEDValue])).toEqual([
      ["B", 30],
      ["C", 23.35],
      ["A", 22.5],
    ]);
    expect(r.allCards[1].baseReward.quantity).toBe(667);
    expect(r.allCards[2].baseReward.quantity).toBe(500);
  });

  it("an active 3X promotion moves card A to #1 and is flagged as a deal highlight", () => {
    const promo = offer({ id: "3x", offerType: "multiplier", multiplier: 3, cardIds: ["A"], merchants: ["emirates"] });
    const r = recommend({ walletCards: [a, b, c], transaction: flight, activeOffers: dedupeOffers([promo]), valuations, now: NOW });
    expect(r.bestCard?.cardId).toBe("A");
    expect(r.bestCard?.totalEstimatedAEDValue).toBe(67.5);
    expect(r.bestCard?.promotionalRewards[0].quantity).toBe(1000);
    expect(r.dealHighlights).toEqual([{ cardId: "A", offerIds: ["3x"], rankWithout: 3, rankWith: 1 }]);
  });

  it("an expired promotion never affects the ranking", () => {
    const promo = offer({ id: "3x", offerType: "multiplier", multiplier: 3, cardIds: ["A"], startDate: "2026-08-01", endDate: "2026-09-30" });
    const r = recommend({ walletCards: [a, b, c], transaction: flight, activeOffers: dedupeOffers([promo]), valuations, now: NOW });
    expect(r.bestCard?.cardId).toBe("B");
  });
});

// ---------------------------------------------------------------------------
// Rule selection, caps, tiers
// ---------------------------------------------------------------------------
describe("earning rules", () => {
  const c = card({
    id: "c",
    rewardCurrencyId: "aed_cash",
    capGroups: [{ id: "cap", label: "Monthly cap (AED 50)", cap: 50, period: "monthly" }],
    earnRules: [
      { id: "base", label: "Base", unitsPerAED: 0.01, match: {} },
      { id: "dining", label: "Dining", unitsPerAED: 0.05, match: { categories: ["dining"] }, capGroupId: "cap" },
      { id: "gov", label: "Government", unitsPerAED: 0, match: { categories: ["government"] } },
      { id: "tier", label: "Groceries 8% (AED 5k spend)", unitsPerAED: 0.08, match: { categories: ["groceries"] }, minMonthlySpendAED: 5000 },
      { id: "intl", label: "International", unitsPerAED: 0.02, match: { region: "international" } },
    ],
  });

  it("a more specific lower rate overrides the base rate", () => {
    expect(calc(c, tx({ category: "government" })).totalEstimatedAEDValue).toBe(0);
  });

  it("applies monthly caps using tracked usage", () => {
    expect(calc(c, tx({ category: "dining", amount: 2000 })).totalEstimatedAEDValue).toBe(50);
    const r = calc(c, tx({ category: "dining", amount: 400 }), [], { registeredOfferIds: [], cards: { c: { capUsage: { cap: 40 } } } });
    expect(r.totalEstimatedAEDValue).toBe(10);
    expect(r.baseReward.capApplied).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/cap/i);
  });

  it("tiered rules apply only when monthly spend is known to qualify; otherwise reported as potential", () => {
    const unknown = calc(c, tx({ category: "groceries", amount: 100 }));
    expect(unknown.totalEstimatedAEDValue).toBe(1);
    expect(unknown.potential.totalEstimatedAEDValue).toBe(8);
    expect(unknown.confidence).toBe("conditional");
    const met = calc(c, tx({ category: "groceries", amount: 100 }), [], { registeredOfferIds: [], cards: { c: { monthlySpendAED: 6000 } } });
    expect(met.totalEstimatedAEDValue).toBe(8);
    const notMet = calc(c, tx({ category: "groceries", amount: 100 }), [], { registeredOfferIds: [], cards: { c: { monthlySpendAED: 1000 } } });
    expect(notMet.totalEstimatedAEDValue).toBe(1);
    expect(notMet.potential.extraAEDValue).toBe(0);
  });

  it("deducts foreign transaction fees on international spend", () => {
    const r = calc({ ...c, foreignTransactionFeePct: 2.5 }, tx({ amount: 1000, region: "international" }));
    expect(r.totalEstimatedAEDValue).toBe(20 - 25);
    expect(r.fees[0].estimatedAEDValue).toBe(-25);
  });
});

// ---------------------------------------------------------------------------
// Offers, stacking and deduplication
// ---------------------------------------------------------------------------
describe("offers & stacking", () => {
  const c = card({ id: "c", rewardCurrencyId: "aed_cash", earnRules: [{ id: "base", label: "Base", unitsPerAED: 0.02, match: {} }] });
  const t = tx({ amount: 200, merchantId: "m", category: "retail" });
  const cashback = (stackingRule: CardOffer["stackingRule"], rate = 0.1) =>
    offer({ id: `cb_${stackingRule}`, offerType: "cashback", rate, cardIds: ["c"], merchants: ["m"], stackingRule });

  it("stack: base + offer", () => {
    expect(calc(c, t, [cashback("stack")]).totalEstimatedAEDValue).toBe(24);
  });
  it("replace_base: offer replaces standard earning", () => {
    const r = calc(c, t, [cashback("replace_base")]);
    expect(r.totalEstimatedAEDValue).toBe(20);
    expect(r.baseReward.estimatedAEDValue).toBe(0);
  });
  it("best_of: the higher of base and offer", () => {
    expect(calc(c, t, [cashback("best_of")]).totalEstimatedAEDValue).toBe(20);
    expect(calc(c, t, [cashback("best_of", 0.01)]).totalEstimatedAEDValue).toBe(4);
  });
  it("unknown: never assumes stacking; shows the stacked amount as potential", () => {
    const r = calc(c, t, [cashback("unknown")]);
    expect(r.totalEstimatedAEDValue).toBe(20);
    expect(r.potential.totalEstimatedAEDValue).toBe(24);
    expect(r.confidence).toBe("conditional");
    expect(r.potential.reasons.join(" ")).toMatch(/unconfirmed/);
  });

  it("registration-required offers are conditional until the user marks them registered", () => {
    const o = offer({ ...cashback("stack"), id: "reg", registrationRequired: true });
    const before = calc(c, t, [o]);
    expect(before.totalEstimatedAEDValue).toBe(4);
    expect(before.potential.totalEstimatedAEDValue).toBe(24);
    expect(before.confidence).toBe("conditional");
    expect(before.conditionalOffers[0].conditions).toContain("Registration required");
    const after = calc(c, t, [o], { registeredOfferIds: ["reg"], cards: {} });
    expect(after.totalEstimatedAEDValue).toBe(24);
    expect(after.confidence).toBe("exact");
  });

  it("never double counts the same campaign published by a bank and a merchant", () => {
    const bank = offer({ ...cashback("stack"), id: "bank", canonicalOfferId: "camp", sourceType: "bank" });
    const merchant = offer({ ...cashback("stack"), id: "merchant", canonicalOfferId: "camp", sourceType: "merchant", publisher: "Merchant" });
    const r = calc(c, t, [merchant, bank]);
    expect(r.totalEstimatedAEDValue).toBe(24);
    expect(r.appliedOffers.map((o) => o.id)).toEqual(["bank"]);
    expect(r.dataFreshness.sources.some((s) => s.publisher === "Merchant")).toBe(true);
  });

  it("deduplicates identical offers even without a canonical id", () => {
    const one = cashback("stack");
    const two = { ...one, id: "copy", sourceType: "merchant" as const };
    expect(dedupeOffers([one, two])).toHaveLength(1);
    expect(calc(c, t, [one, two]).totalEstimatedAEDValue).toBe(24);
  });

  it("merchant discounts reduce the charged amount before earning", () => {
    const d = offer({ id: "d", offerType: "discount", rate: 0.1, merchants: ["m"] });
    const r = calc(c, t, [d]);
    // 20 off; base 2% on 180 = 3.60
    expect(r.discounts[0].estimatedAEDValue).toBe(20);
    expect(r.baseReward.estimatedAEDValue).toBe(3.6);
    expect(r.totalEstimatedAEDValue).toBe(23.6);
  });

  it("respects minimum spend, caps, card/network matching and payment methods", () => {
    const min = offer({ id: "min", offerType: "fixed_reward", fixedValue: 30, minimumSpend: 250, cardIds: ["c"] });
    expect(calc(c, t, [min]).totalEstimatedAEDValue).toBe(4);
    expect(calc(c, tx({ ...t, amount: 300 }), [min]).totalEstimatedAEDValue).toBe(36);

    const capped = offer({ id: "cap", offerType: "cashback", rate: 0.5, rewardCap: 25, cardIds: ["c"] });
    expect(calc(c, t, [capped]).totalEstimatedAEDValue).toBe(29);

    const mc = offer({ id: "mc", offerType: "cashback", rate: 0.1, network: "Mastercard" });
    expect(calc(c, t, [mc]).appliedOffers).toHaveLength(0);
    const tier = offer({ id: "tier", offerType: "cashback", rate: 0.1, network: "Visa", networkTiers: ["Visa Infinite"] });
    expect(calc(c, t, [tier]).appliedOffers).toHaveLength(0);

    const pay = offer({ id: "pay", offerType: "cashback", rate: 0.1, cardIds: ["c"], paymentMethodRestrictions: ["Apple Pay"] });
    expect(calc(c, t, [pay]).confidence).toBe("conditional");
    expect(calc(c, { ...t, paymentMethod: "Apple Pay" }, [pay]).totalEstimatedAEDValue).toBe(24);
    expect(calc(c, { ...t, paymentMethod: "Physical card" }, [pay]).conditionalOffers).toHaveLength(0);
  });

  it("multipliers add (N-1)× the standard rate and are dropped when base is replaced", () => {
    const miles = card({ id: "c", rewardCurrencyId: "etihad", earnRules: [{ id: "base", label: "Base", unitsPerAED: 1, match: {} }] });
    const m = offer({ id: "5x", offerType: "multiplier", multiplier: 5, cardIds: ["c"] });
    const r = calc(miles, t, [m]);
    expect(r.baseReward.quantity).toBe(200);
    expect(r.promotionalRewards[0].quantity).toBe(800);
    expect(r.totalEstimatedAEDValue).toBe(35);
    const rep = offer({ id: "rep", offerType: "bonus_miles", rate: 10, cardIds: ["c"], stackingRule: "replace_base" });
    const r2 = calc(miles, t, [m, rep]);
    expect(r2.totalEstimatedAEDValue).toBe(70);
    expect(r2.skippedOffers.map((s) => s.offer.id)).toContain("5x");
  });
});

describe("explainability", () => {
  it("produces a step-by-step breakdown ending in the total", () => {
    const c = card({ id: "c", rewardCurrencyId: "etihad", earnRules: [{ id: "b", label: "Base", unitsPerAED: 1, match: {} }] });
    const r = calc(c, tx({ amount: 200, merchantId: "m", merchantName: "Shop" }), [
      offer({ id: "5x", title: "5X miles", offerType: "multiplier", multiplier: 3, cardIds: ["c"] }),
    ]);
    const labels = r.steps.map((s) => s.label);
    expect(labels[0]).toBe("Purchase");
    expect(labels).toContain("Standard earning");
    expect(labels).toContain("Total miles");
    expect(labels).toContain("Estimated mile value");
    expect(r.steps.at(-1)?.kind).not.toBe(undefined);
    const total = r.steps.find((s) => s.kind === "total");
    expect(total?.value).toBe("AED 21.00");
  });
});

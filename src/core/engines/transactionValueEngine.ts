import { CASH_CURRENCY_ID, DATA_STATUS_ORDER } from "../domain/constants";
import type {
  BenefitComponent,
  BenefitType,
  CalculationStep,
  Card,
  CardOffer,
  DataSource,
  DataStatus,
  OfferEvaluation,
  ResultConfidence,
  RewardCurrency,
  Transaction,
  TransactionValueResult,
  UserRewardState,
} from "../domain/types";
import {
  formatAED,
  formatAEDPerUnit,
  formatNumber,
  formatPercent,
  formatRewardQuantity,
  formatValuationRate,
  round2,
  ruleRateDisplay,
} from "../format";
import { parseDate } from "../time";
import { type DedupedOffer, evaluateOffer } from "./offerEligibilityEngine";
import { type BaseRewardResult, computeBaseReward } from "./rewardEngine";
import { roundUnits, type ValuationEngine } from "./valuationEngine";

/**
 * calculateTransactionValue — the heart of the product.
 *
 * For one card and one transaction it returns every benefit (base earning,
 * promotions, merchant discounts, fees) in its NATIVE form (miles, points, AED)
 * plus a normalised AED value, and sums them into `totalEstimatedAEDValue`,
 * which is the only metric used for ranking.
 *
 * Two scenarios are computed:
 *  - confirmed: only benefits the user will receive without further action;
 *    offers with unknown stacking are treated conservatively (best-of).
 *  - potential: also includes conditional offers (registration, promo codes,
 *    payment-method restrictions, unverified spend tiers) and assumes unknown
 *    stacking turns out favourable. The difference is shown as "potential value".
 */

export interface CalculateTransactionValueInput {
  card: Card;
  transaction: Transaction;
  /** Active, de-duplicated offers. Eligibility for this card is evaluated here. */
  activeOffers: DedupedOffer[];
  rewardValuations: ValuationEngine;
  userRewardState?: UserRewardState;
  now?: Date;
}

interface ScenarioOptions {
  includeOffers: boolean;
  includeConditional: boolean;
  unknownStacks: boolean;
}

interface OfferValue {
  evaluation: OfferEvaluation;
  benefit: BenefitComponent;
  /** Multipliers depend on standard earning being paid. */
  dependsOnBase: boolean;
}

interface Scenario {
  amount: number;
  chargedAmount: number;
  discount?: OfferValue;
  base: BaseRewardResult;
  baseBenefit: BenefitComponent;
  baseCounted: boolean;
  counted: OfferValue[];
  skipped: { offer: CardOffer; reason: string }[];
  fee?: BenefitComponent;
  benefits: BenefitComponent[];
  total: number;
  low: number;
  high: number;
}

function benefitTypeFor(currency: RewardCurrency | undefined, fallback: BenefitType = "other"): BenefitType {
  if (!currency) return fallback;
  switch (currency.type) {
    case "cash":
      return "cashback";
    case "airline_miles":
      return "miles";
    case "bank_points":
    case "hotel_points":
      return "points";
    default:
      return "other";
  }
}

function confidenceOf(currencyConfidence: ResultConfidence, conditional: boolean): ResultConfidence {
  return conditional ? "conditional" : currencyConfidence;
}

function makeUnitsBenefit(
  engine: ValuationEngine,
  args: {
    quantity: number;
    currencyId: string;
    label: string;
    origin: BenefitComponent["origin"];
    offerId?: string;
    explanation: string;
    conditional?: boolean;
    source?: string;
    typeOverride?: BenefitType;
  },
): { benefit: BenefitComponent; missingValuation: boolean } {
  const currency = engine.getCurrency(args.currencyId);
  const valued = engine.value(args.quantity, args.currencyId);
  return {
    missingValuation: valued.missing,
    benefit: {
      type: args.typeOverride ?? benefitTypeFor(currency),
      label: args.label,
      origin: args.origin,
      offerId: args.offerId,
      quantity: args.quantity,
      currency: currency?.type === "cash" ? "AED" : currency?.name ?? args.currencyId,
      currencyId: args.currencyId,
      monetaryValueAED: valued.aed,
      lowValueAED: valued.low,
      highValueAED: valued.high,
      valuationRate: valued.valuation?.aedValuePerUnit,
      valuationConfidence: confidenceOf(valued.valuation?.resultConfidence ?? "estimated", !!args.conditional),
      source: args.source,
      explanation: args.explanation,
    },
  };
}

function offerSource(offer: CardOffer): string {
  return offer.publisher;
}

/** Value one reward-type offer (everything except merchant discounts). */
function valueRewardOffer(
  evaluation: OfferEvaluation,
  card: Card,
  chargedAmount: number,
  base: BaseRewardResult,
  engine: ValuationEngine,
): OfferValue | undefined {
  const offer = evaluation.offer;
  const conditional = evaluation.status === "conditional";
  const eligibleSpend = Math.min(chargedAmount, offer.maximumSpend ?? Number.POSITIVE_INFINITY);
  const capNote = (applied: boolean) => (applied && offer.rewardCap !== undefined ? ` (capped at ${formatNumber(offer.rewardCap)})` : "");

  const mk = (quantity: number, currencyId: string, explanation: string, dependsOnBase = false, typeOverride?: BenefitType) => {
    const currency = engine.getCurrency(currencyId);
    const rounded = roundUnits(quantity, currency);
    const { benefit } = makeUnitsBenefit(engine, {
      quantity: rounded,
      currencyId,
      label: offer.title,
      origin: "offer",
      offerId: offer.id,
      explanation,
      conditional,
      source: offerSource(offer),
      typeOverride,
    });
    return { evaluation, benefit, dependsOnBase };
  };

  const capped = (q: number) => {
    if (offer.rewardCap !== undefined && q > offer.rewardCap) return { q: offer.rewardCap, applied: true };
    return { q, applied: false };
  };

  switch (offer.offerType) {
    case "cashback": {
      const currencyId = offer.rewardCurrencyId ?? CASH_CURRENCY_ID;
      const { q, applied } = capped(eligibleSpend * (offer.rate ?? 0));
      return mk(q, currencyId, `${formatPercent(offer.rate ?? 0)} cashback on ${formatAED(eligibleSpend)}${capNote(applied)}`);
    }
    case "bonus_points":
    case "bonus_miles": {
      const currencyId = offer.rewardCurrencyId ?? card.rewardCurrencyId;
      const { q, applied } = capped(eligibleSpend * (offer.rate ?? 0));
      return mk(q, currencyId, `${formatNumber(offer.rate ?? 0, 2)} bonus per AED 1 on ${formatAED(eligibleSpend)}${capNote(applied)}`);
    }
    case "multiplier": {
      const m = offer.multiplier ?? 1;
      if (m <= 1 || base.unitsPerAED <= 0) return undefined;
      const bonusRaw = eligibleSpend * base.unitsPerAED * (m - 1);
      const { q, applied } = capped(bonusRaw);
      return mk(
        q,
        card.rewardCurrencyId,
        `${formatNumber(m, 1)}X promotion: ${formatNumber(m - 1, 1)}× the standard rate as bonus${capNote(applied)}`,
        true,
      );
    }
    case "fixed_reward": {
      const currencyId = offer.rewardCurrencyId ?? CASH_CURRENCY_ID;
      return mk(offer.fixedValue ?? 0, currencyId, `Fixed reward for qualifying spend${offer.minimumSpend ? ` of AED ${formatNumber(offer.minimumSpend)}+` : ""}`);
    }
    case "statement_credit": {
      const currencyId = offer.rewardCurrencyId ?? CASH_CURRENCY_ID;
      return mk(offer.fixedValue ?? 0, currencyId, "Statement credit", false, "statement_credit");
    }
    default:
      return undefined;
  }
}

function valueDiscount(evaluation: OfferEvaluation, amount: number, engine: ValuationEngine): OfferValue {
  const offer = evaluation.offer;
  const eligibleSpend = Math.min(amount, offer.maximumSpend ?? Number.POSITIVE_INFINITY);
  let value = offer.fixedValue ?? eligibleSpend * (offer.rate ?? 0);
  if (offer.rewardCap !== undefined) value = Math.min(value, offer.rewardCap);
  value = Math.min(round2(value), amount);
  const { benefit } = makeUnitsBenefit(engine, {
    quantity: value,
    currencyId: CASH_CURRENCY_ID,
    label: offer.title,
    origin: "offer",
    offerId: offer.id,
    explanation: offer.rate
      ? `${formatPercent(offer.rate)} off at checkout${offer.rewardCap !== undefined ? ` (max ${formatAED(offer.rewardCap)})` : ""}`
      : `${formatAED(value)} off at checkout`,
    conditional: evaluation.status === "conditional",
    source: offer.publisher,
    typeOverride: "discount",
  });
  return { evaluation, benefit, dependsOnBase: false };
}

function computeScenario(
  input: CalculateTransactionValueInput,
  evaluations: OfferEvaluation[],
  opts: ScenarioOptions,
): Scenario {
  const { card, transaction: tx, rewardValuations: engine, userRewardState } = input;
  const currency = engine.getCurrency(card.rewardCurrencyId);
  const skipped: Scenario["skipped"] = [];

  const usable = opts.includeOffers
    ? evaluations.filter((e) => e.status === "eligible" || (opts.includeConditional && e.status === "conditional"))
    : [];

  // 1. Merchant discounts reduce what is charged to the card. Only the best single discount applies.
  const discounts = usable
    .filter((e) => e.offer.offerType === "discount")
    .map((e) => valueDiscount(e, tx.amount, engine))
    .sort((a, b) => b.benefit.monetaryValueAED - a.benefit.monetaryValueAED);
  const discount = discounts[0]?.benefit.monetaryValueAED ? discounts[0] : undefined;
  for (const d of discounts.slice(discount ? 1 : 0)) {
    skipped.push({ offer: d.evaluation.offer, reason: "Only one merchant discount can be applied to a purchase" });
  }
  const chargedAmount = Math.max(0, tx.amount - (discount?.benefit.monetaryValueAED ?? 0));

  // 2. Standard earning on the amount actually charged.
  const base = computeBaseReward(card, tx, chargedAmount, currency, userRewardState, {
    assumeTierMet: opts.includeConditional,
  });
  const { benefit: baseBenefit } = makeUnitsBenefit(engine, {
    quantity: base.quantity,
    currencyId: card.rewardCurrencyId,
    label: base.rule ? `Standard earning — ${base.rule.label}` : "Standard earning",
    origin: "base",
    explanation: base.rule && currency ? `${ruleRateDisplay(base.rule, currency)} on ${formatAED(chargedAmount)}` : "No matching earn rule",
    source: card.name,
  });

  // 3. Promotional rewards.
  const rewardValues = usable
    .filter((e) => e.offer.offerType !== "discount")
    .map((e) => valueRewardOffer(e, card, chargedAmount, base, engine))
    .filter((v): v is OfferValue => !!v)
    .sort((a, b) => b.benefit.monetaryValueAED - a.benefit.monetaryValueAED);

  const isStacker = (v: OfferValue) =>
    v.evaluation.offer.offerType === "multiplier" ||
    v.evaluation.offer.stackingRule === "stack" ||
    (opts.unknownStacks && v.evaluation.offer.stackingRule === "unknown");
  const stackers = rewardValues.filter(isStacker);
  const replacers = rewardValues.filter((v) => !isStacker(v) && v.evaluation.offer.stackingRule === "replace_base");
  const competitors = rewardValues.filter(
    (v) => !isStacker(v) && (v.evaluation.offer.stackingRule === "best_of" || v.evaluation.offer.stackingRule === "unknown"),
  );

  // "core" is the single non-stacking reward: standard earning, or an offer that replaces/outbids it.
  let core: { kind: "base" } | { kind: "offer"; value: OfferValue } = { kind: "base" };
  let coreValue = baseBenefit.monetaryValueAED;
  if (replacers.length) {
    core = { kind: "offer", value: replacers[0] };
    coreValue = replacers[0].benefit.monetaryValueAED;
    for (const r of replacers.slice(1)) skipped.push({ offer: r.evaluation.offer, reason: "Does not combine with a better replacement offer" });
  }
  for (const c of competitors) {
    if (c.benefit.monetaryValueAED > coreValue) {
      if (core.kind === "offer") skipped.push({ offer: core.value.evaluation.offer, reason: `Lower than "${c.evaluation.offer.title}" — offers don't combine` });
      core = { kind: "offer", value: c };
      coreValue = c.benefit.monetaryValueAED;
    } else {
      const reason =
        c.evaluation.offer.stackingRule === "unknown"
          ? "Stacking with standard earning is unconfirmed — counted the higher of the two"
          : "Standard earning is higher and this offer doesn't combine with it";
      skipped.push({ offer: c.evaluation.offer, reason });
    }
  }
  const baseCounted = core.kind === "base";
  const counted: OfferValue[] = [];
  if (core.kind === "offer") counted.push(core.value);
  for (const s of stackers) {
    if (s.dependsOnBase && !baseCounted) {
      skipped.push({ offer: s.evaluation.offer, reason: "Multiplier applies to standard earning, which another offer replaces" });
      continue;
    }
    counted.push(s);
  }

  // 4. Fees (foreign transaction fee on international spend).
  let fee: BenefitComponent | undefined;
  if (tx.region === "international" && card.foreignTransactionFeePct) {
    const amount = round2((chargedAmount * card.foreignTransactionFeePct) / 100);
    if (amount > 0) {
      fee = {
        type: "fee",
        label: "Foreign transaction fee",
        origin: "fee",
        quantity: amount,
        currency: "AED",
        currencyId: CASH_CURRENCY_ID,
        monetaryValueAED: -amount,
        lowValueAED: -amount,
        highValueAED: -amount,
        valuationConfidence: "exact",
        source: card.name,
        explanation: `${formatNumber(card.foreignTransactionFeePct, 2)}% of ${formatAED(chargedAmount)}`,
      };
    }
  }

  const benefits: BenefitComponent[] = [];
  if (discount) benefits.push(discount.benefit);
  if (baseCounted) benefits.push(baseBenefit);
  benefits.push(...counted.map((c) => c.benefit));
  if (fee) benefits.push(fee);

  const sum = (k: "monetaryValueAED" | "lowValueAED" | "highValueAED") => benefits.reduce((acc, b) => acc + b[k], 0);
  return {
    amount: tx.amount,
    chargedAmount,
    discount,
    base,
    baseBenefit,
    baseCounted,
    counted,
    skipped,
    fee,
    benefits,
    total: sum("monetaryValueAED"),
    low: sum("lowValueAED"),
    high: sum("highValueAED"),
  };
}

function worstStatus(statuses: DataStatus[]): DataStatus {
  let worst = 0;
  for (const s of statuses) worst = Math.max(worst, DATA_STATUS_ORDER.indexOf(s));
  return DATA_STATUS_ORDER[worst];
}

function oldest(dates: (string | undefined)[]): string | undefined {
  const valid = dates.filter((d): d is string => !!d);
  if (!valid.length) return undefined;
  return valid.reduce((a, b) => (parseDate(a) <= parseDate(b) ? a : b));
}

function buildSteps(
  input: CalculateTransactionValueInput,
  s: Scenario,
): { steps: CalculationStep[]; explanation: string[] } {
  const { card, transaction: tx, rewardValuations: engine } = input;
  const steps: CalculationStep[] = [];
  const explanation: string[] = [];
  const where = tx.merchantName ? ` at ${tx.merchantName}` : "";
  steps.push({
    label: "Purchase",
    value: formatAED(tx.amount),
    detail: `${where.trim() || "Unspecified merchant"}${tx.originalCurrency ? ` · ${formatNumber(tx.originalAmount ?? 0, 2)} ${tx.originalCurrency} converted` : ""}${tx.region === "international" ? " · international" : ""}`,
    kind: "input",
  });

  if (s.discount) {
    steps.push({
      label: "Merchant discount",
      value: `−${formatAED(s.discount.benefit.monetaryValueAED)}`,
      detail: `${s.discount.evaluation.offer.title} · you pay ${formatAED(s.chargedAmount)}`,
      kind: "offer",
    });
    explanation.push(`${s.discount.evaluation.offer.title}: ${formatAED(s.discount.benefit.monetaryValueAED)} off.`);
  }

  // Group counted reward units by currency so "200 miles + 400 bonus = 600 miles" reads naturally.
  const unitBenefits = s.benefits.filter((b) => b.type !== "discount" && b.type !== "fee");
  const byCurrency = new Map<string, BenefitComponent[]>();
  for (const b of unitBenefits) {
    const k = b.currencyId ?? "?";
    byCurrency.set(k, [...(byCurrency.get(k) ?? []), b]);
  }
  if (!s.baseCounted) {
    steps.push({ label: "Standard earning", value: "Not paid", detail: "Replaced by the promotion below", kind: "earn" });
  }
  for (const [currencyId, items] of byCurrency) {
    const currency = engine.getCurrency(currencyId);
    if (!currency) continue;
    for (const b of items) {
      const isBase = b.origin === "base";
      steps.push({
        label: isBase ? "Standard earning" : `Promotion: ${b.label}`,
        value: `${isBase ? "" : "+"}${formatRewardQuantity(b.quantity ?? 0, currency)}`,
        detail: b.explanation,
        kind: isBase ? "earn" : "offer",
      });
    }
    const qty = items.reduce((a, b) => a + (b.quantity ?? 0), 0);
    if (items.length > 1) {
      steps.push({ label: `Total ${currency.type === "cash" ? "cashback" : currency.unitPlural.toLowerCase()}`, value: formatRewardQuantity(qty, currency), kind: "subtotal" });
    }
    if (currency.type !== "cash") {
      const v = engine.resolve(currencyId)!;
      const value = items.reduce((a, b) => a + b.monetaryValueAED, 0);
      steps.push({
        label: `Estimated ${currency.unitSingular.toLowerCase()} value`,
        value: `${formatAEDPerUnit(v.aedValuePerUnit)} / ${currency.unitSingular.toLowerCase()}`,
        detail: `${formatValuationRate(v.aedValuePerUnit, currency)} · ${v.isUserDefined ? "your personal valuation" : `${v.method.replace(/_/g, " ")}, ${v.confidence} confidence`}`,
        kind: "valuation",
      });
      steps.push({
        label: "Estimated reward value",
        value: formatAED(value),
        detail: `${formatNumber(qty)} × ${formatAEDPerUnit(v.aedValuePerUnit)}`,
        kind: "subtotal",
      });
      explanation.push(`${formatRewardQuantity(qty, currency)} ≈ ${formatAED(value)} estimated value.`);
    } else {
      explanation.push(`${formatAED(qty)} cashback.`);
    }
  }

  if (s.fee) {
    steps.push({ label: "Foreign transaction fee", value: `−${formatAED(-s.fee.monetaryValueAED)}`, detail: s.fee.explanation, kind: "fee" });
    explanation.push(`Foreign transaction fee of ${formatAED(-s.fee.monetaryValueAED)} deducted.`);
  }
  if (s.base.rule && s.baseCounted) {
    const currency = engine.getCurrency(card.rewardCurrencyId);
    if (currency) explanation.unshift(`${s.base.rule.label}: ${ruleRateDisplay(s.base.rule, currency)}.`);
  }
  for (const c of s.counted) explanation.push(`Offer applied: ${c.evaluation.offer.title}.`);
  steps.push({ label: "Total estimated benefit", value: formatAED(s.total), kind: "total" });
  return { steps, explanation };
}

export function calculateTransactionValue(input: CalculateTransactionValueInput): TransactionValueResult {
  const { card, transaction: tx, rewardValuations: engine, userRewardState } = input;
  const now = input.now ?? new Date();
  const currency = engine.getCurrency(card.rewardCurrencyId);
  const warnings: string[] = [];

  const evaluations = input.activeOffers.map((d) => evaluateOffer(d, card, tx, userRewardState, now));
  const relevant = evaluations.filter((e) => e.status !== "ineligible");

  const confirmed = computeScenario(input, relevant, { includeOffers: true, includeConditional: false, unknownStacks: false });
  const potential = computeScenario(input, relevant, { includeOffers: true, includeConditional: true, unknownStacks: true });
  const baseOnly = computeScenario(input, [], { includeOffers: false, includeConditional: false, unknownStacks: false });

  warnings.push(...confirmed.base.warnings);
  if (!currency) warnings.push(`Unknown reward currency "${card.rewardCurrencyId}" — rewards valued at AED 0.`);
  else if (currency.type !== "cash" && (engine.resolve(currency.id)?.aedValuePerUnit ?? 0) <= 0) {
    warnings.push(`No verified valuation for ${currency.name} yet — its rewards are counted as AED 0. Set your own value in Settings.`);
  }

  const extra = round2(Math.max(0, potential.total - confirmed.total));
  const potentialReasons: string[] = [];
  const potentialOfferIds: string[] = [];
  if (extra > 0) {
    for (const e of relevant.filter((r) => r.status === "conditional")) {
      if (potential.counted.some((c) => c.evaluation.offer.id === e.offer.id) || potential.discount?.evaluation.offer.id === e.offer.id) {
        potentialReasons.push(`${e.offer.title}: ${e.conditions.join(", ")}`);
        potentialOfferIds.push(e.offer.id);
      }
    }
    for (const c of potential.counted) {
      if (c.evaluation.offer.stackingRule === "unknown") {
        potentialReasons.push(`${c.evaluation.offer.title}: may stack with standard earning (unconfirmed)`);
        potentialOfferIds.push(c.evaluation.offer.id);
      }
    }
    if (potential.base.rule && confirmed.base.rule && potential.base.rule.id !== confirmed.base.rule.id) {
      potentialReasons.push(`${potential.base.rule.label}: requires AED ${formatNumber(potential.base.rule.minMonthlySpendAED ?? 0)} monthly spend`);
    }
  }

  const { steps, explanation } = buildSteps(input, confirmed);
  for (const n of confirmed.base.notes) steps.push({ label: "Note", value: "", detail: n, kind: "note" });
  for (const sk of confirmed.skipped) {
    if (!potentialOfferIds.includes(sk.offer.id)) steps.push({ label: "Not counted", value: sk.offer.title, detail: sk.reason, kind: "note" });
  }

  const appliedOffers = [
    ...(confirmed.discount ? [confirmed.discount.evaluation.offer] : []),
    ...confirmed.counted.map((c) => c.evaluation.offer),
  ];

  const counted = confirmed.benefits;
  let confidence: ResultConfidence = counted.some((b) => b.valuationConfidence !== "exact") ? "estimated" : "exact";
  if (extra > 0) confidence = "conditional";

  const valuationOf = currency ? engine.resolve(currency.id) : undefined;
  const sources: DataSource[] = [
    ...(card.sources ?? []),
    ...(confirmed.base.rule?.sources ?? []),
    ...appliedOffers.flatMap((o) => o.sources?.length ? o.sources : [{ url: o.sourceUrl, publisher: o.publisher, retrievedAt: o.lastVerifiedAt }]),
    ...(valuationOf && currency?.type !== "cash"
      ? (currency?.valuation.sourceUrls ?? []).map((url) => ({ url, publisher: `${currency?.name} valuation`, retrievedAt: valuationOf.lastUpdatedAt }))
      : []),
  ];

  const statuses: DataStatus[] = [card.dataStatus, ...appliedOffers.map((o) => o.dataStatus)];
  if (currency && currency.type !== "cash") statuses.push(currency.valuation.dataStatus);

  const promotional = confirmed.counted.map((c) => ({
    title: c.evaluation.offer.title,
    offerId: c.evaluation.offer.id,
    quantity: c.benefit.quantity,
    currency: c.benefit.currency,
    currencyId: c.benefit.currencyId,
    estimatedAEDValue: round2(c.benefit.monetaryValueAED),
  }));

  return {
    cardId: card.id,
    baseReward: {
      quantity: confirmed.baseCounted ? confirmed.base.quantity : 0,
      currency: currency?.name ?? card.rewardCurrencyId,
      currencyId: card.rewardCurrencyId,
      estimatedAEDValue: confirmed.baseCounted ? round2(confirmed.baseBenefit.monetaryValueAED) : 0,
      ruleId: confirmed.base.rule?.id,
      ruleLabel: confirmed.base.rule?.label,
      capApplied: confirmed.base.capApplied,
    },
    promotionalRewards: promotional,
    discounts: confirmed.discount
      ? [{ title: confirmed.discount.evaluation.offer.title, offerId: confirmed.discount.evaluation.offer.id, estimatedAEDValue: round2(confirmed.discount.benefit.monetaryValueAED) }]
      : [],
    fees: confirmed.fee ? [{ title: confirmed.fee.label, estimatedAEDValue: round2(confirmed.fee.monetaryValueAED) }] : [],
    benefits: counted.map((b) => ({ ...b, monetaryValueAED: round2(b.monetaryValueAED), lowValueAED: round2(b.lowValueAED), highValueAED: round2(b.highValueAED) })),
    totalEstimatedAEDValue: round2(confirmed.total),
    valueRange: { low: round2(confirmed.low), high: round2(confirmed.high) },
    potential: {
      totalEstimatedAEDValue: round2(Math.max(potential.total, confirmed.total)),
      extraAEDValue: extra,
      reasons: [...new Set(potentialReasons)],
      offerIds: [...new Set(potentialOfferIds)],
    },
    baseOnlyAEDValue: round2(baseOnly.total),
    effectiveReturnPercentage: tx.amount > 0 ? round2((confirmed.total / tx.amount) * 100) : 0,
    explanation,
    steps,
    warnings,
    confidence,
    appliedOffers,
    conditionalOffers: relevant.filter((e) => e.status === "conditional"),
    skippedOffers: confirmed.skipped,
    dataFreshness: {
      lastVerifiedAt: oldest([card.lastVerifiedAt, confirmed.base.rule?.lastVerifiedAt, ...appliedOffers.map((o) => o.lastVerifiedAt)]),
      lastCheckedAt: oldest([card.lastCheckedAt]),
      dataStatus: worstStatus(statuses),
      sources,
    },
  };
}

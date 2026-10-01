import type { CapGroup, Card, EarnRule, RewardCurrency, Transaction, UserRewardState } from "../domain/types";
import { roundUnits } from "./valuationEngine";

/**
 * Reward engine: works out what a card's *standard* earning structure pays for
 * a transaction (before any promotions).
 *
 * Rule selection: the most specific matching rule wins (merchant > MCC >
 * category > base), so a lower government/utilities rate correctly overrides a
 * generous base rate. Ties are broken by the higher rate. Tiered rules that
 * require a minimum monthly spend only apply when the user's spend is known to
 * meet the threshold; otherwise they are reported as a conditional upside.
 */

export interface RuleMatch {
  rule: EarnRule;
  specificity: number;
}

export interface BaseRewardResult {
  rule?: EarnRule;
  unitsPerAED: number;
  /** Units before rounding and caps. */
  rawQuantity: number;
  /** Units after rounding and caps. */
  quantity: number;
  capApplied: boolean;
  capGroup?: CapGroup;
  capRemainingBefore?: number;
  capUsageKnown: boolean;
  notes: string[];
  warnings: string[];
  /** A better tiered rule whose monthly-spend condition could not be verified. */
  unverifiedTierRule?: EarnRule;
}

export function ruleMatches(rule: EarnRule, tx: Transaction): boolean {
  const m = rule.match;
  if (m.categories?.length && !m.categories.includes(tx.category)) return false;
  if (m.merchantIds?.length && !(tx.merchantId && m.merchantIds.includes(tx.merchantId))) return false;
  if (m.mccs?.length && !(tx.mcc && m.mccs.includes(tx.mcc))) return false;
  if (m.region && m.region !== "any" && m.region !== tx.region) return false;
  if (m.channel && m.channel !== "any" && m.channel !== tx.channel) return false;
  return true;
}

export function ruleSpecificity(rule: EarnRule): number {
  const m = rule.match;
  let s = 0;
  if (m.merchantIds?.length) s += 4;
  if (m.mccs?.length) s += 2;
  if (m.categories?.length) s += 1;
  if (m.region && m.region !== "any") s += 0.5;
  if (m.channel && m.channel !== "any") s += 0.25;
  return s;
}

type TierCheck = "met" | "not_met" | "unknown";

function tierStatus(rule: EarnRule, card: Card, userState?: UserRewardState): TierCheck {
  if (!rule.minMonthlySpendAED) return "met";
  const spend = userState?.cards[card.id]?.monthlySpendAED;
  if (spend === undefined) return "unknown";
  return spend >= rule.minMonthlySpendAED ? "met" : "not_met";
}

function pickBest(matches: RuleMatch[]): RuleMatch | undefined {
  return [...matches].sort((a, b) => b.specificity - a.specificity || b.rule.unitsPerAED - a.rule.unitsPerAED)[0];
}

export function selectEarnRule(
  card: Card,
  tx: Transaction,
  userState: UserRewardState | undefined,
  assumeTierMet: boolean,
): { chosen?: RuleMatch; unverifiedTier?: RuleMatch } {
  const matching = card.earnRules
    .filter((r) => ruleMatches(r, tx))
    .map((rule) => ({ rule, specificity: ruleSpecificity(rule), tier: tierStatus(rule, card, userState) }));

  const confirmed = matching.filter((m) => m.tier === "met");
  const optimistic = matching.filter((m) => m.tier === "met" || m.tier === "unknown");
  const chosenConfirmed = pickBest(confirmed);
  const chosenOptimistic = pickBest(optimistic);
  const unverifiedTier =
    chosenOptimistic && chosenOptimistic.rule !== chosenConfirmed?.rule ? chosenOptimistic : undefined;
  return { chosen: assumeTierMet ? chosenOptimistic : chosenConfirmed, unverifiedTier };
}

export function computeBaseReward(
  card: Card,
  tx: Transaction,
  eligibleAmount: number,
  currency: RewardCurrency | undefined,
  userState: UserRewardState | undefined,
  opts: { assumeTierMet: boolean },
): BaseRewardResult {
  const notes: string[] = [];
  const warnings: string[] = [];
  const { chosen, unverifiedTier } = selectEarnRule(card, tx, userState, opts.assumeTierMet);

  if (!chosen) {
    warnings.push("No earning rule matched this transaction — no standard rewards counted.");
    return { unitsPerAED: 0, rawQuantity: 0, quantity: 0, capApplied: false, capUsageKnown: true, notes, warnings };
  }
  const rule = chosen.rule;
  const rawQuantity = Math.max(0, eligibleAmount) * rule.unitsPerAED;
  let quantity = roundUnits(rawQuantity, currency);
  let capApplied = false;
  let capRemainingBefore: number | undefined;
  let capUsageKnown = true;

  const capGroup = rule.capGroupId ? card.capGroups?.find((g) => g.id === rule.capGroupId) : undefined;
  if (capGroup) {
    const usage = capGroup.period === "per_transaction" ? 0 : userState?.cards[card.id]?.capUsage?.[capGroup.id];
    capUsageKnown = capGroup.period === "per_transaction" || usage !== undefined;
    capRemainingBefore = Math.max(0, capGroup.cap - (usage ?? 0));
    if (quantity > capRemainingBefore) {
      quantity = roundUnits(capRemainingBefore, currency);
      capApplied = true;
      warnings.push(
        capRemainingBefore === 0
          ? `${capGroup.label} already reached — this purchase earns no standard rewards on this card.`
          : `${capGroup.label} limits standard rewards on this purchase.`,
      );
    } else if (!capUsageKnown) {
      notes.push(`Assumes the ${capGroup.label.toLowerCase()} has not been reached this period (update usage in Wallet).`);
    }
  }

  if (unverifiedTier && !opts.assumeTierMet) {
    notes.push(
      `A higher rate (${unverifiedTier.rule.label}) applies if your monthly spend on this card reaches AED ${unverifiedTier.rule.minMonthlySpendAED?.toLocaleString("en-AE")}.`,
    );
  }

  return {
    rule,
    unitsPerAED: rule.unitsPerAED,
    rawQuantity,
    quantity,
    capApplied,
    capGroup,
    capRemainingBefore,
    capUsageKnown,
    notes,
    warnings,
    unverifiedTierRule: unverifiedTier?.rule,
  };
}

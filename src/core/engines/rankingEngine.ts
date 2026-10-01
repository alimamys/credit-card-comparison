import type { Card, RecommendationResult, ResultConfidence, Transaction, TransactionValueResult, UserRewardState } from "../domain/types";
import type { DedupedOffer } from "./offerEligibilityEngine";
import { calculateTransactionValue } from "./transactionValueEngine";
import type { ValuationEngine } from "./valuationEngine";

/**
 * Ranking engine: ranks the user's own cards by totalEstimatedAEDValue.
 * Cards outside the wallet are evaluated separately ("You're missing out")
 * and are never mixed into the wallet ranking.
 */

const CONFIDENCE_ORDER: Record<ResultConfidence, number> = { exact: 0, estimated: 1, conditional: 2 };

export function compareResults(a: TransactionValueResult, b: TransactionValueResult): number {
  return (
    b.totalEstimatedAEDValue - a.totalEstimatedAEDValue ||
    // Equal value: prefer the more certain reward, then the larger potential upside.
    CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence] ||
    b.potential.totalEstimatedAEDValue - a.potential.totalEstimatedAEDValue ||
    a.cardId.localeCompare(b.cardId)
  );
}

export function rankResults(results: TransactionValueResult[]): TransactionValueResult[] {
  const sorted = [...results].sort(compareResults);
  const withoutOffers = [...results].sort(
    (a, b) => b.baseOnlyAEDValue - a.baseOnlyAEDValue || a.cardId.localeCompare(b.cardId),
  );
  const rankWithout = new Map(withoutOffers.map((r, i) => [r.cardId, i + 1]));
  return sorted.map((r, i) => ({ ...r, rank: i + 1, rankWithoutOffers: rankWithout.get(r.cardId) }));
}

export interface RecommendInput {
  walletCards: Card[];
  /** Other available cards, used only for the separate "missing out" section. */
  otherCards?: Card[];
  transaction: Transaction;
  activeOffers: DedupedOffer[];
  valuations: ValuationEngine;
  userRewardState?: UserRewardState;
  now?: Date;
  /** Minimum AED improvement before suggesting a card the user doesn't own. */
  missingOutThresholdAED?: number;
}

export function recommend(input: RecommendInput): RecommendationResult {
  const started = performance.now();
  const now = input.now ?? new Date();
  const calc = (card: Card) =>
    calculateTransactionValue({
      card,
      transaction: input.transaction,
      activeOffers: input.activeOffers,
      rewardValuations: input.valuations,
      userRewardState: input.userRewardState,
      now,
    });

  const allCards = rankResults(input.walletCards.map(calc));
  const bestCard = allCards[0];

  const dealHighlights = allCards
    .filter((r) => r.appliedOffers.length && r.rankWithoutOffers !== undefined && r.rankWithoutOffers > (r.rank ?? 0))
    .map((r) => ({
      cardId: r.cardId,
      offerIds: r.appliedOffers.map((o) => o.id),
      rankWithout: r.rankWithoutOffers!,
      rankWith: r.rank!,
    }));

  const potentialHighlights = allCards
    .filter((r) => r.potential.extraAEDValue > 0)
    .map((r) => {
      const others = allCards.filter((o) => o.cardId !== r.cardId);
      const wouldRank = 1 + others.filter((o) => o.totalEstimatedAEDValue > r.potential.totalEstimatedAEDValue).length;
      return { cardId: r.cardId, offerIds: r.potential.offerIds, potentialAEDValue: r.potential.totalEstimatedAEDValue, wouldRank };
    })
    .filter((h) => h.wouldRank < (allCards.find((r) => r.cardId === h.cardId)?.rank ?? 0));

  let missingOut: TransactionValueResult[] = [];
  if (input.otherCards?.length && bestCard) {
    const threshold = Math.max(input.missingOutThresholdAED ?? 2, bestCard.totalEstimatedAEDValue * 0.1);
    missingOut = input.otherCards
      .map(calc)
      .filter((r) => r.totalEstimatedAEDValue - bestCard.totalEstimatedAEDValue >= threshold)
      .sort(compareResults)
      .slice(0, 3);
  }

  return {
    transaction: input.transaction,
    bestCard,
    topThree: allCards.slice(0, 3),
    allCards,
    missingOut,
    potentialHighlights,
    dealHighlights,
    computedInMs: performance.now() - started,
    calculatedAt: now.toISOString(),
  };
}

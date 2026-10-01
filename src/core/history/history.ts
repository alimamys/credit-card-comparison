import type { ISODate, RecommendationResult, SpendCategory } from "../domain/types";
import { round2 } from "../format";
import { uaeDateOnly } from "../time";

/**
 * Historical value tracking: records which card the user tapped and what it
 * earned compared with a baseline, so the app can show cumulative value
 * ("Estimated extra value from choosing the recommended cards: AED 137").
 */

export interface HistoryEntry {
  id: string;
  date: ISODate;
  amount: number;
  merchantName?: string;
  category: SpendCategory;
  cardIdUsed: string;
  recommendedCardId?: string;
  valueAED: number;
  bestValueAED: number;
  /** Value the user would have received with their default card (or the wallet average). */
  baselineValueAED: number;
  baselineLabel: string;
}

export function createHistoryEntry(result: RecommendationResult, cardIdUsed: string, defaultCardId?: string): HistoryEntry | undefined {
  const used = result.allCards.find((c) => c.cardId === cardIdUsed);
  if (!used || !result.bestCard) return undefined;
  const defaultResult = defaultCardId ? result.allCards.find((c) => c.cardId === defaultCardId) : undefined;
  const avg = result.allCards.reduce((a, c) => a + c.totalEstimatedAEDValue, 0) / result.allCards.length;
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    date: result.calculatedAt,
    amount: result.transaction.amount,
    merchantName: result.transaction.merchantName,
    category: result.transaction.category,
    cardIdUsed,
    recommendedCardId: result.bestCard.cardId,
    valueAED: used.totalEstimatedAEDValue,
    bestValueAED: result.bestCard.totalEstimatedAEDValue,
    baselineValueAED: round2(defaultResult ? defaultResult.totalEstimatedAEDValue : avg),
    baselineLabel: defaultResult ? "your default card" : "your wallet average",
  };
}

export interface PeriodSummary {
  period: string; // YYYY-MM
  transactions: number;
  spendAED: number;
  rewardsAED: number;
  extraValueAED: number;
  followedRecommendation: number;
}

export function summariseByMonth(entries: HistoryEntry[]): PeriodSummary[] {
  const map = new Map<string, PeriodSummary>();
  for (const e of entries) {
    const period = uaeDateOnly(new Date(e.date)).slice(0, 7);
    const s = map.get(period) ?? { period, transactions: 0, spendAED: 0, rewardsAED: 0, extraValueAED: 0, followedRecommendation: 0 };
    s.transactions++;
    s.spendAED = round2(s.spendAED + e.amount);
    s.rewardsAED = round2(s.rewardsAED + e.valueAED);
    s.extraValueAED = round2(s.extraValueAED + (e.valueAED - e.baselineValueAED));
    if (e.cardIdUsed === e.recommendedCardId) s.followedRecommendation++;
    map.set(period, s);
  }
  return [...map.values()].sort((a, b) => b.period.localeCompare(a.period));
}

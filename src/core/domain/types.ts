/**
 * Core domain model for TapWise UAE.
 *
 * Every persisted object carries provenance/freshness metadata so that card
 * rules, offers and valuations can be refreshed from live sources without
 * changing calculation or UI code.
 *
 * Dates are ISO-8601 strings (e.g. "2026-10-31" or "2026-10-31T23:59:59+04:00")
 * so that the dataset round-trips cleanly through JSON, HTTP and localStorage.
 * Date-only strings are interpreted in UAE time (UTC+4); see `core/time.ts`.
 */

export type ISODate = string;

export type DataStatus =
  | "live" // fetched from an authoritative source by the ingestion pipeline
  | "verified" // checked by an administrator against official terms
  | "cached" // previously live/verified, served from cache
  | "estimated" // derived/estimated (e.g. points valuations)
  | "demo" // illustrative demonstration data — NOT real product data
  | "expired"; // no longer valid; kept for history

export interface DataSource {
  url: string;
  publisher: string;
  retrievedAt: ISODate;
  effectiveDate?: ISODate;
  /** Optional short note, e.g. "Card T&Cs §4.2". */
  note?: string;
}

/** Provenance and freshness fields carried by every data object. */
export interface Provenance {
  sourceUrl?: string;
  sources?: DataSource[];
  effectiveFrom?: ISODate;
  effectiveUntil?: ISODate;
  lastCheckedAt?: ISODate;
  lastVerifiedAt?: ISODate;
  dataStatus: DataStatus;
}

// ---------------------------------------------------------------------------
// Categories, merchants and MCCs
// ---------------------------------------------------------------------------

export type SpendCategory =
  | "fuel"
  | "groceries"
  | "dining"
  | "food_delivery"
  | "airline"
  | "hotel"
  | "travel"
  | "online_shopping"
  | "retail"
  | "electronics"
  | "fashion"
  | "education"
  | "utilities"
  | "telecom"
  | "government"
  | "transport"
  | "entertainment"
  | "health"
  | "insurance"
  | "real_estate"
  | "charity"
  | "other";

export type Region = "domestic" | "international";
export type Channel = "online" | "in_store";

export interface Bank extends Provenance {
  id: string;
  name: string;
  shortName: string;
  country: "AE";
  website?: string;
  isIslamic?: boolean;
}

export interface Merchant extends Provenance {
  id: string;
  name: string;
  /** Lower-case aliases used by the natural-language parser. */
  aliases: string[];
  /** Phrases that contain an alias but refer to something else ("emirates id"). */
  negativeAliases?: string[];
  category: SpendCategory;
  mccs: string[];
  isOnline?: boolean;
  website?: string;
  icon?: string;
}

export interface MccCode extends Provenance {
  code: string;
  description: string;
  category: SpendCategory;
}

// ---------------------------------------------------------------------------
// Reward currencies & valuations
// ---------------------------------------------------------------------------

export type RewardCurrencyType =
  | "cash"
  | "airline_miles"
  | "bank_points"
  | "hotel_points"
  | "other";

export interface RewardValuation {
  currencyId: string;
  /** Estimated AED value of ONE unit (e.g. 0.035 for 3.5 fils per mile). */
  aedValuePerUnit: number;
  valuationMethod:
    | "fixed_redemption"
    | "average_redemption"
    | "market_estimate"
    | "user_defined";
  lowEstimate?: number;
  highEstimate?: number;
  sourceUrls?: string[];
  lastUpdatedAt: ISODate;
  confidence: "high" | "medium" | "low";
  notes?: string;
  dataStatus: DataStatus;
}

export interface RewardCurrency extends Provenance {
  id: string;
  name: string;
  shortName: string;
  type: RewardCurrencyType;
  issuer?: string;
  unitSingular: string;
  unitPlural: string;
  /** UI badge text, e.g. "ETIHAD MILES". */
  badge: string;
  /** How fractional units are handled when earned. */
  rounding: "cents" | "round" | "floor";
  programUrl?: string;
  valuation: RewardValuation;
}

// ---------------------------------------------------------------------------
// Cards and earning rules
// ---------------------------------------------------------------------------

export type CardNetwork = "Visa" | "Mastercard" | "Amex" | "Diners" | "UnionPay";

export interface CapGroup {
  id: string;
  label: string;
  /** Maximum reward, in the card's reward units (AED for cashback). */
  cap: number;
  period: "monthly" | "statement_cycle" | "annual" | "per_transaction";
}

export interface EarnRuleMatch {
  categories?: SpendCategory[];
  merchantIds?: string[];
  mccs?: string[];
  region?: Region | "any";
  channel?: Channel | "any";
}

export interface EarnRule {
  id: string;
  label: string;
  description?: string;
  /** Empty match = the card's base (catch-all) earning rule. */
  match: EarnRuleMatch;
  /** Reward units earned per AED 1 spent (0.05 = 5% cashback; 0.5 = 1 mile per AED 2). */
  unitsPerAED: number;
  /** Human readable, e.g. "1 mile per AED 2". Generated if omitted. */
  rateDisplay?: string;
  capGroupId?: string;
  /** Rule only applies when the cardholder's monthly spend reaches this amount. */
  minMonthlySpendAED?: number;
  sources?: DataSource[];
  lastVerifiedAt?: ISODate;
}

export interface Card extends Provenance {
  id: string;
  bankId: string;
  name: string;
  network: CardNetwork;
  /** e.g. "Visa Signature", "World Elite Mastercard". Used for network offers. */
  networkTier?: string;
  isIslamic?: boolean;
  annualFeeAED?: number;
  foreignTransactionFeePct?: number;
  rewardCurrencyId: string;
  earnRules: EarnRule[];
  capGroups?: CapGroup[];
  highlights?: string[];
  termsUrl?: string;
  design: { from: string; to: string; text?: string };
}

// ---------------------------------------------------------------------------
// Offers / promotions
// ---------------------------------------------------------------------------

export type OfferType =
  | "cashback"
  | "discount"
  | "bonus_points"
  | "bonus_miles"
  | "multiplier"
  | "fixed_reward"
  | "statement_credit";

export type StackingRule = "stack" | "replace_base" | "best_of" | "unknown";

export type OfferSourceType = "bank" | "merchant" | "network" | "loyalty" | "admin";

export interface CardOffer extends Omit<Provenance, "sourceUrl" | "lastVerifiedAt"> {
  id: string;
  /** Offers describing the same real-world campaign share a canonical id. */
  canonicalOfferId?: string;
  title: string;
  description?: string;

  cardIds?: string[];
  bankIds?: string[];
  network?: "Visa" | "Mastercard" | "Amex";
  networkTiers?: string[];

  merchants?: string[];
  categories?: SpendCategory[];
  mccs?: string[];
  region?: Region | "any";
  channel?: Channel | "any";

  offerType: OfferType;
  /** cashback/discount: fraction (0.1 = 10%). bonus_points/bonus_miles: units per AED. */
  rate?: number;
  /** multiplier: total multiple of base earning (5 = "5X"). */
  multiplier?: number;
  /** fixed_reward/statement_credit: amount (AED unless `rewardCurrencyId` is set). */
  fixedValue?: number;
  /** Currency the reward is paid in. Defaults to AED for cash types, card currency otherwise. */
  rewardCurrencyId?: string;

  minimumSpend?: number;
  /** Maximum eligible spend per transaction. */
  maximumSpend?: number;
  /** Maximum reward per transaction (in reward units; AED for cash). */
  rewardCap?: number;

  startDate: ISODate;
  endDate: ISODate;

  registrationRequired?: boolean;
  registrationUrl?: string;
  promoCodeRequired?: boolean;
  promoCode?: string;
  paymentMethodRestrictions?: string[];
  eligibilityConditions?: string[];

  stackingRule: StackingRule;

  publisher: string;
  sourceType: OfferSourceType;
  sourceUrl: string;
  lastVerifiedAt: ISODate;

  status: "active" | "upcoming" | "expired";
}

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------

export interface Dataset {
  version: string;
  generatedAt: ISODate;
  /** Overall status of the snapshot (e.g. "demo" for the bundled dataset). */
  dataStatus: DataStatus;
  banks: Bank[];
  cards: Card[];
  rewardCurrencies: RewardCurrency[];
  merchants: Merchant[];
  mccs: MccCode[];
  offers: CardOffer[];
}

export type CollectionName =
  | "banks"
  | "cards"
  | "rewardCurrencies"
  | "merchants"
  | "mccs"
  | "offers";

// ---------------------------------------------------------------------------
// Transactions & user state
// ---------------------------------------------------------------------------

export interface Transaction {
  /** Amount charged in AED (converted if the purchase was in another currency). */
  amount: number;
  currency: "AED";
  originalAmount?: number;
  originalCurrency?: string;
  merchantId?: string;
  merchantName?: string;
  category: SpendCategory;
  mcc?: string;
  region: Region;
  channel?: Channel;
  /** e.g. "Apple Pay", "Samsung Pay", "Physical card". */
  paymentMethod?: string;
  date: ISODate;
}

export interface CardUserState {
  /** Rewards already earned this period, by cap group id (reward units). */
  capUsage?: Record<string, number>;
  /** The user's expected/actual monthly spend on this card, used for tiered rules. */
  monthlySpendAED?: number;
}

export interface UserRewardState {
  /** Offers the user has registered for (or will apply the promo code for). */
  registeredOfferIds: string[];
  cards: Record<string, CardUserState>;
}

export interface UserPreferences {
  valuationOverrides: Record<string, number>;
  showMissingOut: boolean;
  defaultCardId?: string;
}

// ---------------------------------------------------------------------------
// Calculation results
// ---------------------------------------------------------------------------

export type ResultConfidence = "exact" | "estimated" | "conditional";

export type BenefitType =
  | "cashback"
  | "points"
  | "miles"
  | "discount"
  | "statement_credit"
  | "fee"
  | "other";

export interface BenefitComponent {
  type: BenefitType;
  label: string;
  origin: "base" | "offer" | "fee";
  offerId?: string;
  quantity?: number;
  /** Display name of the currency ("Etihad Guest Miles", "AED"). */
  currency?: string;
  currencyId?: string;
  monetaryValueAED: number;
  lowValueAED: number;
  highValueAED: number;
  valuationRate?: number;
  valuationConfidence: ResultConfidence;
  source?: string;
  explanation: string;
}

export interface CalculationStep {
  label: string;
  value: string;
  detail?: string;
  kind?: "input" | "earn" | "offer" | "valuation" | "subtotal" | "total" | "fee" | "note";
}

export interface OfferEvaluation {
  offer: CardOffer;
  status: "eligible" | "conditional" | "ineligible";
  /** Unmet-but-satisfiable conditions (registration, promo code, payment method). */
  conditions: string[];
  /** Why the offer does not apply (for ineligible offers). */
  reasons: string[];
  /** Ids of duplicate offer records merged into this one. */
  duplicateOfferIds: string[];
}

export interface RewardLine {
  quantity: number;
  currency: string;
  currencyId: string;
  estimatedAEDValue: number;
}

export interface TransactionValueResult {
  cardId: string;

  baseReward: RewardLine & { ruleId?: string; ruleLabel?: string; capApplied: boolean };
  promotionalRewards: (Partial<RewardLine> & { title: string; offerId: string; estimatedAEDValue: number })[];
  discounts: { title: string; offerId: string; estimatedAEDValue: number }[];
  fees: { title: string; estimatedAEDValue: number }[];

  benefits: BenefitComponent[];

  /** Ranking metric: confirmed (non-conditional) value net of fees. */
  totalEstimatedAEDValue: number;
  valueRange: { low: number; high: number };
  /** Value if every conditional offer applies and unknown stacking turns out favourable. */
  potential: {
    totalEstimatedAEDValue: number;
    extraAEDValue: number;
    reasons: string[];
    offerIds: string[];
  };
  /** Value from base earning alone (no offers) — used for deal highlighting. */
  baseOnlyAEDValue: number;

  effectiveReturnPercentage: number;
  explanation: string[];
  steps: CalculationStep[];
  warnings: string[];
  confidence: ResultConfidence;

  appliedOffers: CardOffer[];
  conditionalOffers: OfferEvaluation[];
  skippedOffers: { offer: CardOffer; reason: string }[];

  dataFreshness: {
    lastVerifiedAt?: ISODate;
    lastCheckedAt?: ISODate;
    dataStatus: DataStatus;
    sources: DataSource[];
  };

  rank?: number;
  rankWithoutOffers?: number;
}

/** Alias matching the "card calculation" shape described in the product spec. */
export type CardTransactionResult = TransactionValueResult;

export interface RecommendationResult {
  transaction: Transaction;
  bestCard?: TransactionValueResult;
  topThree: TransactionValueResult[];
  allCards: TransactionValueResult[];
  /** Cards outside the wallet that would beat the best wallet card. Never mixed into the ranking. */
  missingOut: TransactionValueResult[];
  /** Registration-dependent opportunities that would change the winner. */
  potentialHighlights: { cardId: string; offerIds: string[]; potentialAEDValue: number; wouldRank: number }[];
  /** Offers that moved a card up the ranking (deal highlighting). */
  dealHighlights: { cardId: string; offerIds: string[]; rankWithout: number; rankWith: number }[];
  computedInMs: number;
  calculatedAt: ISODate;
}

import type { Dataset, RecommendationResult, Transaction, UserPreferences, UserRewardState } from "../domain/types";
import { recommend } from "../engines/rankingEngine";
import { CardService } from "./cardService";
import { MerchantService } from "./merchantService";
import { OfferService } from "./offerService";
import { ValuationService } from "./valuationService";

/**
 * The catalog is the in-memory, indexed view of a dataset snapshot. It is
 * built once per snapshot; every recommendation is then a pure in-memory
 * computation (no network calls), keeping results well under 500 ms.
 */
export interface Catalog {
  dataset: Dataset;
  cards: CardService;
  offers: OfferService;
  merchants: MerchantService;
  valuations: ValuationService;
  recommend(args: {
    walletCardIds: string[];
    transaction: Transaction;
    preferences?: Partial<UserPreferences>;
    userRewardState?: UserRewardState;
    now?: Date;
    includeMissingOut?: boolean;
  }): RecommendationResult;
}

export function createCatalog(dataset: Dataset): Catalog {
  const cards = new CardService(dataset);
  const offers = OfferService.from(dataset);
  const merchants = new MerchantService(dataset);
  const valuations = ValuationService.from(dataset);

  return {
    dataset,
    cards,
    offers,
    merchants,
    valuations,
    recommend({ walletCardIds, transaction, preferences, userRewardState, now = new Date(), includeMissingOut = true }) {
      return recommend({
        walletCards: cards.walletCards(walletCardIds),
        otherCards: includeMissingOut ? cards.notInWallet(walletCardIds) : undefined,
        transaction,
        activeOffers: offers.active(now),
        valuations: valuations.engine(preferences?.valuationOverrides ?? {}),
        userRewardState,
        now,
      });
    },
  };
}

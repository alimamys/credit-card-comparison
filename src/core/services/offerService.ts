import type { Card, CardOffer, Dataset } from "../domain/types";
import { cardMatchesOffer, dedupeOffers, type DedupedOffer, getOfferStatus, isOfferActive } from "../engines/offerEligibilityEngine";
import { uaeDateOnly } from "../time";

/**
 * Offer service: owns the offer collection and serves *active, de-duplicated*
 * offers to the calculator. Results are cached per UAE calendar day/hour so a
 * search never re-scans or re-fetches anything.
 */
export class OfferService {
  private cacheKey?: string;
  private cache: DedupedOffer[] = [];

  constructor(private readonly offers: CardOffer[]) {}

  static from(dataset: Pick<Dataset, "offers">): OfferService {
    return new OfferService(dataset.offers);
  }

  all(): CardOffer[] {
    return this.offers;
  }

  get(id: string): CardOffer | undefined {
    return this.offers.find((o) => o.id === id);
  }

  /** Expired campaigns are excluded; they remain available via all()/historical(). */
  active(now: Date): DedupedOffer[] {
    const key = `${uaeDateOnly(now)}T${now.getUTCHours()}`;
    if (key !== this.cacheKey) {
      this.cache = dedupeOffers(this.offers.filter((o) => isOfferActive(o, now)));
      this.cacheKey = key;
    }
    // Hour-granular cache: re-check boundaries precisely.
    return this.cache.filter((d) => isOfferActive(d.offer, now));
  }

  upcoming(now: Date): CardOffer[] {
    return this.offers.filter((o) => getOfferStatus(o, now) === "upcoming");
  }

  historical(now: Date): CardOffer[] {
    return this.offers.filter((o) => getOfferStatus(o, now) === "expired");
  }

  /** Offers that could apply to at least one of the given cards (ignoring merchant/category). */
  forCards(cards: Card[], now: Date): DedupedOffer[] {
    return this.active(now).filter((d) => cards.some((c) => cardMatchesOffer(d.offer, c).ok));
  }
}

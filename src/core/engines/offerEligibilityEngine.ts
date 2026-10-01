import type {
  Card,
  CardOffer,
  OfferEvaluation,
  Transaction,
  UserRewardState,
} from "../domain/types";
import { parseDate } from "../time";

/**
 * Offer eligibility engine.
 *
 *  - isOfferActive / getOfferStatus: date-driven freshness (startDate <= now <= endDate).
 *    Expired campaigns never affect recommendations.
 *  - dedupeOffers: collapses records describing the same real-world campaign
 *    (same canonicalOfferId, or an identical fingerprint) so benefits are never
 *    double-counted when a bank AND a merchant publish the same deal.
 *  - evaluateOffer: does an offer apply to this card + transaction, and is it
 *    guaranteed ("eligible") or does it depend on user action ("conditional")?
 */

export function isOfferActive(offer: CardOffer, now: Date): boolean {
  if (offer.status === "expired") return false; // manually withdrawn by an admin
  const start = parseDate(offer.startDate, "start");
  const end = parseDate(offer.endDate, "end");
  return start.getTime() <= now.getTime() && now.getTime() <= end.getTime();
}

export function getOfferStatus(offer: CardOffer, now: Date): "active" | "upcoming" | "expired" {
  if (offer.status === "expired") return "expired";
  if (now.getTime() > parseDate(offer.endDate, "end").getTime()) return "expired";
  if (now.getTime() < parseDate(offer.startDate, "start").getTime()) return "upcoming";
  return "active";
}

/** Fingerprint used to catch duplicates that were not given a canonical id. */
export function offerFingerprint(offer: CardOffer): string {
  const sorted = (xs?: string[]) => (xs && xs.length ? [...xs].sort().join(",") : "*");
  return [
    offer.offerType,
    offer.rate ?? "",
    offer.multiplier ?? "",
    offer.fixedValue ?? "",
    sorted(offer.cardIds),
    sorted(offer.bankIds),
    offer.network ?? "*",
    sorted(offer.networkTiers),
    sorted(offer.merchants),
    sorted(offer.categories),
    offer.minimumSpend ?? "",
  ].join("|");
}

function rangesOverlap(a: CardOffer, b: CardOffer): boolean {
  return (
    parseDate(a.startDate, "start") <= parseDate(b.endDate, "end") &&
    parseDate(b.startDate, "start") <= parseDate(a.endDate, "end")
  );
}

const SOURCE_PRIORITY: Record<CardOffer["sourceType"], number> = {
  bank: 0,
  network: 1,
  loyalty: 2,
  admin: 3,
  merchant: 4,
};

export interface DedupedOffer {
  offer: CardOffer;
  duplicateOfferIds: string[];
}

/**
 * Merge duplicate offer records. The representative record is the issuer's own
 * (bank > network > loyalty > admin > merchant), then the most recently verified.
 * Sources of all duplicates are merged onto the representative for provenance.
 */
export function dedupeOffers(offers: CardOffer[]): DedupedOffer[] {
  const groups: CardOffer[][] = [];
  const byCanonical = new Map<string, CardOffer[]>();
  for (const offer of offers) {
    const key = offer.canonicalOfferId;
    if (key) {
      const g = byCanonical.get(key);
      if (g) {
        g.push(offer);
        continue;
      }
      const ng = [offer];
      byCanonical.set(key, ng);
      groups.push(ng);
      continue;
    }
    groups.push([offer]);
  }

  // Second pass: fingerprint-identical groups with overlapping dates are the same campaign.
  const merged: CardOffer[][] = [];
  const fpIndex = new Map<string, CardOffer[][]>();
  for (const group of groups) {
    const fp = offerFingerprint(group[0]);
    const candidates = fpIndex.get(fp) ?? [];
    const match = candidates.find((g) => g.some((o) => group.some((p) => rangesOverlap(o, p))));
    if (match) {
      match.push(...group);
    } else {
      candidates.push(group);
      fpIndex.set(fp, candidates);
      merged.push(group);
    }
  }

  return merged.map((group) => {
    const sorted = [...group].sort(
      (a, b) =>
        SOURCE_PRIORITY[a.sourceType] - SOURCE_PRIORITY[b.sourceType] ||
        parseDate(b.lastVerifiedAt).getTime() - parseDate(a.lastVerifiedAt).getTime(),
    );
    const rep = sorted[0];
    if (sorted.length === 1) return { offer: rep, duplicateOfferIds: [] };
    const sources = [
      ...(rep.sources ?? []),
      ...sorted.slice(1).flatMap((o) =>
        o.sources?.length ? o.sources : [{ url: o.sourceUrl, publisher: o.publisher, retrievedAt: o.lastVerifiedAt }],
      ),
    ];
    return {
      offer: { ...rep, sources },
      duplicateOfferIds: sorted.slice(1).map((o) => o.id),
    };
  });
}

export function cardMatchesOffer(offer: CardOffer, card: Card): { ok: boolean; reason?: string } {
  if (offer.cardIds?.length && !offer.cardIds.includes(card.id)) return { ok: false, reason: "Not valid on this card" };
  if (offer.bankIds?.length && !offer.bankIds.includes(card.bankId)) return { ok: false, reason: "Not valid for this bank's cards" };
  if (offer.network && offer.network !== card.network) return { ok: false, reason: `Only for ${offer.network} cards` };
  if (offer.networkTiers?.length && !(card.networkTier && offer.networkTiers.includes(card.networkTier))) {
    return { ok: false, reason: `Only for ${offer.networkTiers.join(" / ")} cards` };
  }
  return { ok: true };
}

export function transactionMatchesOffer(offer: CardOffer, tx: Transaction): { ok: boolean; reason?: string } {
  if (offer.merchants?.length && !(tx.merchantId && offer.merchants.includes(tx.merchantId))) {
    return { ok: false, reason: "Merchant not included in this offer" };
  }
  if (offer.categories?.length && !offer.categories.includes(tx.category)) {
    return { ok: false, reason: "Category not included in this offer" };
  }
  if (offer.mccs?.length && !(tx.mcc && offer.mccs.includes(tx.mcc))) {
    return { ok: false, reason: "Merchant category code not included" };
  }
  if (offer.region && offer.region !== "any" && offer.region !== tx.region) {
    return { ok: false, reason: offer.region === "international" ? "International spend only" : "UAE spend only" };
  }
  if (offer.channel && offer.channel !== "any" && tx.channel && offer.channel !== tx.channel) {
    return { ok: false, reason: offer.channel === "online" ? "Online purchases only" : "In-store purchases only" };
  }
  if (offer.minimumSpend !== undefined && tx.amount < offer.minimumSpend) {
    return { ok: false, reason: `Minimum spend AED ${offer.minimumSpend} not met` };
  }
  return { ok: true };
}

export function evaluateOffer(
  deduped: DedupedOffer,
  card: Card,
  tx: Transaction,
  userState: UserRewardState | undefined,
  now: Date,
): OfferEvaluation {
  const { offer, duplicateOfferIds } = deduped;
  const base = { offer, duplicateOfferIds, conditions: [] as string[], reasons: [] as string[] };

  if (!isOfferActive(offer, now)) {
    return { ...base, status: "ineligible", reasons: [`Offer is ${getOfferStatus(offer, now)}`] };
  }
  const cardCheck = cardMatchesOffer(offer, card);
  if (!cardCheck.ok) return { ...base, status: "ineligible", reasons: [cardCheck.reason!] };
  const txCheck = transactionMatchesOffer(offer, tx);
  if (!txCheck.ok) return { ...base, status: "ineligible", reasons: [txCheck.reason!] };

  // Channel restriction with an unknown channel is a condition, not a match.
  if (offer.channel && offer.channel !== "any" && !tx.channel) {
    base.conditions.push(offer.channel === "online" ? "Valid for online purchases only" : "Valid in-store only");
  }

  if (offer.paymentMethodRestrictions?.length) {
    const allowed = offer.paymentMethodRestrictions.map((p) => p.toLowerCase());
    if (tx.paymentMethod) {
      if (!allowed.includes(tx.paymentMethod.toLowerCase())) {
        return { ...base, status: "ineligible", reasons: [`Requires ${offer.paymentMethodRestrictions.join(" or ")}`] };
      }
    } else {
      base.conditions.push(`Pay with ${offer.paymentMethodRestrictions.join(" or ")}`);
    }
  }

  const acknowledged =
    userState?.registeredOfferIds.includes(offer.id) ||
    duplicateOfferIds.some((id) => userState?.registeredOfferIds.includes(id)) ||
    (offer.canonicalOfferId !== undefined && userState?.registeredOfferIds.includes(offer.canonicalOfferId));
  if (offer.registrationRequired && !acknowledged) base.conditions.push("Registration required");
  if (offer.promoCodeRequired && !acknowledged) {
    base.conditions.push(offer.promoCode ? `Promo code ${offer.promoCode} required` : "Promo code required");
  }

  return { ...base, status: base.conditions.length ? "conditional" : "eligible" };
}

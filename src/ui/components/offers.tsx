import { categoryMeta } from "../../core/domain/categories";
import type { CardOffer, StackingRule } from "../../core/domain/types";
import { getOfferStatus } from "../../core/engines/offerEligibilityEngine";
import { formatAED, formatDate, formatNumber, formatPercent, formatRelativeDays } from "../../core/format";
import type { Catalog } from "../../core/services/catalog";
import { daysBetween, daysSince, parseDate } from "../../core/time";
import { useCatalog } from "../state/AppState";
import { Badge, type BadgeTone, Modal } from "./ui";

export const STACKING_TEXT: Record<StackingRule, string> = {
  stack: "Paid in addition to the card's standard rewards.",
  replace_base: "Paid instead of the card's standard rewards.",
  best_of: "You receive whichever is higher: this offer or the standard rewards.",
  unknown: "The terms don't say whether this combines with standard rewards. We count only the higher of the two and show the rest as potential value.",
};

export function offerTone(o: CardOffer): BadgeTone {
  return o.offerType === "discount" ? "discount" : "deal";
}

export function describeOfferValue(o: CardOffer, catalog: Catalog): string {
  const cur = (id?: string) => catalog.valuations.get(id ?? "")?.unitPlural ?? "points";
  const cap = o.rewardCap !== undefined ? ` (max ${o.offerType === "cashback" || o.offerType === "discount" ? formatAED(o.rewardCap, { compact: true }) : formatNumber(o.rewardCap)})` : "";
  switch (o.offerType) {
    case "cashback":
      return `${formatPercent(o.rate ?? 0)} cashback${cap}`;
    case "discount":
      return o.rate ? `${formatPercent(o.rate)} off${cap}` : `${formatAED(o.fixedValue ?? 0, { compact: true })} off`;
    case "multiplier": {
      const firstCard = o.cardIds?.length ? catalog.cards.get(o.cardIds[0]) : undefined;
      return `${formatNumber(o.multiplier ?? 1, 1)}X ${firstCard ? cur(firstCard.rewardCurrencyId) : "rewards"}${cap}`;
    }
    case "bonus_points":
    case "bonus_miles": {
      const firstCard = o.cardIds?.length ? catalog.cards.get(o.cardIds[0]) : undefined;
      return `${formatNumber(o.rate ?? 0, 2)} bonus ${cur(o.rewardCurrencyId ?? firstCard?.rewardCurrencyId).toLowerCase()} per AED${cap}`;
    }
    case "fixed_reward":
      return `${formatAED(o.fixedValue ?? 0, { compact: true })} back${o.minimumSpend ? ` on AED ${formatNumber(o.minimumSpend)}+` : ""}`;
    case "statement_credit":
      return `${formatAED(o.fixedValue ?? 0, { compact: true })} statement credit${o.minimumSpend ? ` on AED ${formatNumber(o.minimumSpend)}+` : ""}`;
  }
}

export function capText(o: CardOffer, catalog: Catalog): string {
  if (o.rewardCap === undefined) return "No cap stated";
  if (o.offerType === "cashback" || o.offerType === "discount") return `${formatAED(o.rewardCap, { compact: true })} per transaction`;
  const currencyId = o.rewardCurrencyId ?? (o.cardIds?.length ? catalog.cards.get(o.cardIds[0])?.rewardCurrencyId : undefined);
  return `${formatNumber(o.rewardCap)} bonus ${(catalog.valuations.get(currencyId ?? "")?.unitPlural ?? "units").toLowerCase()}`;
}

export function expiryLabel(o: CardOffer, now: Date): string {
  const status = getOfferStatus(o, now);
  if (status === "upcoming") return `Starts ${formatDate(o.startDate)}`;
  if (status === "expired") return `Ended ${formatDate(o.endDate)}`;
  const days = daysBetween(now, parseDate(o.endDate, "end"));
  if (days <= 0) return "Ends today";
  if (days <= 7) return `Ends in ${days} day${days === 1 ? "" : "s"}`;
  return `Until ${formatDate(o.endDate)}`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="kv">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function OfferDetailsModal({ offer, duplicateOfferIds = [], onClose }: { offer: CardOffer; duplicateOfferIds?: string[]; onClose: () => void }) {
  const { catalog, rewardState, toggleRegistered, now } = useCatalog();
  const status = getOfferStatus(offer, now);
  const registered = rewardState.registeredOfferIds.includes(offer.id);
  const needsAction = offer.registrationRequired || offer.promoCodeRequired;
  const isDemoLink = (u?: string) => !u || u.startsWith("demo://");
  const cards = offer.cardIds?.map((id) => catalog.cards.get(id)?.name ?? id);
  const banks = offer.bankIds?.map((id) => catalog.cards.bank(id)?.name ?? id);
  const merchants = offer.merchants?.map((id) => catalog.merchants.get(id)?.name ?? id);
  const verifiedAgo = daysSince(offer.lastVerifiedAt, now);

  return (
    <Modal title={offer.title} onClose={onClose}>
      <div className="offer-modal">
        <div className="offer-modal__badges">
          <Badge tone={offerTone(offer)}>{offer.offerType === "discount" ? "MERCHANT DISCOUNT" : "LIMITED-TIME OFFER"}</Badge>
          <Badge tone={status === "active" ? "good" : "warn"}>{status.toUpperCase()}</Badge>
          {offer.dataStatus === "demo" && <Badge tone="demo">DEMO OFFER</Badge>}
        </div>
        {offer.description && <p>{offer.description}</p>}
        <dl className="kv-list">
          <Row label="Offer">{describeOfferValue(offer, catalog)}</Row>
          <Row label="Eligible cards">
            {[cards?.join(", "), banks && `All ${banks.join(", ")} cards`, offer.network && `${offer.networkTiers?.join(" / ") ?? offer.network} cards`].filter(Boolean).join(" · ") || "Any card"}
          </Row>
          {merchants && <Row label="Merchants">{merchants.join(", ")}</Row>}
          {offer.categories && <Row label="Categories">{offer.categories.map((c) => categoryMeta(c).label).join(", ")}</Row>}
          {offer.region && offer.region !== "any" && <Row label="Where">{offer.region === "international" ? "International spend" : "UAE spend"}</Row>}
          <Row label="Minimum purchase">{offer.minimumSpend ? formatAED(offer.minimumSpend, { compact: true }) : "None"}</Row>
          {offer.maximumSpend !== undefined && <Row label="Maximum eligible spend">{formatAED(offer.maximumSpend, { compact: true })}</Row>}
          <Row label="Cap">{capText(offer, catalog)}</Row>
          <Row label="Registration">{offer.registrationRequired ? "⚠️ Required before purchase" : "Not required"}</Row>
          {offer.promoCodeRequired && <Row label="Promo code">{offer.promoCode ? <code>{offer.promoCode}</code> : "Required"}</Row>}
          {offer.paymentMethodRestrictions && <Row label="Payment method">{offer.paymentMethodRestrictions.join(" or ")} only</Row>}
          <Row label="Combines with card rewards?">{STACKING_TEXT[offer.stackingRule]}</Row>
          <Row label="Valid">
            {formatDate(offer.startDate)} – {formatDate(offer.endDate)} · <strong>{expiryLabel(offer, now)}</strong>
          </Row>
          {offer.eligibilityConditions?.length ? (
            <Row label="Conditions">
              <ul className="plain-list">
                {offer.eligibilityConditions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </Row>
          ) : null}
          <Row label="Source">
            {offer.publisher}
            {isDemoLink(offer.sourceUrl) ? (
              <span className="muted"> · demo record, no live source</span>
            ) : (
              <>
                {" · "}
                <a href={offer.sourceUrl} target="_blank" rel="noreferrer">
                  View source
                </a>
              </>
            )}
            <div className="muted small">Verified {formatRelativeDays(verifiedAgo)} ({formatDate(offer.lastVerifiedAt)})</div>
            {duplicateOfferIds.length > 0 && (
              <div className="muted small">Also published by {duplicateOfferIds.length} other source{duplicateOfferIds.length > 1 ? "s" : ""} — counted once.</div>
            )}
          </Row>
        </dl>

        {needsAction && (
          <div className={`register-box ${registered ? "register-box--done" : ""}`}>
            <div>
              <strong>{registered ? "✓ Marked as registered" : offer.registrationRequired ? "Registration required" : "Promo code required"}</strong>
              <p className="small">
                {registered
                  ? "This offer is now counted in your recommendations."
                  : "Until you confirm, this value is shown as potential and not used to rank your cards."}
              </p>
            </div>
            <div className="register-box__actions">
              {offer.registrationUrl &&
                (isDemoLink(offer.registrationUrl) ? (
                  <button type="button" className="btn btn--ghost" disabled title="Demo offer — no real registration page">
                    Registration page (demo)
                  </button>
                ) : (
                  <a className="btn btn--ghost" href={offer.registrationUrl} target="_blank" rel="noreferrer">
                    Register
                  </a>
                ))}
              <label className="switch">
                <input type="checkbox" checked={registered} onChange={() => toggleRegistered(offer.id)} />
                <span>{offer.registrationRequired ? "I've registered for this offer" : "I'll use the promo code"}</span>
              </label>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

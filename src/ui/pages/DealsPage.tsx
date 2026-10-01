import { useMemo, useState } from "react";
import type { CardOffer } from "../../core/domain/types";
import { cardMatchesOffer, dedupeOffers, getOfferStatus } from "../../core/engines/offerEligibilityEngine";
import { describeOfferValue, expiryLabel, OfferDetailsModal } from "../components/offers";
import { Badge, EmptyState } from "../components/ui";
import { useCatalog } from "../state/AppState";

type Tab = "active" | "upcoming" | "expired";

function OfferItem({ offer, dups, onOpen }: { offer: CardOffer; dups: string[]; onOpen(): void }) {
  const { catalog, wallet, rewardState, now } = useCatalog();
  const eligibleWalletCards = catalog.cards.walletCards(wallet).filter((c) => cardMatchesOffer(offer, c).ok);
  const registered = rewardState.registeredOfferIds.includes(offer.id);
  const merchants = offer.merchants?.map((m) => catalog.merchants.get(m)?.name ?? m).join(", ");
  return (
    <li className="deal">
      <button type="button" className="deal__btn" onClick={onOpen}>
        <div className="deal__top">
          <Badge tone={offer.offerType === "discount" ? "discount" : "deal"}>{offer.offerType === "discount" ? "MERCHANT DISCOUNT" : "LIMITED-TIME OFFER"}</Badge>
          {offer.dataStatus === "demo" && <Badge tone="demo">DEMO</Badge>}
          {offer.registrationRequired && <Badge tone={registered ? "good" : "warn"}>{registered ? "✓ REGISTERED" : "REGISTRATION REQUIRED"}</Badge>}
          {offer.promoCodeRequired && <Badge tone="warn">PROMO CODE</Badge>}
        </div>
        <div className="deal__title">{offer.title}</div>
        <div className="deal__value">{describeOfferValue(offer, catalog)}</div>
        <div className="small muted">
          {merchants ? `${merchants} · ` : ""}
          {expiryLabel(offer, now)} · {offer.publisher}
          {dups.length > 0 && ` · also listed by ${dups.length} other source${dups.length > 1 ? "s" : ""}`}
        </div>
        {eligibleWalletCards.length > 0 && (
          <div className="small good">Applies to your {eligibleWalletCards.map((c) => c.name).join(", ")}</div>
        )}
      </button>
    </li>
  );
}

export function DealsPage() {
  const { catalog, wallet, now } = useCatalog();
  const [tab, setTab] = useState<Tab>("active");
  const [selected, setSelected] = useState<{ offer: CardOffer; dups: string[] }>();

  const groups = useMemo(() => {
    const deduped = dedupeOffers(catalog.offers.all());
    const walletCards = catalog.cards.walletCards(wallet);
    const byTab = (t: Tab) => deduped.filter((d) => getOfferStatus(d.offer, now) === t);
    const split = (list: ReturnType<typeof byTab>) => ({
      mine: list.filter((d) => walletCards.some((c) => cardMatchesOffer(d.offer, c).ok)),
      other: list.filter((d) => !walletCards.some((c) => cardMatchesOffer(d.offer, c).ok)),
    });
    return { active: split(byTab("active")), upcoming: split(byTab("upcoming")), expired: split(byTab("expired")) };
  }, [catalog, wallet, now]);

  const current = groups[tab];
  const count = (t: Tab) => groups[t].mine.length + groups[t].other.length;

  return (
    <div className="page">
      <header className="page__head">
        <h1>Deals & promotions</h1>
        <p className="muted">Active offers are applied automatically when you search. Expired campaigns are kept for history and never affect recommendations.</p>
      </header>
      <div className="tabs" role="tablist">
        {(["active", "upcoming", "expired"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? "is-active" : ""}`} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)} <span className="tab__count">{count(t)}</span>
          </button>
        ))}
      </div>

      {count(tab) === 0 && <EmptyState icon="🏷️" title={`No ${tab} offers`} />}
      {current.mine.length > 0 && (
        <section>
          <h2 className="section-title">For cards in your wallet</h2>
          <ul className="deal-grid">
            {current.mine.map((d) => (
              <OfferItem key={d.offer.id} offer={d.offer} dups={d.duplicateOfferIds} onOpen={() => setSelected({ offer: d.offer, dups: d.duplicateOfferIds })} />
            ))}
          </ul>
        </section>
      )}
      {current.other.length > 0 && (
        <section>
          <h2 className="section-title">Other cards</h2>
          <ul className="deal-grid">
            {current.other.map((d) => (
              <OfferItem key={d.offer.id} offer={d.offer} dups={d.duplicateOfferIds} onOpen={() => setSelected({ offer: d.offer, dups: d.duplicateOfferIds })} />
            ))}
          </ul>
        </section>
      )}
      {selected && <OfferDetailsModal offer={selected.offer} duplicateOfferIds={selected.dups} onClose={() => setSelected(undefined)} />}
    </div>
  );
}

import { useMemo, useState } from "react";
import type { Card } from "../../core/domain/types";
import { formatAED, formatDate, ruleRateDisplay } from "../../core/format";
import { Badge, CardArt, currencyTone, DataStatusBadge, EmptyState } from "../components/ui";
import { navigate } from "../router";
import { SAMPLE_WALLET, useCatalog } from "../state/AppState";

function CardFacts({ card }: { card: Card }) {
  const { catalog } = useCatalog();
  const currency = catalog.valuations.get(card.rewardCurrencyId);
  return (
    <div className="card-facts">
      <div className="card-facts__badges">
        <Badge tone={currencyTone(currency)}>{currency?.badge ?? card.rewardCurrencyId}</Badge>
        <DataStatusBadge status={card.dataStatus} />
      </div>
      <ul className="plain-list small">
        {(card.highlights ?? []).map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
      <div className="small muted">
        {card.networkTier ?? card.network} · Annual fee {card.annualFeeAED ? formatAED(card.annualFeeAED, { compact: true }) : "AED 0"} · FX fee {card.foreignTransactionFeePct ?? "—"}%
        {card.lastVerifiedAt && <> · Verified {formatDate(card.lastVerifiedAt)}</>}
      </div>
    </div>
  );
}

function OwnedCard({ card }: { card: Card }) {
  const { catalog, toggleCard, rewardState, updateCardState, prefs, setPref } = useCatalog();
  const [open, setOpen] = useState(false);
  const state = rewardState.cards[card.id] ?? {};
  const currency = catalog.valuations.get(card.rewardCurrencyId);
  const hasTiers = card.earnRules.some((r) => r.minMonthlySpendAED);
  const isDefault = prefs.defaultCardId === card.id;
  return (
    <li className="owned">
      <div className="owned__head">
        <CardArt card={card} />
        <div className="owned__info">
          <div className="owned__name">
            {card.name} {isDefault && <Badge tone="good">DEFAULT</Badge>}
          </div>
          <div className="small muted">{catalog.cards.bankForCard(card)?.name}</div>
          <CardFacts card={card} />
        </div>
      </div>
      <div className="owned__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Hide details" : "Earning rules & caps"}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPref("defaultCardId", isDefault ? undefined : card.id)}>
          {isDefault ? "Unset default" : "Set as default card"}
        </button>
        <button type="button" className="btn btn--danger-ghost btn--sm" onClick={() => toggleCard(card.id)}>
          Remove
        </button>
      </div>
      {open && (
        <div className="owned__details">
          <table className="mini-table">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Rate</th>
                <th>Condition</th>
              </tr>
            </thead>
            <tbody>
              {card.earnRules.map((r) => (
                <tr key={r.id}>
                  <td>{r.label}</td>
                  <td>{currency ? ruleRateDisplay(r, currency) : r.unitsPerAED}</td>
                  <td className="small">
                    {[r.capGroupId && card.capGroups?.find((g) => g.id === r.capGroupId)?.label, r.minMonthlySpendAED && `Monthly spend ≥ AED ${r.minMonthlySpendAED.toLocaleString("en-AE")}`].filter(Boolean).join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="owned__inputs">
            {card.capGroups?.map((g) => (
              <label key={g.id} className="field">
                <span>
                  {currency?.type === "cash" ? "Cashback" : currency?.unitPlural} already earned this period — {g.label}
                </span>
                <input
                  type="number"
                  min={0}
                  value={state.capUsage?.[g.id] ?? ""}
                  placeholder="Not tracked"
                  onChange={(e) => {
                    const capUsage = { ...(state.capUsage ?? {}) };
                    if (e.target.value === "") delete capUsage[g.id];
                    else capUsage[g.id] = Number(e.target.value);
                    updateCardState(card.id, { capUsage });
                  }}
                />
              </label>
            ))}
            {hasTiers && (
              <label className="field">
                <span>Your typical monthly spend on this card (AED) — unlocks tiered rates</span>
                <input
                  type="number"
                  min={0}
                  value={state.monthlySpendAED ?? ""}
                  placeholder="Unknown"
                  onChange={(e) => updateCardState(card.id, { monthlySpendAED: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </label>
            )}
            {!card.capGroups?.length && !hasTiers && <p className="small muted">No caps or spend tiers on this card.</p>}
          </div>
        </div>
      )}
    </li>
  );
}

export function WalletPage() {
  const { catalog, wallet, toggleCard, setWallet } = useCatalog();
  const [query, setQuery] = useState("");
  const owned = catalog.cards.walletCards(wallet);
  const available = useMemo(() => catalog.cards.search(query).filter((c) => !wallet.includes(c.id)), [catalog, query, wallet]);
  const byBank = useMemo(() => {
    const m = new Map<string, Card[]>();
    for (const c of available) m.set(c.bankId, [...(m.get(c.bankId) ?? []), c]);
    return [...m.entries()];
  }, [available]);

  return (
    <div className="page">
      <header className="page__head">
        <h1>Your wallet</h1>
        <p className="muted">Only these cards are ranked. Your wallet is stored on this device only.</p>
      </header>

      {owned.length ? (
        <ul className="owned-list">
          {owned.map((c) => (
            <OwnedCard key={c.id} card={c} />
          ))}
        </ul>
      ) : (
        <EmptyState icon="👛" title="Your wallet is empty">
          <p>Add the cards you already have below, or start with a sample wallet.</p>
          <button type="button" className="btn btn--primary" onClick={() => setWallet(SAMPLE_WALLET)}>
            Use sample wallet
          </button>
        </EmptyState>
      )}
      {owned.length > 0 && (
        <div className="row-actions">
          <button type="button" className="btn btn--primary" onClick={() => navigate("find")}>
            Find my best card →
          </button>
        </div>
      )}

      <section className="panel">
        <div className="panel__title-row">
          <h2 className="panel__title">Add cards</h2>
          <input className="input" type="search" placeholder="Search cards or banks" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search cards" />
        </div>
        {catalog.dataset.dataStatus === "demo" && (
          <p className="callout callout--demo small">
            The catalogue below is <strong>fictional demonstration data</strong>. Banks, cards and rates are invented to show how the engine works — they are not real UAE products.
          </p>
        )}
        {byBank.map(([bankId, cards]) => (
          <div key={bankId} className="bank-group">
            <h3>{catalog.cards.bank(bankId)?.name ?? bankId}</h3>
            <ul className="catalog">
              {cards.map((c) => (
                <li key={c.id} className="catalog__item">
                  <CardArt card={c} size="sm" />
                  <div className="catalog__body">
                    <div className="catalog__name">{c.name}</div>
                    <CardFacts card={c} />
                  </div>
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => toggleCard(c.id)}>
                    + Add
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!byBank.length && <p className="muted">No more cards match.</p>}
      </section>
    </div>
  );
}

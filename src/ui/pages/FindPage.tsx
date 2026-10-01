import { useDeferredValue, useMemo, useState } from "react";
import { CATEGORIES } from "../../core/domain/categories";
import type { Region, SpendCategory, Transaction } from "../../core/domain/types";
import { createHistoryEntry } from "../../core/history/history";
import { formatNumber } from "../../core/format";
import { parseTransactionInput, toTransaction } from "../../core/parser/transactionParser";
import { BestCardPanel, ComparisonView, MissingOut, OtherWalletCards, PotentialOpportunities } from "../components/results";
import { EmptyState } from "../components/ui";
import { navigate } from "../router";
import { SAMPLE_WALLET, useCatalog } from "../state/AppState";

const EXAMPLES = ["AED 200 petrol at ENOC", "500 Carrefour", "120 Talabat", "AED 3,500 Emirates flight", "2500 school fees", "800 Amazon", "AED 2,000 Etihad flight", "$250 hotel in London"];
const PAYMENT_METHODS = ["Physical card / tap", "Apple Pay", "Samsung Pay", "Google Pay"];

type Overrides = Partial<Pick<Transaction, "amount" | "merchantId" | "category" | "region" | "paymentMethod">>;

export function FindPage() {
  const { catalog, wallet, setWallet, prefs, rewardState, now, addHistory } = useCatalog();
  const [text, setText] = useState("");
  const [overrides, setOverrides] = useState<Overrides>({});
  const [usedCardId, setUsedCardId] = useState<string>();

  const parsed = useMemo(() => parseTransactionInput(text, catalog.merchants), [text, catalog]);

  const transaction = useMemo<Transaction | undefined>(() => {
    const merchant = overrides.merchantId !== undefined ? catalog.merchants.get(overrides.merchantId) : undefined;
    const merchantPatch: Partial<Transaction> =
      overrides.merchantId === undefined
        ? {}
        : merchant
          ? { merchantId: merchant.id, merchantName: merchant.name, category: merchant.category, mcc: merchant.mccs[0], channel: merchant.isOnline ? "online" : undefined }
          : { merchantId: undefined, merchantName: undefined, mcc: undefined };
    const patch: Partial<Transaction> = { ...merchantPatch };
    if (overrides.amount !== undefined) patch.amount = overrides.amount;
    if (overrides.category) patch.category = overrides.category;
    if (overrides.region) patch.region = overrides.region;
    if (overrides.paymentMethod !== undefined) patch.paymentMethod = overrides.paymentMethod === PAYMENT_METHODS[0] ? "Physical card" : overrides.paymentMethod;
    return toTransaction(parsed, now, patch);
  }, [parsed, overrides, catalog, now]);

  const deferredTx = useDeferredValue(transaction);
  const rec = useMemo(() => {
    if (!deferredTx || !wallet.length) return undefined;
    return catalog.recommend({ walletCardIds: wallet, transaction: deferredTx, preferences: prefs, userRewardState: rewardState, now, includeMissingOut: prefs.showMissingOut });
  }, [deferredTx, wallet, catalog, prefs, rewardState, now]);

  const onText = (value: string) => {
    setText(value);
    setOverrides({});
    setUsedCardId(undefined);
  };

  const onUse = (cardId: string) => {
    if (!rec) return;
    const entry = createHistoryEntry(rec, cardId, prefs.defaultCardId);
    if (entry) {
      addHistory(entry);
      setUsedCardId(cardId);
    }
  };

  const merchantId = overrides.merchantId ?? parsed.merchantId ?? "";
  const category = transaction?.category ?? parsed.category ?? "other";
  const region = transaction?.region ?? parsed.region;
  const merchants = useMemo(() => [...catalog.merchants.all()].sort((a, b) => a.name.localeCompare(b.name)), [catalog]);
  const walletEmpty = wallet.length === 0;

  return (
    <div className="find">
      <section className="hero">
        <form className="search" onSubmit={(e) => e.preventDefault()} role="search">
          <label htmlFor="q" className="search__label">
            What are you buying?
          </label>
          <input
            id="q"
            className="search__input"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoFocus
            placeholder="AED 200 petrol at ENOC"
            value={text}
            onChange={(e) => onText(e.target.value)}
          />
          <div className="examples" aria-label="Examples">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="chip" onClick={() => onText(ex)}>
                {ex}
              </button>
            ))}
          </div>

          <fieldset className="parsed" aria-label="Purchase details — correct anything we got wrong">
            <label className="field">
              <span>Amount (AED)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={overrides.amount ?? parsed.amount ?? ""}
                placeholder="0"
                onChange={(e) => setOverrides((o) => ({ ...o, amount: e.target.value === "" ? undefined : Number(e.target.value) }))}
              />
            </label>
            <label className="field">
              <span>Merchant</span>
              <select value={merchantId} onChange={(e) => setOverrides((o) => ({ ...o, merchantId: e.target.value, category: undefined }))}>
                <option value="">— Not specified —</option>
                {merchants.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Category</span>
              <select value={category} onChange={(e) => setOverrides((o) => ({ ...o, category: e.target.value as SpendCategory }))}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Where</span>
              <select value={region} onChange={(e) => setOverrides((o) => ({ ...o, region: e.target.value as Region }))}>
                <option value="domestic">In the UAE (AED)</option>
                <option value="international">Abroad / foreign currency</option>
              </select>
            </label>
            <label className="field">
              <span>Paying with</span>
              <select
                value={overrides.paymentMethod ?? parsed.paymentMethod ?? ""}
                onChange={(e) => setOverrides((o) => ({ ...o, paymentMethod: e.target.value || undefined }))}
              >
                <option value="">Not sure</option>
                {PAYMENT_METHODS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          {parsed.notes.length > 0 && (
            <div className="parsed-notes small muted">
              {parsed.notes.map((n) => (
                <div key={n}>ℹ️ {n}</div>
              ))}
            </div>
          )}
        </form>
      </section>

      {walletEmpty ? (
        <EmptyState icon="👛" title="Add the cards you own">
          <p>Recommendations only use cards in your wallet.</p>
          <div className="row-actions">
            <button type="button" className="btn btn--primary" onClick={() => navigate("wallet")}>
              Add my cards
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setWallet(SAMPLE_WALLET)}>
              Try a sample wallet
            </button>
          </div>
        </EmptyState>
      ) : !transaction ? (
        <EmptyState icon="💳" title="Type a purchase to see which card to tap">
          <p className="muted">
            Comparing {wallet.length} card{wallet.length > 1 ? "s" : ""} in your wallet · {catalog.offers.forCards(catalog.cards.walletCards(wallet), now).length} active offers apply to them.
          </p>
        </EmptyState>
      ) : rec?.bestCard ? (
        <div className="results" aria-live="polite">
          <BestCardPanel rec={rec} onUse={onUse} usedCardId={usedCardId} />
          <ComparisonView rec={rec} />
          <PotentialOpportunities rec={rec} />
          <OtherWalletCards rec={rec} />
          {usedCardId === undefined && rec.allCards.length > 1 && (
            <section className="panel panel--subtle small">
              Used a different card?{" "}
              {rec.allCards.slice(1).map((r) => (
                <button key={r.cardId} type="button" className="link-btn" onClick={() => onUse(r.cardId)}>
                  {catalog.cards.get(r.cardId)?.name}
                </button>
              ))}
            </section>
          )}
          {prefs.showMissingOut && <MissingOut rec={rec} />}
          <p className="calc-meta small muted">
            Calculated in {formatNumber(rec.computedInMs, 1)} ms from the internal dataset · {catalog.dataset.dataStatus === "demo" ? "demo data" : catalog.dataset.dataStatus} · estimates, not financial advice.
          </p>
        </div>
      ) : null}
    </div>
  );
}

import { useState } from "react";
import type { RewardCurrency } from "../../core/domain/types";
import { formatAED, formatAEDPerUnit, formatDate, formatValuationRate } from "../../core/format";
import { Badge, ConfirmButton, currencyTone, InfoTip, MILES_DISCLAIMER, POINTS_DISCLAIMER } from "../components/ui";
import { useCatalog } from "../state/AppState";

function ValuationRow({ currency }: { currency: RewardCurrency }) {
  const { prefs, setValuationOverride } = useCatalog();
  const v = currency.valuation;
  const override = prefs.valuationOverrides[currency.id];
  const current = override ?? v.aedValuePerUnit;
  const max = Math.max(0.1, (v.highEstimate ?? v.aedValuePerUnit) * 2.5);
  const [draft, setDraft] = useState<string>(override !== undefined ? String(override) : "");
  const sample = currency.type === "airline_miles" ? 1000 : 10000;

  return (
    <li className="valuation">
      <div className="valuation__head">
        <div>
          <Badge tone={currencyTone(currency)}>{currency.badge}</Badge> <strong>{currency.name}</strong>
          <InfoTip>{currency.type === "airline_miles" ? MILES_DISCLAIMER : POINTS_DISCLAIMER}</InfoTip>
        </div>
        <div className="valuation__current">
          {formatAEDPerUnit(current)} / {currency.unitSingular.toLowerCase()} <span className="muted small">({formatValuationRate(current, currency)})</span>
        </div>
      </div>
      <p className="small muted">
        Default {formatAEDPerUnit(v.aedValuePerUnit)}
        {v.lowEstimate !== undefined && v.highEstimate !== undefined && <> · typical range {formatAEDPerUnit(v.lowEstimate)}–{formatAEDPerUnit(v.highEstimate)}</>} · {v.valuationMethod.replace(/_/g, " ")} · {v.confidence} confidence · updated {formatDate(v.lastUpdatedAt)}
        {v.dataStatus === "demo" && <> · <Badge tone="demo">DEMO</Badge></>}
      </p>
      {v.notes && <p className="small">{v.notes}</p>}
      <div className="valuation__controls">
        <label className="field field--inline">
          <span>How much do you value one {currency.unitSingular.toLowerCase()}? (AED)</span>
          <input
            type="number"
            min={0}
            step="0.001"
            placeholder={String(v.aedValuePerUnit)}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const n = Number(e.target.value);
              setValuationOverride(currency.id, e.target.value === "" || !Number.isFinite(n) || n < 0 ? undefined : n);
            }}
          />
        </label>
        <input
          type="range"
          aria-label={`${currency.name} value slider`}
          min={0}
          max={max}
          step={0.0005}
          value={current}
          onChange={(e) => {
            setDraft(e.target.value);
            setValuationOverride(currency.id, Number(e.target.value));
          }}
        />
        {override !== undefined && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              setDraft("");
              setValuationOverride(currency.id, undefined);
            }}
          >
            Reset to default
          </button>
        )}
      </div>
      <p className="small muted">
        {sample.toLocaleString("en-AE")} {currency.unitPlural.toLowerCase()} ≈ {formatAED(sample * current)} at {override !== undefined ? "your" : "our"} valuation.
      </p>
    </li>
  );
}

export function SettingsPage() {
  const { catalog, wallet, prefs, setPref, resetAll, repo } = useCatalog();
  const [showAll, setShowAll] = useState(false);
  const walletCurrencies = new Set(catalog.cards.walletCards(wallet).map((c) => c.rewardCurrencyId));
  const currencies = catalog.valuations.all().filter((c) => c.type !== "cash" && (showAll || walletCurrencies.has(c.id)));

  return (
    <div className="page">
      <header className="page__head">
        <h1>Settings</h1>
      </header>

      <section className="panel">
        <h2 className="panel__title">Your reward valuations</h2>
        <p className="muted small">
          Frequent flyers often value miles differently from occasional travellers. Set your own value and every recommendation is recalculated with it. Stored on this device.
        </p>
        <label className="switch">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          <span>Show all reward currencies (not just those in my wallet)</span>
        </label>
        {currencies.length ? (
          <ul className="valuation-list">
            {currencies.map((c) => (
              <ValuationRow key={c.id} currency={c} />
            ))}
          </ul>
        ) : (
          <p className="muted">Your wallet only earns cashback, which is always valued at face value.</p>
        )}
      </section>

      <section className="panel">
        <h2 className="panel__title">Recommendations</h2>
        <label className="switch">
          <input type="checkbox" checked={prefs.showMissingOut} onChange={(e) => setPref("showMissingOut", e.target.checked)} />
          <span>Show “You’re missing out” — better cards I don’t own (kept separate from my wallet ranking)</span>
        </label>
      </section>

      <section className="panel">
        <h2 className="panel__title">Data & privacy</h2>
        <p className="small muted">
          Data source: <strong>{repo?.mode === "remote" ? "TapWise API server (refreshed dataset)" : "bundled demo dataset (no server connected)"}</strong>. Your wallet, valuations, registrations and history never leave this browser.
        </p>
        <ConfirmButton className="btn btn--danger-ghost" confirmLabel="Click again to erase everything" onConfirm={resetAll}>
          Reset all local data
        </ConfirmButton>
      </section>
    </div>
  );
}

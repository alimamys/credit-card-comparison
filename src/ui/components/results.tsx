import { useState } from "react";
import type { CardOffer, RecommendationResult, RewardCurrency, TransactionValueResult } from "../../core/domain/types";
import {
  formatAED,
  formatAEDRange,
  formatDate,
  formatNumber,
  formatRelativeDays,
  formatRewardQuantity,
  formatValuationRate,
} from "../../core/format";
import type { Catalog } from "../../core/services/catalog";
import { daysSince } from "../../core/time";
import { useCatalog } from "../state/AppState";
import { describeOfferValue, expiryLabel, OfferDetailsModal } from "./offers";
import { Badge, type BadgeTone, benefitBadge, CardArt, ConfidencePill, currencyTone, InfoTip, MILES_DISCLAIMER, Modal, POINTS_DISCLAIMER } from "./ui";

// ---------------------------------------------------------------------------
// Grouping benefits into "what you actually receive"
// ---------------------------------------------------------------------------

export interface RewardLine {
  key: string;
  tone: BadgeTone;
  badge: string;
  /** Native reward, e.g. "600 Etihad Guest Miles" or "AED 20.00 cashback". */
  native: string;
  /** Normalised value line. */
  valueText?: string;
  aed: number;
  low: number;
  high: number;
  breakdown?: string;
  currency?: RewardCurrency;
  isEstimate: boolean;
  kind: "reward" | "discount" | "fee";
}

export function rewardLines(result: TransactionValueResult, catalog: Catalog): RewardLine[] {
  const lines: RewardLine[] = [];
  const byCurrency = new Map<string, TransactionValueResult["benefits"]>();
  for (const b of result.benefits) {
    if (b.type === "discount" || b.type === "fee") continue;
    const k = `${b.currencyId}:${b.type === "statement_credit" ? "credit" : "r"}`;
    byCurrency.set(k, [...(byCurrency.get(k) ?? []), b]);
  }
  for (const [key, items] of byCurrency) {
    const currency = catalog.valuations.get(items[0].currencyId ?? "");
    const qty = items.reduce((a, b) => a + (b.quantity ?? 0), 0);
    const aed = items.reduce((a, b) => a + b.monetaryValueAED, 0);
    const low = items.reduce((a, b) => a + b.lowValueAED, 0);
    const high = items.reduce((a, b) => a + b.highValueAED, 0);
    const { tone, label } = benefitBadge(items[0], currency);
    const isCash = currency?.type === "cash";
    const isCredit = items[0].type === "statement_credit";
    lines.push({
      key,
      tone,
      badge: label,
      native: isCredit ? `${formatAED(qty)} statement credit` : currency ? formatRewardQuantity(qty, currency) : `${formatNumber(qty)} units`,
      valueText: isCash ? undefined : `≈ ${formatAED(aed)} estimated value`,
      aed,
      low,
      high,
      breakdown:
        items.length > 1 && currency
          ? items.map((i) => `${formatNumber(i.quantity ?? 0, isCash ? 2 : 0)} ${i.origin === "base" ? "standard" : "bonus"}`).join(" + ")
          : undefined,
      currency,
      isEstimate: !isCash,
      kind: "reward",
    });
  }
  for (const b of result.benefits) {
    if (b.type === "discount") {
      lines.push({ key: `d-${b.offerId}`, tone: "discount", badge: "MERCHANT DISCOUNT", native: `${formatAED(b.monetaryValueAED)} off at checkout`, aed: b.monetaryValueAED, low: b.monetaryValueAED, high: b.monetaryValueAED, isEstimate: false, kind: "discount" });
    }
    if (b.type === "fee") {
      lines.push({ key: "fee", tone: "warn", badge: "FX FEE", native: `−${formatAED(-b.monetaryValueAED)} foreign transaction fee`, aed: b.monetaryValueAED, low: b.monetaryValueAED, high: b.monetaryValueAED, isEstimate: false, kind: "fee" });
    }
  }
  return lines;
}

/** Headline native reward for compact views: "600 Etihad Guest Miles". */
export function primaryReward(result: TransactionValueResult, catalog: Catalog): string {
  const lines = rewardLines(result, catalog).filter((l) => l.kind === "reward");
  if (!lines.length) return result.discounts.length ? "Discount only" : "No reward";
  return lines.map((l) => l.native).join(" + ");
}

function ValuationNote({ line }: { line: RewardLine }) {
  const { catalog, prefs } = useCatalog();
  if (!line.currency || line.currency.type === "cash") return null;
  const v = catalog.valuations.engine(prefs.valuationOverrides).resolve(line.currency.id);
  if (!v) return null;
  return (
    <div className="reward-line__valuation">
      Valuation: <strong>{formatValuationRate(v.aedValuePerUnit, line.currency)}</strong>
      {v.isUserDefined ? <Badge tone="neutral">YOUR VALUE</Badge> : null}
      {line.high > line.low && !v.isUserDefined && <span> · Typical estimated range: {formatAEDRange(line.low, line.high)}</span>}
      <InfoTip label="How miles and points are valued">{line.currency.type === "airline_miles" ? MILES_DISCLAIMER : POINTS_DISCLAIMER}</InfoTip>
    </div>
  );
}

export function RewardLines({ result, detailed = true }: { result: TransactionValueResult; detailed?: boolean }) {
  const { catalog } = useCatalog();
  const lines = rewardLines(result, catalog);
  if (!lines.length) return <p className="muted">No rewards on this purchase.</p>;
  return (
    <ul className="reward-lines">
      {lines.map((l) => (
        <li key={l.key} className={`reward-line reward-line--${l.kind}`}>
          <div className="reward-line__main">
            <Badge tone={l.tone}>{l.badge}</Badge>
            <span className="reward-line__native">{l.native}</span>
          </div>
          {l.valueText && <div className="reward-line__value">{l.valueText}</div>}
          {l.breakdown && <div className="reward-line__breakdown">{l.breakdown}</div>}
          {detailed && <ValuationNote line={l} />}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// "Why?" — full calculation details
// ---------------------------------------------------------------------------

export function CalculationDetails({ result }: { result: TransactionValueResult }) {
  const { catalog, now } = useCatalog();
  const card = catalog.cards.get(result.cardId)!;
  const bank = catalog.cards.bankForCard(card);
  const verified = result.dataFreshness.lastVerifiedAt;
  const sources = result.dataFreshness.sources;
  return (
    <div className="calc">
      <ol className="calc-steps">
        {result.steps.map((s, i) => (
          <li key={i} className={`calc-step calc-step--${s.kind ?? "note"}`}>
            <div className="calc-step__label">{s.label}</div>
            <div className="calc-step__value">{s.value}</div>
            {s.detail && <div className="calc-step__detail">{s.detail}</div>}
          </li>
        ))}
      </ol>

      {result.potential.extraAEDValue > 0 && (
        <div className="callout callout--warn">
          <strong>Potential additional value: {formatAED(result.potential.extraAEDValue)}</strong> (not counted in the ranking)
          <ul className="plain-list">
            {result.potential.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {result.warnings.length > 0 && (
        <div className="callout callout--warn">
          {result.warnings.map((w) => (
            <div key={w}>⚠️ {w}</div>
          ))}
        </div>
      )}

      <dl className="kv-list kv-list--compact">
        <div className="kv">
          <dt>Confidence</dt>
          <dd>
            <ConfidencePill confidence={result.confidence} />{" "}
            <span className="muted small">
              {result.confidence === "exact"
                ? "Cash rewards with no unknown conditions."
                : result.confidence === "estimated"
                  ? "Includes miles/points converted with an estimated valuation."
                  : "Some value depends on registration, a promo code, spend tiers or unconfirmed stacking."}
            </span>
          </dd>
        </div>
        <div className="kv">
          <dt>Effective return</dt>
          <dd>{formatNumber(result.effectiveReturnPercentage, 2)}% of the purchase</dd>
        </div>
        {result.valueRange.low !== result.valueRange.high && (
          <div className="kv">
            <dt>Estimated range</dt>
            <dd>{formatAEDRange(result.valueRange.low, result.valueRange.high)}</dd>
          </div>
        )}
        <div className="kv">
          <dt>Data</dt>
          <dd>
            {result.dataFreshness.dataStatus === "demo" ? <Badge tone="demo">DEMO DATA</Badge> : <Badge tone="good">{result.dataFreshness.dataStatus.toUpperCase()}</Badge>}{" "}
            {verified ? `Verified ${formatRelativeDays(daysSince(verified, now))} (${formatDate(verified)})` : "Not yet verified"}
          </dd>
        </div>
        <div className="kv">
          <dt>Sources</dt>
          <dd>
            <ul className="plain-list small">
              <li>
                Card terms: {bank?.name ?? card.bankId}
                {card.termsUrl ? (
                  <>
                    {" "}
                    · <a href={card.termsUrl} target="_blank" rel="noreferrer">T&amp;Cs</a>
                  </>
                ) : (
                  <span className="muted"> · demo record, no live source</span>
                )}
              </li>
              {sources
                .filter((s) => !s.url.startsWith("demo://"))
                .map((s, i) => (
                  <li key={i}>
                    {s.publisher} · <a href={s.url} target="_blank" rel="noreferrer">source</a> · retrieved {formatDate(s.retrievedAt)}
                  </li>
                ))}
              {result.appliedOffers.map((o) => (
                <li key={o.id}>
                  Offer “{o.title}” — {o.publisher}
                  {o.sourceUrl.startsWith("demo://") && <span className="muted"> (demo)</span>}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function WhyButton({ result, label = "Why?" }: { result: TransactionValueResult; label?: string }) {
  const [open, setOpen] = useState(false);
  const { catalog } = useCatalog();
  const card = catalog.cards.get(result.cardId);
  return (
    <>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <Modal title={`How we calculated this — ${card?.name}`} onClose={() => setOpen(false)}>
          <CalculationDetails result={result} />
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Best card
// ---------------------------------------------------------------------------

function useOfferModal() {
  const [offer, setOffer] = useState<{ offer: CardOffer; dups?: string[] }>();
  const modal = offer ? <OfferDetailsModal offer={offer.offer} duplicateOfferIds={offer.dups} onClose={() => setOffer(undefined)} /> : null;
  return { open: (o: CardOffer, dups?: string[]) => setOffer({ offer: o, dups }), modal };
}

export function BestCardPanel({ rec, onUse, usedCardId }: { rec: RecommendationResult; onUse(cardId: string): void; usedCardId?: string }) {
  const { catalog, now } = useCatalog();
  const best = rec.bestCard!;
  const card = catalog.cards.get(best.cardId)!;
  const bank = catalog.cards.bankForCard(card);
  const offerModal = useOfferModal();
  const deal = rec.dealHighlights.find((d) => d.cardId === best.cardId);
  const promoValue = best.promotionalRewards.reduce((a, p) => a + p.estimatedAEDValue, 0) + best.discounts.reduce((a, d) => a + d.estimatedAEDValue, 0);
  const showRange = best.confidence !== "exact" && best.valueRange.high - best.valueRange.low >= 0.01;
  const verified = best.dataFreshness.lastVerifiedAt;
  const isDemo = best.dataFreshness.dataStatus === "demo";

  return (
    <section className="best" aria-labelledby="best-title">
      <div className="best__ribbon">🏆 BEST CARD IN YOUR WALLET</div>
      <div className="best__grid">
        <div className="best__card">
          <CardArt card={card} size="lg" />
          <div>
            <div className="eyebrow">Use this card</div>
            <h2 id="best-title" className="best__name">
              {card.name}
            </h2>
            <div className="muted">{bank?.name}</div>
          </div>
        </div>

        <div className="best__value">
          <div className="eyebrow">{best.confidence === "exact" ? "Cashback value" : "Estimated value"}</div>
          <div className="best__amount">{formatAED(best.totalEstimatedAEDValue)}</div>
          {showRange && <div className="best__range">Estimated range {formatAEDRange(best.valueRange.low, best.valueRange.high)}</div>}
          <div className="best__return">
            Effective value return <strong>{formatNumber(best.effectiveReturnPercentage, 2)}%</strong>
          </div>
        </div>
      </div>

      <div className="best__receive">
        <h3>You'll receive</h3>
        <RewardLines result={best} />
        {promoValue > 0 && best.baseReward.estimatedAEDValue > 0 && (
          <p className="best__sum">
            {formatAED(best.baseReward.estimatedAEDValue)} standard + {formatAED(promoValue)} from current deals = <strong>{formatAED(best.totalEstimatedAEDValue)}</strong>
          </p>
        )}
      </div>

      {deal && (
        <div className="deal-flash">
          <div className="deal-flash__title">🔥 Limited-time deal</div>
          {deal.offerIds.map((id) => {
            const o = best.appliedOffers.find((x) => x.id === id)!;
            return (
              <div key={id} className="deal-flash__row">
                <span>
                  <strong>{o.title}</strong> — {describeOfferValue(o, catalog)} · {expiryLabel(o, now)}
                </span>
                <button type="button" className="link-btn" onClick={() => offerModal.open(o)}>
                  View offer details
                </button>
              </div>
            );
          })}
          <div className="deal-flash__ranks">
            <span>
              Without deal: <strong>#{deal.rankWithout}</strong>
            </span>
            <span aria-hidden="true">→</span>
            <span>
              With current deal: <strong>#{deal.rankWith}</strong>
            </span>
          </div>
        </div>
      )}

      <div className="best__why">
        <h3>Why this card wins</h3>
        <ul className="plain-list">
          {best.explanation.map((e) => (
            <li key={e}>{e}</li>
          ))}
          {rec.allCards[1] && (
            <li className="muted">
              {formatAED(best.totalEstimatedAEDValue - rec.allCards[1].totalEstimatedAEDValue)} more than your next-best card ({catalog.cards.get(rec.allCards[1].cardId)?.name}).
            </li>
          )}
        </ul>
        {best.warnings.map((w) => (
          <div key={w} className="callout callout--warn small">
            ⚠️ {w}
          </div>
        ))}
        {!deal && best.appliedOffers.length > 0 && (
          <div className="chips">
            {best.appliedOffers.map((o) => (
              <button key={o.id} type="button" className="chip chip--deal" onClick={() => offerModal.open(o)}>
                🔥 {o.title}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="best__actions">
        <WhyButton result={best} label="Why? How we calculated this" />
        <button type="button" className={`btn ${usedCardId === best.cardId ? "btn--done" : "btn--primary"}`} onClick={() => onUse(best.cardId)} disabled={usedCardId === best.cardId}>
          {usedCardId === best.cardId ? "✓ Logged to history" : "I used this card"}
        </button>
      </div>

      <div className="best__meta small muted">
        {isDemo && <Badge tone="demo">DEMO DATA</Badge>} {verified ? `Verified ${formatDate(verified)}` : "Not yet verified"} · Source: {bank?.name}
      </div>
      {offerModal.modal}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Potential (registration) & comparison
// ---------------------------------------------------------------------------

export function PotentialOpportunities({ rec }: { rec: RecommendationResult }) {
  const { catalog } = useCatalog();
  const offerModal = useOfferModal();
  const items = rec.allCards.filter((r) => r.potential.extraAEDValue > 0);
  if (!items.length) return null;
  return (
    <section className="panel">
      <h2 className="panel__title">Potential extra value</h2>
      <p className="muted small">Not counted in the ranking until conditions are confirmed.</p>
      <ul className="potential-list">
        {items.map((r) => {
          const card = catalog.cards.get(r.cardId)!;
          const highlight = rec.potentialHighlights.find((h) => h.cardId === r.cardId);
          return (
            <li key={r.cardId} className="potential">
              <CardArt card={card} size="sm" />
              <div className="potential__body">
                <div>
                  <strong>{card.name}</strong>: potential value <strong>{formatAED(r.potential.totalEstimatedAEDValue)}</strong>
                  <span className="muted"> (currently {formatAED(r.totalEstimatedAEDValue)})</span>
                </div>
                {r.potential.reasons.map((reason) => (
                  <div key={reason} className="small">
                    ⚠️ {reason}
                  </div>
                ))}
                {highlight && <div className="small good">Would rank #{highlight.wouldRank} in your wallet.</div>}
                <div className="chips">
                  {r.conditionalOffers
                    .filter((c) => r.potential.offerIds.includes(c.offer.id))
                    .map((c) => (
                      <button key={c.offer.id} type="button" className="btn btn--ghost btn--sm" onClick={() => offerModal.open(c.offer, c.duplicateOfferIds)}>
                        {c.offer.registrationRequired ? "View registration details" : "View offer details"}
                      </button>
                    ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {offerModal.modal}
    </section>
  );
}

function dealsValue(r: TransactionValueResult) {
  return r.promotionalRewards.reduce((a, p) => a + p.estimatedAEDValue, 0) + r.discounts.reduce((a, d) => a + d.estimatedAEDValue, 0);
}

function rewardValue(r: TransactionValueResult) {
  return r.baseReward.estimatedAEDValue;
}

export function ComparisonView({ rec }: { rec: RecommendationResult }) {
  const { catalog } = useCatalog();
  const top = rec.topThree;
  if (top.length < 2) return null;
  const cards = top.map((r) => catalog.cards.get(r.cardId)!);
  const anyFees = top.some((r) => r.fees.length);
  return (
    <section className="panel">
      <h2 className="panel__title">Top {top.length} compared</h2>

      <div className="compare-table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Metric</span>
              </th>
              {top.map((r, i) => (
                <th key={r.cardId} scope="col" className={i === 0 ? "is-best" : ""}>
                  <div className="compare-head">
                    <CardArt card={cards[i]} size="sm" />
                    <span>
                      <span className="rank">#{r.rank}</span> {cards[i].name}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="row-total">
              <th scope="row">Total value</th>
              {top.map((r, i) => (
                <td key={r.cardId} className={i === 0 ? "is-best" : ""}>
                  {formatAED(r.totalEstimatedAEDValue)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">Reward</th>
              {top.map((r) => (
                <td key={r.cardId}>{primaryReward(r, catalog)}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Standard reward value</th>
              {top.map((r) => (
                <td key={r.cardId}>{formatAED(rewardValue(r))}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Deals</th>
              {top.map((r) => (
                <td key={r.cardId}>{dealsValue(r) > 0 ? formatAED(dealsValue(r)) : "—"}</td>
              ))}
            </tr>
            {anyFees && (
              <tr>
                <th scope="row">FX fee</th>
                {top.map((r) => (
                  <td key={r.cardId}>{r.fees.length ? formatAED(r.fees[0].estimatedAEDValue) : "—"}</td>
                ))}
              </tr>
            )}
            <tr>
              <th scope="row">Effective return</th>
              {top.map((r) => (
                <td key={r.cardId}>{formatNumber(r.effectiveReturnPercentage, 2)}%</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Confidence</th>
              {top.map((r) => (
                <td key={r.cardId}>
                  <ConfidencePill confidence={r.confidence} />
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">
                <span className="sr-only">Details</span>
              </th>
              {top.map((r) => (
                <td key={r.cardId}>
                  <WhyButton result={r} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <ol className="compare-stack">
        {top.map((r, i) => (
          <li key={r.cardId} className={`stack-card ${i === 0 ? "is-best" : ""}`}>
            <ResultRowBody result={r} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function ResultRowBody({ result }: { result: TransactionValueResult }) {
  const { catalog } = useCatalog();
  const card = catalog.cards.get(result.cardId)!;
  const currency = catalog.valuations.get(card.rewardCurrencyId);
  return (
    <div className="result-row">
      <div className="result-row__card">
        <span className="rank">#{result.rank}</span>
        <CardArt card={card} size="sm" />
        <div>
          <div className="result-row__name">{card.name}</div>
          <div className="result-row__reward">
            <Badge tone={currencyTone(currency)}>{currency?.badge ?? "REWARD"}</Badge> {primaryReward(result, catalog)}
          </div>
          {result.appliedOffers.length > 0 && (
            <div className="small deal-text">🔥 {result.appliedOffers.map((o) => o.title).join(" · ")}</div>
          )}
          {result.potential.extraAEDValue > 0 && <div className="small warn-text">⚠️ +{formatAED(result.potential.extraAEDValue)} potential</div>}
        </div>
      </div>
      <div className="result-row__value">
        <div className="result-row__aed">{formatAED(result.totalEstimatedAEDValue)}</div>
        <div className="small muted">
          {formatNumber(result.effectiveReturnPercentage, 2)}% · <ConfidencePill confidence={result.confidence} />
        </div>
        <WhyButton result={result} />
      </div>
    </div>
  );
}

export function OtherWalletCards({ rec }: { rec: RecommendationResult }) {
  const rest = rec.allCards.slice(3);
  if (!rest.length) return null;
  return (
    <section className="panel">
      <h2 className="panel__title">Rest of your wallet</h2>
      <ol className="result-list">
        {rest.map((r) => (
          <li key={r.cardId}>
            <ResultRowBody result={r} />
          </li>
        ))}
      </ol>
    </section>
  );
}

export function MissingOut({ rec }: { rec: RecommendationResult }) {
  const { catalog } = useCatalog();
  if (!rec.missingOut.length || !rec.bestCard) return null;
  const best = rec.missingOut[0];
  const card = catalog.cards.get(best.cardId)!;
  return (
    <section className="panel panel--subtle">
      <h2 className="panel__title">You're missing out</h2>
      <p className="small muted">Cards you don't own — shown separately and never part of your wallet ranking.</p>
      <p>
        Another UAE card currently available could earn approximately <strong>{formatAED(best.totalEstimatedAEDValue)}</strong> on this purchase ({formatAED(best.totalEstimatedAEDValue - rec.bestCard.totalEstimatedAEDValue)} more than your best card).
      </p>
      <ul className="result-list">
        {rec.missingOut.map((r) => {
          const c = catalog.cards.get(r.cardId)!;
          return (
            <li key={r.cardId} className="result-row">
              <div className="result-row__card">
                <CardArt card={c} size="sm" />
                <div>
                  <div className="result-row__name">{c.name}</div>
                  <div className="small muted">
                    {catalog.cards.bankForCard(c)?.name} · {primaryReward(r, catalog)}
                  </div>
                </div>
              </div>
              <div className="result-row__value">
                <div className="result-row__aed">{formatAED(r.totalEstimatedAEDValue)}</div>
                <WhyButton result={r} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="small muted">Not financial advice. Consider fees, eligibility and your overall spending before applying for a card. {card.annualFeeAED ? `${card.name} has an annual fee of ${formatAED(card.annualFeeAED, { compact: true })}.` : ""}</p>
    </section>
  );
}

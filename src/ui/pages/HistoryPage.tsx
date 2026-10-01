import { categoryMeta } from "../../core/domain/categories";
import { summariseByMonth } from "../../core/history/history";
import { formatAED, formatDate } from "../../core/format";
import { ConfirmButton, EmptyState } from "../components/ui";
import { navigate } from "../router";
import { useCatalog } from "../state/AppState";

function monthLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, 15)));
}

export function HistoryPage() {
  const { catalog, history, clearHistory } = useCatalog();
  const months = summariseByMonth(history);

  if (!history.length) {
    return (
      <div className="page">
        <header className="page__head">
          <h1>Your value</h1>
        </header>
        <EmptyState icon="📈" title="Nothing tracked yet">
          <p>After a search, tap “I used this card” to track the rewards you earn and the extra value from choosing the right card.</p>
          <button type="button" className="btn btn--primary" onClick={() => navigate("find")}>
            Find my best card
          </button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page__head">
        <h1>Your value</h1>
        <p className="muted">Estimated values at the time of purchase. Stored on this device only.</p>
      </header>

      <div className="stat-grid">
        {months.map((m) => (
          <section key={m.period} className="stat-card">
            <h2>{monthLabel(m.period)}</h2>
            <div className="stat">
              <span className="stat__label">You optimised</span>
              <span className="stat__value">{formatAED(m.spendAED, { compact: true })} spending</span>
            </div>
            <div className="stat">
              <span className="stat__label">Estimated rewards earned</span>
              <span className="stat__value">{formatAED(m.rewardsAED)}</span>
            </div>
            <div className="stat stat--accent">
              <span className="stat__label">Estimated extra value from choosing recommended cards</span>
              <span className="stat__value">{formatAED(m.extraValueAED)}</span>
            </div>
            <div className="small muted">
              {m.transactions} purchase{m.transactions > 1 ? "s" : ""} · followed the recommendation {m.followedRecommendation}×
            </div>
          </section>
        ))}
      </div>

      <section className="panel">
        <div className="panel__title-row">
          <h2 className="panel__title">Purchases</h2>
          <ConfirmButton onConfirm={clearHistory}>Clear history</ConfirmButton>
        </div>
        <ul className="history-list">
          {history.map((e) => {
            const card = catalog.cards.get(e.cardIdUsed);
            const followed = e.cardIdUsed === e.recommendedCardId;
            return (
              <li key={e.id} className="history-item">
                <div>
                  <div>
                    <strong>{formatAED(e.amount, { compact: true })}</strong> {e.merchantName ?? categoryMeta(e.category).label}
                  </div>
                  <div className="small muted">
                    {formatDate(e.date)} · {card?.name ?? e.cardIdUsed} {followed ? "✓ recommended" : `(best was ${formatAED(e.bestValueAED)})`}
                  </div>
                </div>
                <div className="history-item__value">
                  <div>{formatAED(e.valueAED)}</div>
                  <div className={`small ${e.valueAED - e.baselineValueAED >= 0 ? "good" : "warn-text"}`}>
                    {e.valueAED - e.baselineValueAED >= 0 ? "+" : ""}
                    {formatAED(e.valueAED - e.baselineValueAED)} vs {e.baselineLabel}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

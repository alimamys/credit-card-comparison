import { AdminPage } from "./pages/admin/AdminPage";
import { DealsPage } from "./pages/DealsPage";
import { FindPage } from "./pages/FindPage";
import { HistoryPage } from "./pages/HistoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WalletPage } from "./pages/WalletPage";
import { type Route, useRoute } from "./router";
import { useAppState } from "./state/AppState";

const NAV: { route: Route; label: string; icon: string }[] = [
  { route: "find", label: "Find card", icon: "🔎" },
  { route: "wallet", label: "Wallet", icon: "👛" },
  { route: "deals", label: "Deals", icon: "🏷️" },
  { route: "history", label: "Value", icon: "📈" },
  { route: "settings", label: "Settings", icon: "⚙️" },
];

export function App() {
  const { route, sub } = useRoute();
  const { ready, error, wallet, dataset, repo } = useAppState();

  return (
    <div className="app">
      <header className="topbar">
        <a href="#/find" className="brand" aria-label="TapWise home">
          <span className="brand__mark" aria-hidden="true">
            <span />
          </span>
          <span className="brand__name">
            TapWise <small>UAE</small>
          </span>
        </a>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.route} href={`#/${n.route}`} className={`nav__link ${route === n.route ? "is-active" : ""}`} aria-current={route === n.route ? "page" : undefined}>
              <span className="nav__icon" aria-hidden="true">
                {n.icon}
              </span>
              <span className="nav__label">{n.label}</span>
              {n.route === "wallet" && wallet.length > 0 && <span className="nav__count">{wallet.length}</span>}
            </a>
          ))}
        </nav>
        <a href="#/admin" className={`admin-link ${route === "admin" ? "is-active" : ""}`}>
          Admin
        </a>
      </header>

      {dataset?.dataStatus === "demo" && (
        <div className="demo-banner" role="note">
          <strong>Demo data.</strong> Banks, cards, offers and valuations shown are fictional and for demonstration only — not real UAE products or promotions.
          {repo?.mode === "local" && <span className="demo-banner__mode"> Offline demo mode.</span>}
        </div>
      )}

      <main className="main">
        {error ? (
          <div className="callout callout--danger">Could not load card data: {error}</div>
        ) : !ready ? (
          <div className="loading" aria-busy="true">
            <div className="spinner" />
            Loading card data…
          </div>
        ) : route === "wallet" ? (
          <WalletPage />
        ) : route === "deals" ? (
          <DealsPage />
        ) : route === "history" ? (
          <HistoryPage />
        ) : route === "settings" ? (
          <SettingsPage />
        ) : route === "admin" ? (
          <AdminPage sub={sub} />
        ) : (
          <FindPage />
        )}
      </main>

      <footer className="footer small muted">
        TapWise compares the estimated AED value of rewards across cards you already own. Miles and points are estimates, not guaranteed cash values. Not financial advice — always check your card's terms.
      </footer>
    </div>
  );
}

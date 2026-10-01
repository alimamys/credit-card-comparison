import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { SAMPLE_WALLET } from "../../core/data/demo";
import type { CardUserState, Dataset, UserPreferences, UserRewardState } from "../../core/domain/types";
import type { HistoryEntry } from "../../core/history/history";
import { type Catalog, createCatalog } from "../../core/services/catalog";
import { connectRepository, type DataRepository } from "./repository";
import { clearAll, load, save } from "./storage";

/**
 * App-wide state. User data (wallet, valuations, registrations, history) is
 * stored locally in the browser; nothing personal is sent to the server.
 */

interface AppStateValue {
  ready: boolean;
  error?: string;
  repo?: DataRepository;
  dataset?: Dataset;
  catalog?: Catalog;
  lastRefreshedAt?: string | null;
  now: Date;

  wallet: string[];
  setWallet(ids: string[]): void;
  toggleCard(id: string): void;

  prefs: UserPreferences;
  setValuationOverride(currencyId: string, value: number | undefined): void;
  setPref<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]): void;

  rewardState: UserRewardState;
  toggleRegistered(offerId: string): void;
  updateCardState(cardId: string, patch: Partial<CardUserState>): void;

  history: HistoryEntry[];
  addHistory(entry: HistoryEntry): void;
  clearHistory(): void;

  replaceDataset(dataset: Dataset): void;
  reloadDataset(): Promise<void>;
  resetAll(): void;
}

const Ctx = createContext<AppStateValue | null>(null);

const DEFAULT_PREFS: UserPreferences = { valuationOverrides: {}, showMissingOut: true };
const DEFAULT_REWARD_STATE: UserRewardState = { registeredOfferIds: [], cards: {} };

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<DataRepository>();
  const [dataset, setDataset] = useState<Dataset>();
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>();
  const [error, setError] = useState<string>();
  const [now, setNow] = useState(() => new Date());

  const [wallet, setWalletState] = useState<string[]>(() => load("wallet", []));
  const [prefs, setPrefs] = useState<UserPreferences>(() => ({ ...DEFAULT_PREFS, ...load("prefs", {}) }));
  const [rewardState, setRewardState] = useState<UserRewardState>(() => ({ ...DEFAULT_REWARD_STATE, ...load("reward-state", {}) }));
  const [history, setHistory] = useState<HistoryEntry[]>(() => load("history", []));

  useEffect(() => save("wallet", wallet), [wallet]);
  useEffect(() => save("prefs", prefs), [prefs]);
  useEffect(() => save("reward-state", rewardState), [rewardState]);
  useEffect(() => save("history", history), [history]);

  // Keep "now" fresh so offers start/expire without a reload.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await connectRepository();
        const { dataset: ds, lastRefreshedAt: lr } = await r.load();
        if (cancelled) return;
        setRepo(r);
        setDataset(ds);
        setLastRefreshedAt(lr);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const catalog = useMemo(() => (dataset ? createCatalog(dataset) : undefined), [dataset]);

  const setWallet = useCallback((ids: string[]) => setWalletState([...new Set(ids)]), []);
  const toggleCard = useCallback(
    (id: string) => setWalletState((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id])),
    [],
  );

  const setValuationOverride = useCallback((currencyId: string, value: number | undefined) => {
    setPrefs((p) => {
      const valuationOverrides = { ...p.valuationOverrides };
      if (value === undefined || !Number.isFinite(value)) delete valuationOverrides[currencyId];
      else valuationOverrides[currencyId] = value;
      return { ...p, valuationOverrides };
    });
  }, []);

  const setPref = useCallback(<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  }, []);

  const toggleRegistered = useCallback((offerId: string) => {
    setRewardState((s) => ({
      ...s,
      registeredOfferIds: s.registeredOfferIds.includes(offerId) ? s.registeredOfferIds.filter((x) => x !== offerId) : [...s.registeredOfferIds, offerId],
    }));
  }, []);

  const updateCardState = useCallback((cardId: string, patch: Partial<CardUserState>) => {
    setRewardState((s) => ({ ...s, cards: { ...s.cards, [cardId]: { ...(s.cards[cardId] ?? {}), ...patch } } }));
  }, []);

  const addHistory = useCallback((entry: HistoryEntry) => setHistory((h) => [entry, ...h].slice(0, 1000)), []);
  const clearHistory = useCallback(() => setHistory([]), []);

  const replaceDataset = useCallback((ds: Dataset) => setDataset(ds), []);
  const reloadDataset = useCallback(async () => {
    if (!repo) return;
    const r = await repo.load();
    setDataset(r.dataset);
    setLastRefreshedAt(r.lastRefreshedAt);
  }, [repo]);

  const resetAll = useCallback(() => {
    clearAll();
    setWalletState([]);
    setPrefs(DEFAULT_PREFS);
    setRewardState(DEFAULT_REWARD_STATE);
    setHistory([]);
    void repo?.reset?.().then(setDataset);
  }, [repo]);

  const value: AppStateValue = {
    ready: !!catalog,
    error,
    repo,
    dataset,
    catalog,
    lastRefreshedAt,
    now,
    wallet,
    setWallet,
    toggleCard,
    prefs,
    setValuationOverride,
    setPref,
    rewardState,
    toggleRegistered,
    updateCardState,
    history,
    addHistory,
    clearHistory,
    replaceDataset,
    reloadDataset,
    resetAll,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState must be used inside AppStateProvider");
  return v;
}

/** Hook for components that only render once data is ready. */
export function useCatalog(): AppStateValue & { catalog: Catalog; dataset: Dataset } {
  const v = useAppState();
  if (!v.catalog || !v.dataset) throw new Error("Catalog not ready");
  return v as AppStateValue & { catalog: Catalog; dataset: Dataset };
}

export { SAMPLE_WALLET };

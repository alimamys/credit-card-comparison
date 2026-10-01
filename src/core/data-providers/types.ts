import type { Bank, Card, CardOffer, DataSource, Merchant, MccCode, RewardCurrency, RewardValuation } from "../domain/types";

/**
 * Data providers sit underneath the engines. Each provider fetches from one
 * kind of source (issuer site, T&Cs, network offers portal, loyalty programme,
 * a partner API, an admin feed) and returns NORMALISED records with provenance.
 *
 * Providers run server-side only (see server/ingestion). The browser never
 * scrapes financial websites; it reads the refreshed internal dataset.
 */

export type ProviderKind = "bank" | "merchantOffers" | "loyaltyValuation" | "cardNetworkOffers" | "admin";

export interface RefreshPolicy {
  /** How often the scheduler should run this provider. */
  intervalHours: number;
  description: string;
}

export const REFRESH_POLICIES: Record<ProviderKind, RefreshPolicy> = {
  merchantOffers: { intervalHours: 24, description: "Current offers — daily" },
  cardNetworkOffers: { intervalHours: 24, description: "Network offers — daily" },
  bank: { intervalHours: 24 * 7, description: "Card earning structures — weekly or on detected change" },
  loyaltyValuation: { intervalHours: 24 * 7, description: "Reward valuations — weekly" },
  admin: { intervalHours: 24, description: "Admin-entered verified data — daily sync" },
};

export interface ProviderContext {
  now: Date;
  fetch: typeof fetch;
}

export interface ProviderResult {
  providerId: string;
  fetchedAt: string;
  source: DataSource;
  banks?: Bank[];
  cards?: Card[];
  offers?: CardOffer[];
  rewardCurrencies?: RewardCurrency[];
  valuations?: RewardValuation[];
  merchants?: Merchant[];
  mccs?: MccCode[];
  errors: string[];
}

export interface DataProvider {
  id: string;
  name: string;
  kind: ProviderKind;
  refreshPolicy: RefreshPolicy;
  fetch(ctx: ProviderContext): Promise<ProviderResult>;
}

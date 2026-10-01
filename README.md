# TapWise UAE — “Which card should I tap right now?”

TapWise answers one question for UAE consumers:

> **Which of the credit cards I already own gives me the most value for this purchase right now?**

You type `AED 200 petrol at ENOC`. TapWise works out the merchant, category and amount, then ranks **only the cards in your wallet** by the **estimated AED value** of everything you'd get: cashback, airline miles, bank points, hotel points, merchant discounts, card-linked offers, bonus campaigns and network offers.

It always keeps the original reward visible:

```
600 Etihad Guest Miles
≈ AED 21.00 estimated value   (≈ 3.5 fils per mile · typical range AED 15.00–27.00)
```

> ⚠️ **Demo data.** The bundled banks, cards, offers and loyalty valuations are **fictional** and exist only to show how the engine works. They are labelled `dataStatus: "demo"` in the data and in the UI. Real programmes (Emirates NBD Plus Points, ADCB TouchPoints, FAB Rewards, …) are registered in the currency registry with a valuation of **AED 0** until verified data is entered, so nothing is made up. Real merchant names and standard ISO 18245 MCC codes are used for parsing and matching.

---

## Quick start

```bash
npm install
npm run dev            # frontend only → http://localhost:5173 (uses bundled demo data)

# optional: the API server + ingestion scheduler
npm run server         # http://localhost:8787 — Vite proxies /api to it
npm test               # reward-engine test suite (vitest)
npm run build          # typecheck + production build to dist/
```

If the API server is reachable the UI uses its refreshed dataset. If not (e.g. static hosting), it falls back to the bundled demo dataset. The rest of the UI works the same either way.

`npm run server` also serves `dist/` if you have built it, so one Node process can host the whole app.

---

## Running the website in production

One Node process serves both the website and the API:

```bash
npm install
npm run build        # builds the site into dist/
npm start            # http://localhost:8787 — site + API + refresh scheduler
```

Or with Docker:

```bash
docker build -t tapwise .
docker run -p 8787:8787 -v tapwise-data:/data -e TAPWISE_ADMIN_TOKEN=change-me tapwise
```

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (default 8787) |
| `TAPWISE_ADMIN_TOKEN` | **Set this in production.** Without it, anyone can use `/api/admin/*` |
| `TAPWISE_STORE` | Path of the data file (default `server/.data/store.json`); put it on a persistent disk |
| `TAPWISE_DISABLE_DEMO=1` | Stop loading the fictional demo data once real feeds are connected |

Any host that runs a Node 20+ app or a container works (for example Render, Railway, Fly.io, Azure App Service, AWS, or a VPS). Give it a persistent disk for `TAPWISE_STORE`, otherwise admin edits are lost on redeploy.

A static-only host (Netlify, Vercel static, GitHub Pages, S3) can serve `dist/` on its own. In that case the site runs in offline demo mode with the bundled data and no live refresh.

---

## What's included

| Area | Where |
|---|---|
| Domain model (provenance on every object) | `src/core/domain/types.ts` |
| Natural-language transaction parser | `src/core/parser/transactionParser.ts` |
| Valuation engine (miles/points → AED, ranges, user overrides) | `src/core/engines/valuationEngine.ts` |
| Reward-rules engine (rule specificity, caps, spend tiers) | `src/core/engines/rewardEngine.ts` |
| Offer eligibility engine (freshness, matching, dedupe, conditions) | `src/core/engines/offerEligibilityEngine.ts` |
| `calculateTransactionValue` (stacking, discounts, fees, explanation) | `src/core/engines/transactionValueEngine.ts` |
| Ranking engine (wallet ranking, deal highlights, "missing out") | `src/core/engines/rankingEngine.ts` |
| Services (`cardService`, `offerService`, `merchantService`, `valuationService`, catalog) | `src/core/services/` |
| Data providers (bank, merchant offers, network offers, loyalty valuations, HTML page adapter) | `src/core/data-providers/` |
| Ingestion pipeline (validate → normalise → merge → audit, review queue) | `src/core/ingestion/pipeline.ts` |
| Data-quality checks | `src/core/quality/dataQuality.ts` |
| Schema validation | `src/core/validation/validate.ts` |
| History / cumulative value tracking | `src/core/history/history.ts` |
| Demo dataset (fictional) | `src/core/data/demo/` |
| API server, file store, scheduler | `server/` |
| React UI (search, wallet, deals, value history, settings, admin) | `src/ui/` |
| Tests | `tests/` |

### Architecture

```
USER EXPERIENCE            src/ui  (React, no data logic)
      ↓
TRANSACTION ENGINE         parser → Transaction {amount, merchant, category, MCC, region, channel, payment method}
      ↓
REWARD ENGINE              most specific matching earn rule, caps, monthly-spend tiers
      ↓
OFFER ENGINE               active? → dedupe → card/network/merchant match → eligible | conditional
      ↓
VALUATION ENGINE           units × AED/unit (default, range, or user's own value)
      ↓
NORMALISED AED VALUE       BenefitComponent[] → totalEstimatedAEDValue
      ↓
RANKING ENGINE             wallet cards only, sorted by totalEstimatedAEDValue
```

Data sources sit **underneath** the engines: providers → ingestion pipeline → internal dataset → catalog (indexed, in memory) → engines. A search never calls an external website. Ranking 200 cards against 500 offers takes a few milliseconds, and a test checks it stays under 500 ms.

---

## How a calculation works

`calculateTransactionValue({ card, transaction, activeOffers, rewardValuations, userRewardState })` produces two scenarios:

- **Confirmed.** Only benefits you get without doing anything else. This is `totalEstimatedAEDValue`, the **only ranking metric**.
- **Potential.** Also includes offers that need registration, a promo code or a specific payment method, spend-tier rates whose monthly-spend condition is unverified, and offers whose stacking is `unknown`. The difference is shown as **Potential value** and is never ranked.

Order of operations:

1. **Merchant discount**: only the best single discount applies. It lowers the amount charged to the card, so rewards are earned on what you actually pay. This avoids double counting.
2. **Standard earning** on the charged amount. The most specific rule wins (merchant › MCC › category › base), so a 0% government rule correctly overrides a 1% base rate. Ties go to the higher rate. Caps use the usage you track in your wallet.
3. **Promotions**, applied according to `stackingRule`:
   - `stack`: added on top of standard earning.
   - `replace_base`: paid instead of standard earning.
   - `best_of`: whichever is higher.
   - `unknown`: confirmed value uses the higher of the two (we never assume stacking); the stacked total is shown as potential.
   - Multipliers (`5X`) add (N−1)× the standard rate. They are dropped if standard earning is replaced.
4. **Foreign transaction fee** on international spend, subtracted as a negative component.
5. **Confidence**: `exact` means cash only with no unknowns. `estimated` means miles or points converted with a valuation. `conditional` means some value depends on registration, a code, a spend tier or unconfirmed stacking.

**Never double counting.** Offers that share a `canonicalOfferId`, or have identical terms and overlapping dates, are merged into one. The issuer's own record is kept and the other sources are added to its provenance.

**Freshness.** `isOfferActive(offer, now)` checks `startDate ≤ now ≤ endDate`. Date-only values are read in UAE time, and the end date covers the whole day. Expired offers stay in the data for history but never affect a calculation. The UI clock refreshes every minute.

Every result includes `steps` (the “Why?” breakdown), `explanation`, `warnings`, `valueRange`, `potential`, `confidence`, `appliedOffers`, `skippedOffers` with reasons, and `dataFreshness` (oldest verification date, worst data status, sources).

---

## Connecting live data

Every object carries `sourceUrl / sources[] / effectiveFrom / effectiveUntil / lastCheckedAt / lastVerifiedAt / dataStatus`. To bring in real data:

### 1. JSON feeds (no code changes)

Point the server at endpoints that return records in this app's schema:

```bash
TAPWISE_BANK_FEED_URL=https://feeds.example.ae/cards.json        # { banks?: Bank[], cards: Card[] }
TAPWISE_OFFERS_FEED_URL=https://feeds.example.ae/offers.json     # { offers: CardOffer[], merchants?: Merchant[] }
TAPWISE_VALUATIONS_FEED_URL=https://feeds.example.ae/values.json # { valuations: RewardValuation[] }
TAPWISE_DISABLE_DEMO=1                                            # stop loading fictional demo data
npm run server
```

Each feed has a matching `*_PUBLISHER` variable for source attribution. Providers are registered in `server/ingestion/providers.ts`.

### 2. Custom providers

Implement `DataProvider` (`src/core/data-providers/types.ts`) and add it to `configuredProviders()`:

```ts
export interface DataProvider {
  id: string;
  name: string;
  kind: "bank" | "merchantOffers" | "loyaltyValuation" | "cardNetworkOffers" | "admin";
  refreshPolicy: { intervalHours: number; description: string };
  fetch(ctx: { now: Date; fetch: typeof fetch }): Promise<ProviderResult>;
}
```

Ready-made factories: `createHttpBankProvider`, `createHttpOffersProvider`, `createHttpNetworkOffersProvider`, `createHttpValuationProvider`, and `createHtmlPageProvider({ url, extract })` for official promotion or T&C pages. An extractor must only return what the page actually states. Leave anything unclear (especially stacking) as `"unknown"` for an admin to confirm. Respect each site's terms and robots.txt, and prefer official APIs or partner feeds.

### 3. Refresh schedule

| Data | Default policy |
|---|---|
| Current offers (bank, merchant, network) | daily |
| Card earning structures | weekly |
| Reward valuations | weekly |
| Admin-verified data | daily sync |

The server checks every hour, runs any providers that are due, and marks finished offers as expired. `npm run ingest` runs every provider once, for use from cron or CI.

### 4. Pipeline guarantees

- Invalid records are **rejected** and reported. They are never silently fixed.
- **Admin-verified records are never overwritten** by automated sources. Differences go to a review queue (Admin → Ingestion).
- Unchanged records only get `lastCheckedAt` updated.
- Every create, update, delete, verify or expire is written to the **audit log** with before/after values.

### 5. Production notes

- Replace `server/store.ts` (a JSON file) with a database. The shape (dataset collections, audit, pending reviews, provider runs) maps directly onto tables.
- Set `TAPWISE_ADMIN_TOKEN` to protect `/api/admin/*`. Admins enter the token in Admin → Ingestion.
- User data (wallet, valuations, registrations, history) stays in the browser's localStorage and is never sent to the server.

---

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | liveness + counts |
| GET | `/api/dataset` | full internal dataset snapshot |
| GET | `/api/parse?q=AED 200 at ENOC` | parse a purchase description |
| POST | `/api/recommend` | `{ walletCardIds, text \| transaction, preferences?, userRewardState? }` → `{ bestCard, topThree, allCards, missingOut, … }` |
| GET | `/api/admin/quality` | data-quality report |
| GET | `/api/admin/audit` · `/pending` · `/providers` | audit log, review queue, provider status |
| POST | `/api/admin/refresh` | run providers now (`{ providerId? }`) |
| PUT / DELETE | `/api/admin/:collection/:id` | upsert / delete (validated + audited) |
| POST | `/api/admin/:collection/:id/verify` | mark checked against the official source today |

Collections: `banks`, `cards`, `rewardCurrencies`, `merchants`, `mccs`, `offers`.

---

## Product features

- **Search**: one natural-language field (`500 Carrefour`, `AED 3,500 Emirates flight`, `$250 hotel in London`, `200 Carrefour with Apple Pay`). The parsed amount, merchant, category, region and payment method appear underneath and can be corrected.
- **Best card**: “Use this card”, what you'll receive in its native form, what it's worth in AED, effective return, why it wins, and a full “How we calculated this” breakdown.
- **Top three comparison**: a table on desktop, stacked cards on mobile.
- **Deal highlighting**: “🔥 Limited-time deal · Without deal #3 → With deal #1”.
- **Registration handling**: shown as “Potential value” with ⚠️ until you tap “I've registered for this offer”, after which it counts.
- **Personal valuations**: set your own value per mile or point and every ranking is recalculated with it.
- **Wallet**: track cap usage and monthly spend so caps and tiered rates apply correctly; set a default card as the history baseline.
- **You're missing out**: better cards you don't own, kept completely separate from the wallet ranking.
- **Value history**: “You optimised AED X spending · estimated rewards AED Y · extra value AED Z”.
- **Admin**: data-quality dashboard (expired, expiring soon, stale cards, valuations needing update, missing sources, conflicting rules), editors for every collection (a structured offer form plus validated JSON for the rest), flattened card-rules view, sources, audit log, and ingestion control.

Terminology follows the brief: *Cashback value* for cash; *Estimated value* / *Estimated AED equivalent* for miles and points. Miles and points are never described as cash.

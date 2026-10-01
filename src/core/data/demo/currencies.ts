import { CASH_CURRENCY } from "../../domain/constants";
import type { RewardCurrency } from "../../domain/types";
import type { DemoDates } from "./dates";

/**
 * DEMO reward currencies.
 *
 * Valuations are illustrative estimates for demonstration only. They are NOT
 * verified redemption values. Real programme names are included so the
 * architecture can model them; their placeholder valuations are marked
 * `dataStatus: "demo"` and `confidence: "low"` and must be replaced with
 * verified data (Admin → Loyalty currencies, or a loyaltyValuationProvider).
 */
export function demoCurrencies(d: DemoDates): RewardCurrency[] {
  const demo = { dataStatus: "demo" as const, lastCheckedAt: d.ago(3), lastVerifiedAt: d.ago(3) };
  const placeholderNote = "Demonstration placeholder — not a verified redemption value. Replace with verified data.";

  return [
    { ...CASH_CURRENCY },
    {
      id: "etihad_guest_miles",
      name: "Etihad Guest Miles",
      shortName: "Etihad Guest",
      type: "airline_miles",
      issuer: "Etihad Guest",
      unitSingular: "Mile",
      unitPlural: "Miles",
      badge: "ETIHAD MILES",
      rounding: "round",
      ...demo,
      valuation: {
        currencyId: "etihad_guest_miles",
        aedValuePerUnit: 0.035,
        lowEstimate: 0.025,
        highEstimate: 0.045,
        valuationMethod: "market_estimate",
        lastUpdatedAt: d.ago(12),
        confidence: "medium",
        notes: "Demo estimate. Mile value varies widely by redemption (award seats vs. upgrades vs. shopping).",
        dataStatus: "demo",
      },
    },
    {
      id: "skywards_miles",
      name: "Emirates Skywards Miles",
      shortName: "Skywards",
      type: "airline_miles",
      issuer: "Emirates Skywards",
      unitSingular: "Mile",
      unitPlural: "Miles",
      badge: "SKYWARDS MILES",
      rounding: "round",
      ...demo,
      valuation: {
        currencyId: "skywards_miles",
        aedValuePerUnit: 0.045,
        lowEstimate: 0.03,
        highEstimate: 0.06,
        valuationMethod: "market_estimate",
        lastUpdatedAt: d.ago(12),
        confidence: "medium",
        notes: "Demo estimate. Value depends on cabin, route and cash co-payments.",
        dataStatus: "demo",
      },
    },
    {
      id: "marriott_bonvoy_points",
      name: "Marriott Bonvoy Points",
      shortName: "Bonvoy",
      type: "hotel_points",
      issuer: "Marriott Bonvoy",
      unitSingular: "Point",
      unitPlural: "Points",
      badge: "HOTEL POINTS",
      rounding: "round",
      ...demo,
      valuation: {
        currencyId: "marriott_bonvoy_points",
        aedValuePerUnit: 0.028,
        lowEstimate: 0.018,
        highEstimate: 0.04,
        valuationMethod: "market_estimate",
        lastUpdatedAt: d.ago(75),
        confidence: "medium",
        notes: "Demo estimate. Free-night redemptions vary by hotel category and season.",
        dataStatus: "demo",
      },
    },
    {
      id: "saffron_stars",
      name: "Saffron Stars",
      shortName: "Stars",
      type: "bank_points",
      issuer: "Saffron Bank (Demo)",
      unitSingular: "Star",
      unitPlural: "Stars",
      badge: "REWARD POINTS",
      rounding: "floor",
      ...demo,
      valuation: {
        currencyId: "saffron_stars",
        aedValuePerUnit: 0.01,
        lowEstimate: 0.008,
        highEstimate: 0.01,
        valuationMethod: "fixed_redemption",
        lastUpdatedAt: d.ago(20),
        confidence: "high",
        notes: "Fictional demo programme: 100 Stars = AED 1 statement credit; lower value for some catalogue items.",
        dataStatus: "demo",
      },
    },
    {
      id: "dune_points",
      name: "Dune Travel Points",
      shortName: "Dune Points",
      type: "bank_points",
      issuer: "Dune National Bank (Demo)",
      unitSingular: "Point",
      unitPlural: "Points",
      badge: "REWARD POINTS",
      rounding: "floor",
      ...demo,
      valuation: {
        currencyId: "dune_points",
        aedValuePerUnit: 0.008,
        lowEstimate: 0.005,
        highEstimate: 0.012,
        valuationMethod: "average_redemption",
        lastUpdatedAt: d.ago(20),
        confidence: "medium",
        notes: "Fictional demo programme; transferable to airline partners, so value depends on use.",
        dataStatus: "demo",
      },
    },
    // ---- Real programmes registered for architecture support (no demo cards use them) ----
    ...[
      { id: "enbd_plus_points", name: "Emirates NBD Plus Points", shortName: "Plus Points", issuer: "Emirates NBD" },
      { id: "adcb_touchpoints", name: "ADCB TouchPoints", shortName: "TouchPoints", issuer: "ADCB" },
      { id: "fab_rewards", name: "FAB Rewards", shortName: "FAB Rewards", issuer: "First Abu Dhabi Bank" },
      { id: "mashreq_salaam_points", name: "Mashreq Reward Points", shortName: "Mashreq Points", issuer: "Mashreq" },
      { id: "citi_thankyou_points", name: "Citi ThankYou Points", shortName: "ThankYou", issuer: "Citi" },
      { id: "air_miles_me", name: "Air Miles", shortName: "Air Miles", issuer: "Air Miles Middle East" },
    ].map(
      (c): RewardCurrency => ({
        ...c,
        type: "bank_points",
        unitSingular: "Point",
        unitPlural: "Points",
        badge: "REWARD POINTS",
        rounding: "floor",
        dataStatus: "demo",
        lastCheckedAt: d.ago(90),
        valuation: {
          currencyId: c.id,
          aedValuePerUnit: 0,
          valuationMethod: "market_estimate",
          lastUpdatedAt: d.ago(90),
          confidence: "low",
          notes: `${placeholderNote} Value intentionally set to 0 until a verified valuation is entered.`,
          dataStatus: "demo",
        },
      }),
    ),
  ];
}

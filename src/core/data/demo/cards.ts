import type { Card, EarnRule, EarnRuleMatch, SpendCategory } from "../../domain/types";
import type { DemoDates } from "./dates";

/**
 * FICTIONAL demo cards. Issuers, products, earn rates and caps are invented
 * for demonstration and do not describe any real credit card. Replace them
 * with verified product data via a bankProvider or the Admin screens.
 */

const LOW_EARN: SpendCategory[] = ["government", "utilities", "education", "real_estate", "charity", "insurance"];

function rule(id: string, label: string, unitsPerAED: number, match: EarnRuleMatch = {}, extra: Partial<EarnRule> = {}): EarnRule {
  return { id, label, unitsPerAED, match, ...extra };
}

export function demoCards(d: DemoDates): Card[] {
  const meta = (verifiedDaysAgo: number) => ({
    dataStatus: "demo" as const,
    lastCheckedAt: d.ago(Math.min(verifiedDaysAgo, 1)),
    lastVerifiedAt: d.ago(verifiedDaysAgo),
    effectiveFrom: d.ago(200),
  });

  return [
    {
      id: "saffron_duo",
      bankId: "saffron",
      name: "Saffron Duo Cashback",
      network: "Mastercard",
      networkTier: "World Mastercard",
      annualFeeAED: 300,
      foreignTransactionFeePct: 2.5,
      rewardCurrencyId: "aed_cash",
      capGroups: [{ id: "everyday", label: "Monthly everyday cashback cap (AED 300)", cap: 300, period: "monthly" }],
      earnRules: [
        rule("duo_base", "All other spend", 0.01),
        rule("duo_dining", "Dining", 0.05, { categories: ["dining"] }, { capGroupId: "everyday" }),
        rule("duo_groceries", "Groceries", 0.05, { categories: ["groceries"] }, { capGroupId: "everyday" }),
        rule("duo_fuel", "Fuel", 0.02, { categories: ["fuel"] }),
        rule("duo_intl", "International spend", 0.02, { region: "international" }),
        rule("duo_low", "Government, utilities & education", 0.0025, { categories: LOW_EARN }),
      ],
      highlights: ["5% on dining & groceries", "2% on fuel and abroad"],
      design: { from: "#f59e0b", to: "#b45309" },
      ...meta(10),
    },
    {
      id: "pearl_365",
      bankId: "pearl",
      name: "Pearl 365 Cashback",
      network: "Visa",
      networkTier: "Visa Platinum",
      annualFeeAED: 399,
      foreignTransactionFeePct: 2.49,
      rewardCurrencyId: "aed_cash",
      capGroups: [{ id: "monthly", label: "Monthly cashback cap (AED 1,000)", cap: 1000, period: "monthly" }],
      earnRules: [
        rule("p365_base", "All other spend", 0.005),
        rule("p365_dining", "Dining & delivery (AED 5,000+ monthly spend)", 0.06, { categories: ["dining", "food_delivery"] }, { capGroupId: "monthly", minMonthlySpendAED: 5000 }),
        rule("p365_groceries", "Groceries (AED 5,000+ monthly spend)", 0.05, { categories: ["groceries"] }, { capGroupId: "monthly", minMonthlySpendAED: 5000 }),
        rule("p365_fuel", "Fuel (AED 5,000+ monthly spend)", 0.05, { categories: ["fuel"] }, { capGroupId: "monthly", minMonthlySpendAED: 5000 }),
        rule("p365_bills", "Utilities & telecom (AED 5,000+ monthly spend)", 0.05, { categories: ["utilities", "telecom"] }, { capGroupId: "monthly", minMonthlySpendAED: 5000 }),
        rule("p365_tier_low", "Bonus categories (below AED 5,000 monthly spend)", 0.01, { categories: ["dining", "food_delivery", "groceries", "fuel", "utilities", "telecom"] }, { capGroupId: "monthly" }),
        rule("p365_excluded", "Government & education (no cashback)", 0, { categories: ["government", "education", "real_estate", "charity"] }),
      ],
      highlights: ["Up to 6% with AED 5,000 monthly spend"],
      design: { from: "#0ea5e9", to: "#1e3a8a" },
      ...meta(47),
    },
    {
      id: "marina_rta",
      bankId: "marina",
      name: "Marina RTA Drive Card",
      network: "Visa",
      networkTier: "Visa Signature",
      isIslamic: true,
      annualFeeAED: 0,
      foreignTransactionFeePct: 2.1,
      rewardCurrencyId: "aed_cash",
      capGroups: [{ id: "drive", label: "Monthly fuel & transport cashback cap (AED 200)", cap: 200, period: "monthly" }],
      earnRules: [
        rule("rta_base", "All other spend", 0.005),
        rule("rta_fuel", "Fuel", 0.1, { categories: ["fuel"] }, { capGroupId: "drive" }),
        rule("rta_transport", "Salik, nol, taxis & parking", 0.1, { categories: ["transport"] }, { capGroupId: "drive" }),
      ],
      highlights: ["10% on fuel, Salik & nol (cap AED 200/month)"],
      design: { from: "#10b981", to: "#065f46" },
      ...meta(12),
    },
    {
      id: "falcon_etihad",
      bankId: "falcon",
      name: "Falcon Etihad Guest Premium",
      network: "Visa",
      networkTier: "Visa Infinite",
      annualFeeAED: 1500,
      foreignTransactionFeePct: 1.99,
      rewardCurrencyId: "etihad_guest_miles",
      earnRules: [
        rule("fe_base", "All other spend", 1.2),
        rule("fe_etihad", "Etihad Airways purchases", 3, { merchantIds: ["etihad"] }),
        rule("fe_intl", "International spend", 2, { region: "international" }),
        rule("fe_low", "Government, utilities & education", 0.3, { categories: LOW_EARN }),
      ],
      highlights: ["1.2 Etihad Guest Miles per AED", "3 miles per AED on Etihad"],
      design: { from: "#a16207", to: "#3f2a0b", text: "#fde68a" },
      ...meta(8),
    },
    {
      id: "corniche_skywards",
      bankId: "corniche",
      name: "Corniche Skywards Signature",
      network: "Visa",
      networkTier: "Visa Signature",
      annualFeeAED: 1000,
      foreignTransactionFeePct: 2.25,
      rewardCurrencyId: "skywards_miles",
      earnRules: [
        rule("cs_base", "All other spend", 0.75),
        rule("cs_emirates", "Emirates purchases", 1.5, { merchantIds: ["emirates"] }),
        rule("cs_intl", "International spend", 1, { region: "international" }),
        rule("cs_low", "Government, utilities & education", 0.25, { categories: LOW_EARN }),
      ],
      highlights: ["1.5 Skywards Miles per AED on Emirates"],
      design: { from: "#dc2626", to: "#7f1d1d" },
      ...meta(15),
    },
    {
      id: "saffron_plus",
      bankId: "saffron",
      name: "Saffron Plus Rewards",
      network: "Mastercard",
      networkTier: "World Elite Mastercard",
      annualFeeAED: 800,
      foreignTransactionFeePct: 2.5,
      rewardCurrencyId: "saffron_stars",
      earnRules: [
        rule("sp_base", "All other spend", 2),
        rule("sp_fuel", "Fuel", 3, { categories: ["fuel"] }),
        rule("sp_dining", "Dining", 4, { categories: ["dining"] }),
        rule("sp_intl", "International spend", 4, { region: "international" }),
        rule("sp_low", "Government, utilities & education", 0.5, { categories: LOW_EARN }),
      ],
      highlights: ["4 Stars per AED on dining & abroad"],
      design: { from: "#1f2937", to: "#000000", text: "#fbbf24" },
      ...meta(20),
    },
    {
      id: "dune_travel",
      bankId: "dune",
      name: "Dune Travel Elite",
      network: "Mastercard",
      networkTier: "World Elite Mastercard",
      annualFeeAED: 1200,
      foreignTransactionFeePct: 0,
      rewardCurrencyId: "dune_points",
      earnRules: [
        rule("dt_base", "All other spend", 2.5),
        rule("dt_travel", "Flights, hotels & travel", 5, { categories: ["airline", "hotel", "travel"] }),
        rule("dt_intl", "International spend", 4, { region: "international" }),
        rule("dt_low", "Government, utilities & education", 1, { categories: LOW_EARN }),
      ],
      highlights: ["0% foreign transaction fee", "5 points per AED on travel"],
      design: { from: "#7c3aed", to: "#312e81" },
      ...meta(25),
    },
    {
      id: "falcon_bonvoy",
      bankId: "falcon",
      name: "Falcon Marriott Bonvoy World",
      network: "Mastercard",
      networkTier: "World Mastercard",
      annualFeeAED: 625,
      foreignTransactionFeePct: 2,
      rewardCurrencyId: "marriott_bonvoy_points",
      earnRules: [
        rule("fb_base", "All other spend", 1),
        rule("fb_marriott", "Marriott hotels", 4, { merchantIds: ["marriott"] }),
        rule("fb_travel_dining", "Hotels, flights & dining", 2, { categories: ["hotel", "airline", "dining"] }),
        // Deliberately conflicting legacy rule so the Data Quality dashboard has something to flag.
        rule("fb_dining_legacy", "Dining (legacy rule — pending review)", 1.5, { categories: ["dining"] }),
      ],
      highlights: ["4 Bonvoy points per AED at Marriott"],
      design: { from: "#78350f", to: "#1c1917", text: "#fcd34d" },
      ...meta(33),
    },
    {
      id: "dune_smart",
      bankId: "dune",
      name: "Dune Smart Cashback",
      network: "Visa",
      networkTier: "Visa Platinum",
      annualFeeAED: 0,
      foreignTransactionFeePct: 0,
      rewardCurrencyId: "aed_cash",
      earnRules: [
        rule("ds_base", "Everything", 0.015),
        rule("ds_low", "Government & education", 0.005, { categories: ["government", "education", "real_estate", "charity"] }),
      ],
      highlights: ["Flat 1.5% cashback", "No foreign transaction fee"],
      design: { from: "#64748b", to: "#0f172a" },
      ...meta(18),
    },
    {
      id: "marina_online",
      bankId: "marina",
      name: "Marina Online Shopper",
      network: "Mastercard",
      networkTier: "Titanium Mastercard",
      isIslamic: true,
      annualFeeAED: 0,
      foreignTransactionFeePct: 2.1,
      rewardCurrencyId: "aed_cash",
      capGroups: [{ id: "online", label: "Monthly online cashback cap (AED 250)", cap: 250, period: "monthly" }],
      earnRules: [
        rule("mo_base", "All other spend", 0.005),
        rule("mo_online", "Online shopping & fashion", 0.05, { categories: ["online_shopping", "fashion"] }, { capGroupId: "online" }),
        rule("mo_delivery", "Food delivery", 0.05, { categories: ["food_delivery"] }, { capGroupId: "online" }),
      ],
      highlights: ["5% on online shopping & delivery"],
      design: { from: "#ec4899", to: "#831843" },
      ...meta(9),
    },
  ];
}

/** Sample wallet used by "Try a sample wallet" (mirrors a typical 5-card UAE wallet). */
export const SAMPLE_WALLET = ["saffron_duo", "pearl_365", "marina_rta", "falcon_etihad", "saffron_plus"];

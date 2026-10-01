import { CATEGORIES } from "../domain/categories";
import type { Channel, Region, SpendCategory, Transaction } from "../domain/types";
import type { MerchantService } from "../services/merchantService";

/**
 * Natural-language transaction parser.
 *   "AED 200 petrol at ENOC"   → { amount: 200, merchant: ENOC, category: fuel }
 *   "AED 3,500 Emirates flight" → { amount: 3500, merchant: Emirates, category: airline }
 *   "$100 hotel in London"      → USD converted to AED, international
 *
 * Merchant category (from MCC data) takes precedence over keywords because card
 * earning rules are applied by the merchant's MCC, not by what was bought.
 */

export interface ParsedTransaction {
  amount?: number;
  currency: "AED";
  originalAmount?: number;
  originalCurrency?: string;
  merchantId?: string;
  merchantName?: string;
  category?: SpendCategory;
  categorySource?: "merchant" | "keyword";
  mcc?: string;
  region: Region;
  channel?: Channel;
  paymentMethod?: string;
  fuzzyMerchant?: boolean;
  notes: string[];
}

/**
 * Indicative FX rates used only to convert foreign-currency input into AED.
 * USD and SAR are pegged (official pegs). EUR/GBP/INR are DEMO indicative rates
 * and should be replaced by a live FX provider.
 */
export const FX_TO_AED: Record<string, { rate: number; status: "peg" | "demo" }> = {
  USD: { rate: 3.6725, status: "peg" },
  SAR: { rate: 3.6725 / 3.75, status: "peg" },
  EUR: { rate: 4.0, status: "demo" },
  GBP: { rate: 4.7, status: "demo" },
  INR: { rate: 0.044, status: "demo" },
};

const CURRENCY_TOKENS: Record<string, string> = {
  aed: "AED", dhs: "AED", dh: "AED", dirham: "AED", dirhams: "AED", "د.إ": "AED",
  usd: "USD", "$": "USD", dollars: "USD", dollar: "USD",
  eur: "EUR", "€": "EUR", euro: "EUR", euros: "EUR",
  gbp: "GBP", "£": "GBP", pounds: "GBP",
  sar: "SAR", riyal: "SAR", riyals: "SAR",
  inr: "INR", "₹": "INR", rupees: "INR",
};

const CUR = "(aed|dhs|dh|dirhams?|usd|\\$|dollars?|eur|€|euros?|gbp|£|pounds|sar|riyals?|inr|₹|rupees)";
const NUM = "(\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.(\\d{1,2}))?\\s*(k(?![a-z]))?";
const AMOUNT_RE = new RegExp(`(?:${CUR}\\s*)?${NUM}(?:\\s*${CUR}(?![a-z]))?`, "i");

const INTERNATIONAL_RE = /\b(abroad|overseas|international|foreign|in (london|paris|new york|europe|usa|india|tokyo|istanbul|bangkok|singapore))\b/i;
const ONLINE_RE = /\b(online|website|app|\.com|\.ae)\b/i;
const PAYMENT_METHODS: [RegExp, string][] = [
  [/\bapple ?pay\b/i, "Apple Pay"],
  [/\bsamsung ?pay\b/i, "Samsung Pay"],
  [/\bgoogle ?pay\b/i, "Google Pay"],
];
const IN_STORE_RE = /\b(in[- ]store|in person|at the counter|pos)\b/i;

const KEYWORDS = CATEGORIES.flatMap((c) => c.keywords.map((k) => ({ k, id: c.id }))).sort((a, b) => b.k.length - a.k.length);

export function parseTransactionInput(input: string, merchants: MerchantService): ParsedTransaction {
  const text = input.trim();
  const notes: string[] = [];
  const result: ParsedTransaction = { currency: "AED", region: "domestic", notes };

  // Amount & currency
  const m = AMOUNT_RE.exec(text);
  if (m) {
    const [, curBefore, intPart, dec, k, curAfter] = m;
    let value = Number(intPart.replace(/,/g, "")) + (dec ? Number(`0.${dec}`) : 0);
    if (k) value *= 1000;
    const curToken = (curBefore ?? curAfter)?.toLowerCase();
    const code = curToken ? CURRENCY_TOKENS[curToken] ?? "AED" : "AED";
    if (code !== "AED") {
      const fx = FX_TO_AED[code];
      result.originalAmount = value;
      result.originalCurrency = code;
      result.amount = Math.round(value * fx.rate * 100) / 100;
      result.region = "international";
      notes.push(
        `Converted ${code} ${value.toLocaleString("en-AE")} at ${fx.rate.toFixed(4)} AED (${fx.status === "peg" ? "official peg" : "demo indicative rate"}).`,
      );
    } else {
      result.amount = value;
    }
  }

  // Merchant
  const withoutAmount = m ? text.replace(m[0], " ") : text;
  const merchantMatch = merchants.findInText(withoutAmount);
  if (merchantMatch) {
    const merchant = merchantMatch.merchant;
    result.merchantId = merchant.id;
    result.merchantName = merchant.name;
    result.category = merchant.category;
    result.categorySource = "merchant";
    result.mcc = merchant.mccs[0];
    result.fuzzyMerchant = merchantMatch.fuzzy;
    if (merchant.isOnline) result.channel = "online";
    if (merchantMatch.fuzzy) notes.push(`Assumed you meant ${merchant.name}.`);
  }

  // Category keywords (only when no merchant decided it)
  const lower = ` ${withoutAmount.toLowerCase()} `;
  if (!result.category) {
    const kw = KEYWORDS.find(({ k }) => new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(lower));
    if (kw) {
      result.category = kw.id;
      result.categorySource = "keyword";
    }
  }

  if (INTERNATIONAL_RE.test(text)) result.region = "international";
  if (ONLINE_RE.test(text)) result.channel = "online";
  if (IN_STORE_RE.test(text)) result.channel = "in_store";
  for (const [re, method] of PAYMENT_METHODS) if (re.test(text)) result.paymentMethod = method;

  return result;
}

export function toTransaction(parsed: ParsedTransaction, now: Date, overrides: Partial<Transaction> = {}): Transaction | undefined {
  const amount = overrides.amount ?? parsed.amount;
  if (!amount || amount <= 0) return undefined;
  return {
    amount,
    currency: "AED",
    originalAmount: parsed.originalAmount,
    originalCurrency: parsed.originalCurrency,
    merchantId: parsed.merchantId,
    merchantName: parsed.merchantName,
    category: parsed.category ?? "other",
    mcc: parsed.mcc,
    region: parsed.region,
    channel: parsed.channel,
    paymentMethod: parsed.paymentMethod,
    date: now.toISOString(),
    ...overrides,
  };
}

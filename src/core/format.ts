import type { EarnRule, RewardCurrency } from "./domain/types";

const aedFormatter = new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFormatter = new Intl.NumberFormat("en-AE", { maximumFractionDigits: 0 });

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatAED(value: number, opts: { compact?: boolean } = {}): string {
  const v = round2(value);
  if (opts.compact && Number.isInteger(v)) return `AED ${intFormatter.format(v)}`;
  return `AED ${aedFormatter.format(v)}`;
}

export function formatAEDRange(low: number, high: number): string {
  if (round2(low) === round2(high)) return formatAED(low);
  return `AED ${aedFormatter.format(round2(low))}–${aedFormatter.format(round2(high))}`;
}

export function formatNumber(value: number, maxFractionDigits = 0): string {
  return new Intl.NumberFormat("en-AE", { maximumFractionDigits: maxFractionDigits }).format(value);
}

export function formatPercent(fraction: number, digits = 2): string {
  const pct = fraction * 100;
  const fixed = pct.toFixed(digits);
  return `${fixed.replace(/\.?0+$/, "") || "0"}%`;
}

/** "600 Etihad Guest Miles", "AED 20.00 cashback". */
export function formatRewardQuantity(quantity: number, currency: RewardCurrency): string {
  if (currency.type === "cash") return `${formatAED(quantity)} cashback`;
  const unit = Math.abs(quantity) === 1 ? currency.unitSingular : currency.unitPlural;
  return `${formatNumber(quantity)} ${unit}`;
}

/** "≈ 3.5 fils per mile" — 1 AED = 100 fils. */
export function formatValuationRate(aedPerUnit: number, currency: RewardCurrency): string {
  if (currency.type === "cash") return "AED 1.00 per AED";
  const fils = aedPerUnit * 100;
  const filsText = fils >= 10 ? formatNumber(fils, 1) : formatNumber(fils, 2);
  return `≈ ${filsText} fils per ${currency.unitSingular.toLowerCase()}`;
}

export function formatAEDPerUnit(aedPerUnit: number): string {
  const digits = aedPerUnit >= 0.1 ? 2 : aedPerUnit >= 0.01 ? 3 : 4;
  return `AED ${aedPerUnit.toFixed(digits)}`;
}

/** Generate a readable earning rate: "5% cashback", "1 mile per AED 2", "3 points per AED 1". */
export function describeEarnRate(unitsPerAED: number, currency: RewardCurrency): string {
  if (currency.type === "cash") return `${formatPercent(unitsPerAED)} cashback`;
  const unit = (n: number) => (n === 1 ? currency.unitSingular : currency.unitPlural).toLowerCase();
  if (unitsPerAED >= 1 || unitsPerAED === 0) {
    const n = Number(unitsPerAED.toFixed(2));
    return `${formatNumber(n, 2)} ${unit(n)} per AED 1`;
  }
  const perAED = 1 / unitsPerAED;
  if (Math.abs(perAED - Math.round(perAED)) < 0.01) return `1 ${unit(1)} per AED ${Math.round(perAED)}`;
  // e.g. 2 miles per AED 3
  for (let denom = 2; denom <= 10; denom++) {
    const num = unitsPerAED * denom;
    if (Math.abs(num - Math.round(num)) < 0.001 && Math.round(num) > 0) {
      return `${Math.round(num)} ${unit(Math.round(num))} per AED ${denom}`;
    }
  }
  return `${formatNumber(unitsPerAED, 3)} ${unit(2)} per AED 1`;
}

export function ruleRateDisplay(rule: EarnRule, currency: RewardCurrency): string {
  return rule.rateDisplay ?? describeEarnRate(rule.unitsPerAED, currency);
}

export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+04:00` : value) : value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" }).format(d);
}

export function formatRelativeDays(days: number | undefined): string {
  if (days === undefined) return "never";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

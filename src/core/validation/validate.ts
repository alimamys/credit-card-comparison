import { isSpendCategory } from "../domain/categories";
import type { CollectionName, Dataset, DataStatus } from "../domain/types";

/**
 * Lightweight schema validation used by the ingestion pipeline and the admin
 * editor. Invalid records are rejected before they can affect recommendations.
 */

export interface ValidationIssue {
  collection: CollectionName;
  id: string;
  field?: string;
  message: string;
  severity: "error" | "warning";
}

const STATUSES: DataStatus[] = ["live", "verified", "cached", "estimated", "demo", "expired"];
const ISO = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/;

type Rec = Record<string, unknown>;

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function entityId(collection: CollectionName, entity: Rec): string {
  return String(collection === "mccs" ? entity.code : entity.id);
}

export function validateEntity(collection: CollectionName, entity: Rec, dataset?: Dataset): ValidationIssue[] {
  const id = entityId(collection, entity) || "(missing id)";
  const issues: ValidationIssue[] = [];
  const err = (field: string, message: string, severity: ValidationIssue["severity"] = "error") =>
    issues.push({ collection, id, field, message, severity });

  if (!entityId(collection, entity) || entityId(collection, entity) === "undefined") err("id", "Missing id");
  if (!STATUSES.includes(entity.dataStatus as DataStatus)) err("dataStatus", "dataStatus must be one of " + STATUSES.join(", "));
  for (const f of ["effectiveFrom", "effectiveUntil", "lastCheckedAt", "lastVerifiedAt"]) {
    if (entity[f] !== undefined && !(typeof entity[f] === "string" && ISO.test(entity[f] as string))) err(f, "Must be an ISO date");
  }

  switch (collection) {
    case "banks":
      if (!entity.name) err("name", "Required");
      break;
    case "merchants":
      if (!entity.name) err("name", "Required");
      if (!Array.isArray(entity.aliases)) err("aliases", "Must be a list");
      if (!isSpendCategory(String(entity.category))) err("category", "Unknown category");
      break;
    case "mccs":
      if (!/^\d{4}$/.test(String(entity.code))) err("code", "MCC must be 4 digits");
      if (!isSpendCategory(String(entity.category))) err("category", "Unknown category");
      break;
    case "rewardCurrencies": {
      const v = entity.valuation as Rec | undefined;
      if (!entity.name) err("name", "Required");
      if (!v) err("valuation", "Required");
      else {
        if (!isNum(v.aedValuePerUnit) || (v.aedValuePerUnit as number) < 0) err("valuation.aedValuePerUnit", "Must be a non-negative number");
        if (v.lowEstimate !== undefined && v.highEstimate !== undefined && (v.lowEstimate as number) > (v.highEstimate as number)) {
          err("valuation.lowEstimate", "Low estimate exceeds high estimate");
        }
        if (isNum(v.aedValuePerUnit) && (v.aedValuePerUnit as number) > 1 && entity.type !== "cash") {
          err("valuation.aedValuePerUnit", "Unusually high value per unit (> AED 1) — check units", "warning");
        }
      }
      break;
    }
    case "cards": {
      if (!entity.name) err("name", "Required");
      if (!Array.isArray(entity.earnRules) || !(entity.earnRules as unknown[]).length) err("earnRules", "At least one earn rule is required");
      else {
        const rules = entity.earnRules as Rec[];
        if (!rules.some((r) => !r.match || Object.keys(r.match as Rec).length === 0)) err("earnRules", "No base (catch-all) earn rule", "warning");
        for (const r of rules) {
          if (!isNum(r.unitsPerAED) || (r.unitsPerAED as number) < 0) err(`earnRules.${r.id}`, "unitsPerAED must be a non-negative number");
          const cats = (r.match as Rec | undefined)?.categories as string[] | undefined;
          for (const c of cats ?? []) if (!isSpendCategory(c)) err(`earnRules.${r.id}`, `Unknown category "${c}"`);
          if (r.capGroupId && !((entity.capGroups as Rec[] | undefined) ?? []).some((g) => g.id === r.capGroupId)) {
            err(`earnRules.${r.id}`, `Unknown cap group "${r.capGroupId}"`);
          }
          if (entity.rewardCurrencyId === "aed_cash" && isNum(r.unitsPerAED) && (r.unitsPerAED as number) > 0.5) {
            err(`earnRules.${r.id}`, "Cashback rate above 50% — is this a percentage instead of a fraction?", "warning");
          }
        }
      }
      if (dataset) {
        if (!dataset.banks.some((b) => b.id === entity.bankId)) err("bankId", `Unknown bank "${entity.bankId}"`);
        if (entity.rewardCurrencyId !== "aed_cash" && !dataset.rewardCurrencies.some((c) => c.id === entity.rewardCurrencyId)) {
          err("rewardCurrencyId", `Unknown reward currency "${entity.rewardCurrencyId}"`);
        }
      }
      break;
    }
    case "offers": {
      if (!entity.title) err("title", "Required");
      if (!entity.sourceUrl) err("sourceUrl", "Every offer must cite a source");
      for (const f of ["startDate", "endDate", "lastVerifiedAt"]) {
        if (!(typeof entity[f] === "string" && ISO.test(entity[f] as string))) err(f, "Required ISO date");
      }
      if (typeof entity.startDate === "string" && typeof entity.endDate === "string" && entity.startDate > entity.endDate) {
        err("endDate", "End date is before start date");
      }
      const t = entity.offerType;
      if ((t === "cashback" || t === "discount") && !isNum(entity.rate) && !isNum(entity.fixedValue)) err("rate", "Cashback/discount offers need a rate");
      if ((t === "cashback" || t === "discount") && isNum(entity.rate) && (entity.rate as number) > 1) err("rate", "Rate must be a fraction (0.1 = 10%)");
      if ((t === "bonus_points" || t === "bonus_miles") && !isNum(entity.rate)) err("rate", "Bonus offers need a rate (units per AED)");
      if (t === "multiplier" && !(isNum(entity.multiplier) && (entity.multiplier as number) > 1)) err("multiplier", "Multiplier must be > 1");
      if ((t === "fixed_reward" || t === "statement_credit") && !isNum(entity.fixedValue)) err("fixedValue", "Required for fixed rewards");
      if (!["stack", "replace_base", "best_of", "unknown"].includes(String(entity.stackingRule))) err("stackingRule", "Required");
      if (!entity.cardIds && !entity.bankIds && !entity.network) err("cardIds", "Offer is not targeted at any card, bank or network", "warning");
      if (dataset) {
        for (const cid of (entity.cardIds as string[] | undefined) ?? []) {
          if (!dataset.cards.some((c) => c.id === cid)) err("cardIds", `Unknown card "${cid}"`, "warning");
        }
        for (const mid of (entity.merchants as string[] | undefined) ?? []) {
          if (!dataset.merchants.some((m) => m.id === mid)) err("merchants", `Unknown merchant "${mid}"`, "warning");
        }
      }
      break;
    }
  }
  return issues;
}

export function validateDataset(dataset: Dataset): ValidationIssue[] {
  const collections: CollectionName[] = ["banks", "cards", "rewardCurrencies", "merchants", "mccs", "offers"];
  const issues: ValidationIssue[] = [];
  for (const c of collections) {
    const seen = new Set<string>();
    for (const e of dataset[c] as unknown as Rec[]) {
      const id = entityId(c, e);
      if (seen.has(id)) issues.push({ collection: c, id, message: "Duplicate id", severity: "error" });
      seen.add(id);
      issues.push(...validateEntity(c, e, dataset));
    }
  }
  return issues;
}

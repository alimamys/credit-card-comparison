import type { CollectionName, Dataset } from "../domain/types";
import { type AuditEntry, newId } from "../ingestion/pipeline";
import { entityId, validateEntity, type ValidationIssue } from "../validation/validate";

/**
 * Admin mutations shared by the API server and the browser-local repository.
 * Every change is validated and produces an audit entry with before/after.
 */

export class ValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(issues.map((i) => `${i.field ? `${i.field}: ` : ""}${i.message}`).join("; "));
  }
}

export const COLLECTIONS: CollectionName[] = ["banks", "cards", "rewardCurrencies", "merchants", "mccs", "offers"];

export function isCollection(value: string): value is CollectionName {
  return (COLLECTIONS as string[]).includes(value);
}

type Rec = Record<string, unknown>;

export function upsertEntity(
  dataset: Dataset,
  collection: CollectionName,
  entity: Rec,
  actor: string,
  now: Date,
): { dataset: Dataset; audit: AuditEntry; issues: ValidationIssue[] } {
  const issues = validateEntity(collection, entity, dataset);
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length) throw new ValidationError(errors);
  const id = entityId(collection, entity);
  const list = dataset[collection] as unknown as Rec[];
  const pos = list.findIndex((e) => entityId(collection, e) === id);
  const before = pos >= 0 ? list[pos] : undefined;
  const nextList = pos >= 0 ? list.map((e, i) => (i === pos ? entity : e)) : [...list, entity];
  return {
    dataset: { ...dataset, [collection]: nextList, generatedAt: now.toISOString() },
    audit: { id: newId("aud"), at: now.toISOString(), actor, collection, entityId: id, action: before ? "update" : "create", before, after: entity },
    issues,
  };
}

export function deleteEntity(dataset: Dataset, collection: CollectionName, id: string, actor: string, now: Date): { dataset: Dataset; audit: AuditEntry } {
  const list = dataset[collection] as unknown as Rec[];
  const before = list.find((e) => entityId(collection, e) === id);
  if (!before) throw new Error(`${collection}/${id} not found`);
  return {
    dataset: { ...dataset, [collection]: list.filter((e) => entityId(collection, e) !== id), generatedAt: now.toISOString() },
    audit: { id: newId("aud"), at: now.toISOString(), actor, collection, entityId: id, action: "delete", before },
  };
}

/**
 * Record that an administrator checked a record against its official source.
 * Demo records keep their "demo" status — verifying fictional data can't make it real.
 */
export function verifyEntity(dataset: Dataset, collection: CollectionName, id: string, actor: string, now: Date): { dataset: Dataset; audit: AuditEntry } {
  const list = dataset[collection] as unknown as Rec[];
  const before = list.find((e) => entityId(collection, e) === id);
  if (!before) throw new Error(`${collection}/${id} not found`);
  const stamp = now.toISOString();
  const after: Rec = {
    ...before,
    lastVerifiedAt: stamp,
    lastCheckedAt: stamp,
    dataStatus: before.dataStatus === "demo" ? "demo" : "verified",
  };
  if (collection === "rewardCurrencies" && before.valuation) {
    after.valuation = { ...(before.valuation as Rec), lastUpdatedAt: stamp };
  }
  return {
    dataset: { ...dataset, [collection]: list.map((e) => (entityId(collection, e) === id ? after : e)), generatedAt: stamp },
    audit: { id: newId("aud"), at: stamp, actor, collection, entityId: id, action: "verify", before, after },
  };
}

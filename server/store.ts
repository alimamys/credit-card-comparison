import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Dataset } from "../src/core/domain/types";
import type { AuditEntry, PendingReview, ProviderRunReport } from "../src/core/ingestion/pipeline";

/**
 * File-backed store for the internal dataset. Swap for Postgres/DynamoDB in
 * production — the shape (dataset + audit log + review queue + run history)
 * maps directly onto tables.
 */

export interface StoreState {
  dataset: Dataset;
  audit: AuditEntry[];
  pending: PendingReview[];
  runs: ProviderRunReport[];
  providerLastRun: Record<string, string>;
}

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_STORE_PATH = process.env.TAPWISE_STORE ?? join(here, ".data", "store.json");

export function emptyDataset(now: Date): Dataset {
  return {
    version: "store-1",
    generatedAt: now.toISOString(),
    dataStatus: "cached",
    banks: [],
    cards: [],
    rewardCurrencies: [],
    merchants: [],
    mccs: [],
    offers: [],
  };
}

export class FileStore {
  state: StoreState;

  constructor(private readonly path = DEFAULT_STORE_PATH) {
    this.state = existsSync(path)
      ? (JSON.parse(readFileSync(path, "utf8")) as StoreState)
      : { dataset: emptyDataset(new Date()), audit: [], pending: [], runs: [], providerLastRun: {} };
  }

  get isEmpty(): boolean {
    return this.state.dataset.cards.length === 0;
  }

  save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    renameSync(tmp, this.path);
  }

  appendAudit(entries: AuditEntry[]): void {
    // Keep the audit log bounded in the file store; a database would keep everything.
    this.state.audit = [...entries.reverse(), ...this.state.audit].slice(0, 5000);
  }
}

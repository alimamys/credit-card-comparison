import { deleteEntity, upsertEntity, verifyEntity } from "../../core/admin/mutations";
import { createDemoDataset } from "../../core/data/demo";
import type { CollectionName, Dataset } from "../../core/domain/types";
import type { AuditEntry, PendingReview, ProviderRunReport } from "../../core/ingestion/pipeline";
import { entityId, type ValidationIssue } from "../../core/validation/validate";
import { load, remove, save } from "./storage";

/**
 * Data repository used by the UI. Two implementations:
 *  - RemoteRepository: talks to the API server (refreshed dataset + admin API).
 *  - LocalRepository: bundled demo dataset + admin edits kept in localStorage,
 *    used when no server is reachable (e.g. static hosting).
 * UI code never knows where data comes from.
 */

export interface ProviderInfo {
  id: string;
  name: string;
  kind: string;
  refreshPolicy: { intervalHours: number; description: string };
  lastRunAt: string | null;
  lastReport: ProviderRunReport | null;
}

export interface DataRepository {
  mode: "remote" | "local";
  load(): Promise<{ dataset: Dataset; lastRefreshedAt?: string | null }>;
  upsert(collection: CollectionName, entity: Record<string, unknown>): Promise<{ dataset: Dataset; warnings: ValidationIssue[] }>;
  remove(collection: CollectionName, id: string): Promise<Dataset>;
  verify(collection: CollectionName, id: string): Promise<Dataset>;
  audit(): Promise<AuditEntry[]>;
  providers(): Promise<ProviderInfo[]>;
  refresh(providerId?: string): Promise<ProviderRunReport[]>;
  pending(): Promise<PendingReview[]>;
  reset?(): Promise<Dataset>;
}

export class RepositoryError extends Error {
  constructor(message: string, public readonly issues: ValidationIssue[] = []) {
    super(message);
  }
}

// ---------------------------------------------------------------------------

function adminHeaders(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json", "x-admin-user": "web-admin" };
  try {
    const token = sessionStorage.getItem("tapwise:admin-token");
    if (token) h.authorization = `Bearer ${token}`;
  } catch {
    /* ignore */
  }
  return h;
}

export class RemoteRepository implements DataRepository {
  mode = "remote" as const;

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(path, { ...init, headers: { ...adminHeaders(), ...(init?.headers ?? {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new RepositoryError((body as { error?: string }).error ?? `HTTP ${res.status}`, (body as { issues?: ValidationIssue[] }).issues);
    return body as T;
  }

  async load() {
    return this.json<{ dataset: Dataset; lastRefreshedAt: string | null }>("/api/dataset");
  }

  async upsert(collection: CollectionName, entity: Record<string, unknown>) {
    const id = entityId(collection, entity);
    const r = await this.json<{ warnings: ValidationIssue[] }>(`/api/admin/${collection}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(entity) });
    return { dataset: (await this.load()).dataset, warnings: r.warnings };
  }

  async remove(collection: CollectionName, id: string) {
    await this.json(`/api/admin/${collection}/${encodeURIComponent(id)}`, { method: "DELETE" });
    return (await this.load()).dataset;
  }

  async verify(collection: CollectionName, id: string) {
    await this.json(`/api/admin/${collection}/${encodeURIComponent(id)}/verify`, { method: "POST" });
    return (await this.load()).dataset;
  }

  audit() {
    return this.json<AuditEntry[]>("/api/admin/audit");
  }
  providers() {
    return this.json<ProviderInfo[]>("/api/admin/providers");
  }
  refresh(providerId?: string) {
    return this.json<ProviderRunReport[]>("/api/admin/refresh", { method: "POST", body: JSON.stringify({ providerId }) });
  }
  pending() {
    return this.json<PendingReview[]>("/api/admin/pending");
  }
}

// ---------------------------------------------------------------------------

type Overlay = Partial<Record<CollectionName, Record<string, Record<string, unknown> | null>>>;

export class LocalRepository implements DataRepository {
  mode = "local" as const;
  private dataset: Dataset;

  constructor() {
    this.dataset = this.build();
  }

  private build(): Dataset {
    const base = createDemoDataset(new Date());
    const overlay = load<Overlay>("admin-overlay", {});
    const out: Dataset = { ...base };
    for (const [collection, entries] of Object.entries(overlay) as [CollectionName, Record<string, Record<string, unknown> | null>][]) {
      let list = [...(out[collection] as unknown as Record<string, unknown>[])];
      for (const [id, entity] of Object.entries(entries)) {
        list = list.filter((e) => entityId(collection, e) !== id);
        if (entity) list.push(entity);
      }
      (out as unknown as Record<string, unknown>)[collection] = list;
    }
    return out;
  }

  private persist(collection: CollectionName, id: string, entity: Record<string, unknown> | null, audit: AuditEntry) {
    const overlay = load<Overlay>("admin-overlay", {});
    overlay[collection] = { ...(overlay[collection] ?? {}), [id]: entity };
    save("admin-overlay", overlay);
    save("audit", [audit, ...load<AuditEntry[]>("audit", [])].slice(0, 500));
  }

  async load() {
    this.dataset = this.build();
    return { dataset: this.dataset, lastRefreshedAt: this.dataset.generatedAt };
  }

  async upsert(collection: CollectionName, entity: Record<string, unknown>) {
    try {
      const r = upsertEntity(this.dataset, collection, entity, "admin:local", new Date());
      this.dataset = r.dataset;
      this.persist(collection, entityId(collection, entity), entity, r.audit);
      return { dataset: this.dataset, warnings: r.issues.filter((i) => i.severity === "warning") };
    } catch (e) {
      throw new RepositoryError((e as Error).message, (e as { issues?: ValidationIssue[] }).issues ?? []);
    }
  }

  async remove(collection: CollectionName, id: string) {
    const r = deleteEntity(this.dataset, collection, id, "admin:local", new Date());
    this.dataset = r.dataset;
    this.persist(collection, id, null, r.audit);
    return this.dataset;
  }

  async verify(collection: CollectionName, id: string) {
    const r = verifyEntity(this.dataset, collection, id, "admin:local", new Date());
    this.dataset = r.dataset;
    const updated = (this.dataset[collection] as unknown as Record<string, unknown>[]).find((e) => entityId(collection, e) === id) ?? null;
    this.persist(collection, id, updated, r.audit);
    return this.dataset;
  }

  async audit() {
    return load<AuditEntry[]>("audit", []);
  }
  async providers(): Promise<ProviderInfo[]> {
    return [];
  }
  async refresh(): Promise<ProviderRunReport[]> {
    throw new RepositoryError("Live refresh needs the API server (npm run server). The browser never scrapes financial websites.");
  }
  async pending(): Promise<PendingReview[]> {
    return [];
  }
  async reset() {
    remove("admin-overlay");
    remove("audit");
    return (await this.load()).dataset;
  }
}

/** Use the API server when reachable, otherwise fall back to the bundled demo dataset. */
export async function connectRepository(): Promise<DataRepository> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch("/api/health", { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok && (res.headers.get("content-type") ?? "").includes("application/json")) {
      const body = (await res.json()) as { ok?: boolean; cards?: number };
      if (body.ok && (body.cards ?? 0) > 0) return new RemoteRepository();
    }
  } catch {
    /* fall through */
  }
  return new LocalRepository();
}

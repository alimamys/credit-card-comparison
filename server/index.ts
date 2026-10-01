import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { deleteEntity, isCollection, upsertEntity, ValidationError, verifyEntity } from "../src/core/admin/mutations";
import type { Transaction, UserPreferences, UserRewardState } from "../src/core/domain/types";
import { parseTransactionInput, toTransaction } from "../src/core/parser/transactionParser";
import { computeDataQuality } from "../src/core/quality/dataQuality";
import { type Catalog, createCatalog } from "../src/core/services/catalog";
import { configuredProviders } from "./ingestion/providers";
import { refresh, startScheduler } from "./ingestion/scheduler";
import { FileStore } from "./store";

/**
 * TapWise API server.
 *  - Serves the refreshed internal dataset to the frontend (GET /api/dataset).
 *  - Runs recommendations server-side for other clients (POST /api/recommend).
 *  - Hosts the ingestion pipeline + scheduler and admin CRUD with audit log.
 * Uses only node:http so it runs anywhere Node 20+ runs.
 */

const PORT = Number(process.env.PORT ?? 8787);
const ADMIN_TOKEN = process.env.TAPWISE_ADMIN_TOKEN;
const DIST = join(process.cwd(), "dist");

const store = new FileStore();
const providers = configuredProviders();
let catalog: Catalog = createCatalog(store.state.dataset);
const rebuild = () => (catalog = createCatalog(store.state.dataset));

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 2_000_000) throw new Error("Body too large");
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function isAdmin(req: IncomingMessage): boolean {
  if (!ADMIN_TOKEN) return true; // local development: open admin. Set TAPWISE_ADMIN_TOKEN in production.
  return req.headers.authorization === `Bearer ${ADMIN_TOKEN}`;
}

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

function serveStatic(pathname: string, res: ServerResponse): boolean {
  if (!existsSync(DIST)) return false;
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let file = join(DIST, safe);
  if (!file.startsWith(DIST) || !existsSync(file) || file === DIST) file = join(DIST, "index.html");
  if (!existsSync(file)) return false;
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
  return true;
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;
  const method = req.method ?? "GET";
  const now = new Date();

  if (!path.startsWith("/api/")) {
    if (serveStatic(path, res)) return;
    return send(res, 404, { error: "Not found" });
  }

  if (path === "/api/health") return send(res, 200, { ok: true, cards: store.state.dataset.cards.length, offers: store.state.dataset.offers.length });

  if (path === "/api/dataset" && method === "GET") {
    return send(res, 200, { dataset: store.state.dataset, lastRefreshedAt: Object.values(store.state.providerLastRun).sort().at(-1) ?? null });
  }

  if (path === "/api/parse" && method === "GET") {
    return send(res, 200, parseTransactionInput(url.searchParams.get("q") ?? "", catalog.merchants));
  }

  if (path === "/api/recommend" && method === "POST") {
    const body = (await readBody(req)) as {
      walletCardIds: string[];
      text?: string;
      transaction?: Transaction;
      preferences?: Partial<UserPreferences>;
      userRewardState?: UserRewardState;
    };
    const transaction = body.transaction ?? (body.text ? toTransaction(parseTransactionInput(body.text, catalog.merchants), now) : undefined);
    if (!transaction) return send(res, 400, { error: "Provide a transaction or text with an amount" });
    if (!Array.isArray(body.walletCardIds)) return send(res, 400, { error: "walletCardIds is required" });
    return send(res, 200, catalog.recommend({ walletCardIds: body.walletCardIds, transaction, preferences: body.preferences, userRewardState: body.userRewardState, now }));
  }

  // ---- Admin ----
  if (path.startsWith("/api/admin/")) {
    if (!isAdmin(req)) return send(res, 401, { error: "Admin token required" });
    const actor = `admin:${(req.headers["x-admin-user"] as string) || "admin"}`;
    const parts = path.split("/").filter(Boolean).slice(2); // after api/admin

    if (parts[0] === "quality") return send(res, 200, computeDataQuality(store.state.dataset, now));
    if (parts[0] === "audit") return send(res, 200, store.state.audit.slice(0, Number(url.searchParams.get("limit") ?? 200)));
    if (parts[0] === "pending") return send(res, 200, store.state.pending);
    if (parts[0] === "providers") {
      return send(res, 200, providers.map((p) => ({ id: p.id, name: p.name, kind: p.kind, refreshPolicy: p.refreshPolicy, lastRunAt: store.state.providerLastRun[p.id] ?? null, lastReport: store.state.runs.find((r) => r.providerId === p.id) ?? null })));
    }
    if (parts[0] === "refresh" && method === "POST") {
      const body = (await readBody(req)) as { providerId?: string };
      const selected = body.providerId ? providers.filter((p) => p.id === body.providerId) : providers;
      const reports = await refresh(store, selected, now);
      rebuild();
      return send(res, 200, reports);
    }

    const [collection, id, action] = parts;
    if (collection && isCollection(collection)) {
      try {
        if (method === "PUT" && id) {
          const entity = (await readBody(req)) as Record<string, unknown>;
          const r = upsertEntity(store.state.dataset, collection, entity, actor, now);
          store.state.dataset = r.dataset;
          store.appendAudit([r.audit]);
          store.save();
          rebuild();
          return send(res, 200, { ok: true, warnings: r.issues.filter((i) => i.severity === "warning") });
        }
        if (method === "DELETE" && id) {
          const r = deleteEntity(store.state.dataset, collection, id, actor, now);
          store.state.dataset = r.dataset;
          store.appendAudit([r.audit]);
          store.save();
          rebuild();
          return send(res, 200, { ok: true });
        }
        if (method === "POST" && id && action === "verify") {
          const r = verifyEntity(store.state.dataset, collection, id, actor, now);
          store.state.dataset = r.dataset;
          store.appendAudit([r.audit]);
          store.save();
          rebuild();
          return send(res, 200, { ok: true });
        }
      } catch (e) {
        if (e instanceof ValidationError) return send(res, 422, { error: e.message, issues: e.issues });
        return send(res, 404, { error: (e as Error).message });
      }
    }
  }

  return send(res, 404, { error: "Not found" });
}

async function main() {
  if (store.isEmpty) {
    console.log("[server] Empty store — seeding from configured providers…");
    await refresh(store, providers);
  }
  rebuild();
  startScheduler(store, providers, rebuild);
  createServer((req, res) => {
    handle(req, res).catch((e) => send(res, 500, { error: (e as Error).message }));
  }).listen(PORT, () => console.log(`[server] TapWise API on http://localhost:${PORT}`));
}

void main();

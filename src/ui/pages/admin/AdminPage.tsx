import { useCallback, useEffect, useMemo, useState } from "react";
import type { CollectionName, DataSource } from "../../../core/domain/types";
import { getOfferStatus } from "../../../core/engines/offerEligibilityEngine";
import type { AuditEntry, PendingReview } from "../../../core/ingestion/pipeline";
import { formatDate, formatRelativeDays, ruleRateDisplay } from "../../../core/format";
import { computeDataQuality, type QualityItem } from "../../../core/quality/dataQuality";
import { daysSince } from "../../../core/time";
import { entityId } from "../../../core/validation/validate";
import { Badge, ConfirmButton, DataStatusBadge } from "../../components/ui";
import { navigate } from "../../router";
import { useCatalog } from "../../state/AppState";
import type { ProviderInfo } from "../../state/repository";
import { COLLECTION_LABELS, EntityEditor, templateFor } from "./EntityEditor";

type Tab = "quality" | "offers" | "cards" | "rules" | "banks" | "merchants" | "mccs" | "rewardCurrencies" | "sources" | "audit" | "ingestion";
const TABS: { id: Tab; label: string }[] = [
  { id: "quality", label: "Data quality" },
  { id: "offers", label: "Offers" },
  { id: "cards", label: "Cards" },
  { id: "rules", label: "Card rules" },
  { id: "banks", label: "Banks" },
  { id: "merchants", label: "Merchants" },
  { id: "mccs", label: "MCCs" },
  { id: "rewardCurrencies", label: "Loyalty & valuations" },
  { id: "sources", label: "Sources" },
  { id: "audit", label: "Audit log" },
  { id: "ingestion", label: "Ingestion" },
];

type Rec = Record<string, unknown>;
type Editing = { collection: CollectionName; entity: Rec; isNew?: boolean };

// ---------------------------------------------------------------------------

function QualityDashboard({ onEdit }: { onEdit(collection: CollectionName, id: string): void }) {
  const { dataset, now } = useCatalog();
  const q = useMemo(() => computeDataQuality(dataset, now), [dataset, now]);
  const groups: { title: string; items: QualityItem[]; empty: string }[] = [
    { title: "Expired offers", items: q.expiredOffers, empty: "No expired offers." },
    { title: "Offers expiring soon", items: q.expiringSoon, empty: "Nothing expiring in the next 7 days." },
    { title: "Cards not verified recently", items: q.staleCards, empty: "All cards verified in the last 30 days." },
    { title: "Active offers not re-verified", items: q.staleOffers, empty: "All active offers verified within 14 days." },
    { title: "Reward currencies needing updated valuations", items: q.valuationsNeedingUpdate, empty: "All valuations current." },
    { title: "Conflicting rules", items: q.conflicts, empty: "No conflicts detected." },
    { title: "Rules missing sources", items: q.missingSources, empty: "Every rule cites a source." },
  ];
  const errors = q.validation.filter((v) => v.severity === "error");
  return (
    <div>
      <div className="stat-row">
        <div className="stat-tile">
          <span>{q.totals.cards}</span>cards
        </div>
        <div className="stat-tile">
          <span>{q.totals.activeOffers}</span>/ {q.totals.offers} offers active
        </div>
        <div className="stat-tile">
          <span>{q.totals.currencies}</span>loyalty currencies
        </div>
        <div className="stat-tile">
          <span>{q.totals.merchants}</span>merchants
        </div>
        <div className={`stat-tile ${q.totals.demoRecords ? "stat-tile--warn" : ""}`}>
          <span>{q.totals.demoRecords}</span>demo records
        </div>
        <div className={`stat-tile ${errors.length ? "stat-tile--danger" : ""}`}>
          <span>{errors.length}</span>validation errors
        </div>
      </div>
      <div className="quality-grid">
        {groups.map((g) => (
          <section key={g.title} className="quality-card">
            <h3>
              {g.title} <span className={`count ${g.items.length ? "count--hot" : ""}`}>{g.items.length}</span>
            </h3>
            {g.items.length ? (
              <ul className="quality-list">
                {g.items.slice(0, 12).map((i, k) => (
                  <li key={`${i.id}-${k}`} className={`sev sev--${i.severity}`}>
                    <button type="button" className="link-btn" onClick={() => onEdit(i.collection, i.id)}>
                      {i.title}
                    </button>
                    <div className="small muted">{i.detail}</div>
                  </li>
                ))}
                {g.items.length > 12 && <li className="small muted">+ {g.items.length - 12} more</li>}
              </ul>
            ) : (
              <p className="small good">✓ {g.empty}</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface Column {
  label: string;
  render(e: Rec): React.ReactNode;
}

function columnsFor(collection: CollectionName, now: Date, lookup: (c: CollectionName, id: string) => string): Column[] {
  const verified: Column = {
    label: "Verified",
    render: (e) => {
      const d = daysSince(e.lastVerifiedAt as string | undefined, now);
      return <span className={d !== undefined && d > 30 ? "warn-text" : ""}>{formatRelativeDays(d)}</span>;
    },
  };
  const status: Column = { label: "Status", render: (e) => <DataStatusBadge status={e.dataStatus as never} /> };
  switch (collection) {
    case "offers":
      return [
        { label: "Offer", render: (e) => <strong>{e.title as string}</strong> },
        { label: "Type", render: (e) => e.offerType as string },
        { label: "Targets", render: (e) => [(e.cardIds as string[] | undefined)?.map((id) => lookup("cards", id)).join(", "), (e.bankIds as string[] | undefined)?.map((id) => lookup("banks", id)).join(", "), e.network as string].filter(Boolean).join(" · ") || "Any" },
        { label: "Dates", render: (e) => `${formatDate(e.startDate as string)} – ${formatDate(e.endDate as string)}` },
        { label: "Live status", render: (e) => { const s = getOfferStatus(e as never, now); return <Badge tone={s === "active" ? "good" : s === "upcoming" ? "neutral" : "warn"}>{s}</Badge>; } },
        status,
        verified,
      ];
    case "cards":
      return [
        { label: "Card", render: (e) => <strong>{e.name as string}</strong> },
        { label: "Bank", render: (e) => lookup("banks", e.bankId as string) },
        { label: "Reward", render: (e) => lookup("rewardCurrencies", e.rewardCurrencyId as string) },
        { label: "Rules", render: (e) => (e.earnRules as unknown[]).length },
        status,
        verified,
      ];
    case "banks":
      return [{ label: "Bank", render: (e) => <strong>{e.name as string}</strong> }, { label: "Islamic", render: (e) => (e.isIslamic ? "Yes" : "") }, status, verified];
    case "merchants":
      return [
        { label: "Merchant", render: (e) => <strong>{e.name as string}</strong> },
        { label: "Category", render: (e) => e.category as string },
        { label: "MCCs", render: (e) => (e.mccs as string[]).join(", ") },
        { label: "Aliases", render: (e) => <span className="small">{(e.aliases as string[]).join(", ")}</span> },
        status,
      ];
    case "mccs":
      return [{ label: "Code", render: (e) => <code>{e.code as string}</code> }, { label: "Description", render: (e) => e.description as string }, { label: "Category", render: (e) => e.category as string }, status];
    case "rewardCurrencies":
      return [
        { label: "Currency", render: (e) => <strong>{e.name as string}</strong> },
        { label: "Type", render: (e) => e.type as string },
        { label: "AED / unit", render: (e) => String((e.valuation as Rec).aedValuePerUnit) },
        { label: "Range", render: (e) => { const v = e.valuation as Rec; return v.lowEstimate !== undefined ? `${v.lowEstimate}–${v.highEstimate}` : "—"; } },
        { label: "Method", render: (e) => String((e.valuation as Rec).valuationMethod).replace(/_/g, " ") },
        { label: "Confidence", render: (e) => String((e.valuation as Rec).confidence) },
        { label: "Valuation updated", render: (e) => formatRelativeDays(daysSince((e.valuation as Rec).lastUpdatedAt as string, now)) },
      ];
  }
}

function CollectionTable({ collection, onEdit }: { collection: CollectionName; onEdit(e: Editing): void }) {
  const { dataset, repo, replaceDataset, now, catalog } = useCatalog();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const lookup = useCallback(
    (c: CollectionName, id: string) => {
      if (c === "cards") return catalog.cards.get(id)?.name ?? id;
      if (c === "banks") return catalog.cards.bank(id)?.shortName ?? id;
      if (c === "rewardCurrencies") return catalog.valuations.get(id)?.name ?? id;
      return id;
    },
    [catalog],
  );
  const rows = (dataset[collection] as unknown as Rec[]).filter((e) => !q || JSON.stringify(e).toLowerCase().includes(q.toLowerCase()));
  const cols = columnsFor(collection, now, lookup);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setActionError(undefined);
    try {
      await fn();
    } catch (e) {
      setActionError(`${id}: ${(e as Error).message}`);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div>
      <div className="panel__title-row">
        <input className="input" type="search" placeholder={`Search ${rows.length} records`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search records" />
        <button type="button" className="btn btn--primary btn--sm" onClick={() => onEdit({ collection, entity: templateFor(collection, now), isNew: true })}>
          + New {COLLECTION_LABELS[collection].toLowerCase()}
        </button>
      </div>
      {actionError && <div className="callout callout--danger small">{actionError}</div>}
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.label}>{c.label}</th>
              ))}
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const id = entityId(collection, e);
              return (
                <tr key={id}>
                  {cols.map((c) => (
                    <td key={c.label}>{c.render(e)}</td>
                  ))}
                  <td className="actions">
                    <button type="button" className="btn btn--ghost btn--xs" onClick={() => onEdit({ collection, entity: e })}>
                      Edit
                    </button>
                    <button type="button" className="btn btn--ghost btn--xs" disabled={busy === id} onClick={() => act(id, async () => replaceDataset(await repo!.verify(collection, id)))} title="Record that this was checked against its official source today">
                      Mark verified
                    </button>
                    <ConfirmButton className="btn btn--danger-ghost btn--xs" confirmLabel="Confirm delete" disabled={busy === id} onConfirm={() => act(id, async () => replaceDataset(await repo!.remove(collection, id)))}>
                      Delete
                    </ConfirmButton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RulesView({ onEdit }: { onEdit(e: Editing): void }) {
  const { dataset, catalog, now } = useCatalog();
  return (
    <div className="table-wrap">
      <p className="small muted">Earning rules are stored on each card. The most specific matching rule wins (merchant › MCC › category › base). Edit opens the card record.</p>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Card</th>
            <th>Rule</th>
            <th>Applies to</th>
            <th>Rate</th>
            <th>Cap / tier</th>
            <th>Verified</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {dataset.cards.flatMap((card) =>
            card.earnRules.map((r) => {
              const currency = catalog.valuations.get(card.rewardCurrencyId);
              const m = r.match;
              const scope = [m.merchantIds?.map((id) => catalog.merchants.get(id)?.name ?? id).join(", "), m.mccs?.join(", "), m.categories?.join(", "), m.region && m.region !== "any" ? m.region : "", m.channel && m.channel !== "any" ? m.channel : ""].filter(Boolean).join(" · ");
              return (
                <tr key={`${card.id}-${r.id}`}>
                  <td>{card.name}</td>
                  <td>{r.label}</td>
                  <td className="small">{scope || <em>Base (everything else)</em>}</td>
                  <td>{currency ? ruleRateDisplay(r, currency) : r.unitsPerAED}</td>
                  <td className="small">{[r.capGroupId && card.capGroups?.find((g) => g.id === r.capGroupId)?.label, r.minMonthlySpendAED && `≥ AED ${r.minMonthlySpendAED}/month`].filter(Boolean).join(" · ") || "—"}</td>
                  <td>{formatRelativeDays(daysSince(r.lastVerifiedAt ?? card.lastVerifiedAt, now))}</td>
                  <td>
                    <button type="button" className="btn btn--ghost btn--xs" onClick={() => onEdit({ collection: "cards", entity: card as unknown as Rec })}>
                      Edit card
                    </button>
                  </td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </div>
  );
}

function SourcesView() {
  const { dataset } = useCatalog();
  const rows = useMemo(() => {
    const out: { entity: string; kind: string; source: DataSource | { url: string; publisher: string; retrievedAt?: string } }[] = [];
    for (const c of dataset.cards) {
      for (const s of c.sources ?? []) out.push({ entity: c.name, kind: "Card", source: s });
      if (c.termsUrl) out.push({ entity: c.name, kind: "Card T&Cs", source: { url: c.termsUrl, publisher: c.bankId } });
      for (const r of c.earnRules) for (const s of r.sources ?? []) out.push({ entity: `${c.name} › ${r.label}`, kind: "Rule", source: s });
    }
    for (const o of dataset.offers) {
      out.push({ entity: o.title, kind: `Offer (${o.sourceType})`, source: { url: o.sourceUrl, publisher: o.publisher, retrievedAt: o.lastVerifiedAt } });
      for (const s of o.sources ?? []) out.push({ entity: o.title, kind: "Offer", source: s });
    }
    for (const c of dataset.rewardCurrencies) for (const u of c.valuation.sourceUrls ?? []) out.push({ entity: c.name, kind: "Valuation", source: { url: u, publisher: c.issuer ?? c.name, retrievedAt: c.valuation.lastUpdatedAt } });
    for (const m of dataset.mccs.slice(0, 1)) for (const s of m.sources ?? []) out.push({ entity: "MCC table", kind: "MCC", source: s });
    return out;
  }, [dataset]);
  return (
    <div className="table-wrap">
      <p className="small muted">Every rule, offer and valuation should be traceable to a publisher and URL. <code>demo://</code> sources are placeholders for fictional demo records.</p>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Record</th>
            <th>Kind</th>
            <th>Publisher</th>
            <th>URL</th>
            <th>Retrieved</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.entity}</td>
              <td>{r.kind}</td>
              <td>{r.source.publisher}</td>
              <td className="small">{r.source.url.startsWith("demo://") ? <span className="muted">{r.source.url}</span> : <a href={r.source.url} target="_blank" rel="noreferrer">{r.source.url}</a>}</td>
              <td className="small">{r.source.retrievedAt ? formatDate(r.source.retrievedAt) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditView() {
  const { repo, dataset } = useCatalog();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [open, setOpen] = useState<string>();
  useEffect(() => {
    void repo?.audit().then(setEntries).catch(() => setEntries([]));
  }, [repo, dataset]);
  if (!entries.length) return <p className="muted">No changes recorded yet. Edits, verifications and ingestion runs appear here.</p>;
  return (
    <ul className="audit-list">
      {entries.map((e) => (
        <li key={e.id} className="audit">
          <button type="button" className="audit__head" onClick={() => setOpen(open === e.id ? undefined : e.id)} aria-expanded={open === e.id}>
            <Badge tone={e.action === "delete" ? "warn" : e.action === "verify" ? "good" : "neutral"}>{e.action}</Badge>
            <span>
              <code>{e.collection}</code> / <strong>{e.entityId}</strong>
            </span>
            <span className="small muted">
              {e.actor} · {new Date(e.at).toLocaleString("en-GB", { timeZone: "Asia/Dubai" })}
            </span>
          </button>
          {open === e.id && (
            <div className="audit__diff">
              {e.note && <p className="small">{e.note}</p>}
              {e.before !== undefined && (
                <details>
                  <summary>Before</summary>
                  <pre>{JSON.stringify(e.before, null, 2)}</pre>
                </details>
              )}
              {e.after !== undefined && (
                <details open>
                  <summary>After</summary>
                  <pre>{JSON.stringify(e.after, null, 2)}</pre>
                </details>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function IngestionView() {
  const { repo, reloadDataset, lastRefreshedAt } = useCatalog();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [msg, setMsg] = useState<string>();
  const [token, setToken] = useState(() => {
    try {
      return sessionStorage.getItem("tapwise:admin-token") ?? "";
    } catch {
      return "";
    }
  });
  const load = useCallback(async () => {
    if (repo?.mode !== "remote") return;
    try {
      setProviders(await repo.providers());
      setPending(await repo.pending());
    } catch (e) {
      setMsg((e as Error).message);
    }
  }, [repo]);
  useEffect(() => void load(), [load]);

  if (repo?.mode !== "remote") {
    return (
      <div className="callout callout--demo">
        <strong>No API server connected.</strong> This browser is using the bundled demo dataset. Live refreshes run server-side only — the frontend never scrapes bank or merchant websites.
        <pre className="code-block">npm run server   # starts the API + ingestion scheduler on :8787{"\n"}npm run dev      # Vite proxies /api to the server</pre>
        Admin edits made here are saved in this browser only.
      </div>
    );
  }

  const run = async (providerId?: string) => {
    setMsg("Refreshing…");
    try {
      const reports = await repo.refresh(providerId);
      setMsg(reports.map((r) => `${r.providerName}: +${r.created} new, ${r.updated} updated, ${r.unchanged} unchanged, ${r.rejected} rejected, ${r.queuedForReview} for review${r.errors.length ? ` — ${r.errors.join("; ")}` : ""}`).join("\n"));
      await reloadDataset();
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div>
      <label className="field field--inline">
        <span>Admin token (if the server sets TAPWISE_ADMIN_TOKEN)</span>
        <input
          type="password"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            try {
              sessionStorage.setItem("tapwise:admin-token", e.target.value);
            } catch {
              /* ignore */
            }
          }}
        />
      </label>
      <p className="small muted">Dataset last refreshed {lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleString("en-GB", { timeZone: "Asia/Dubai" }) : "never"}.</p>
      <div className="row-actions">
        <button type="button" className="btn btn--primary btn--sm" onClick={() => run()}>
          Refresh all providers now
        </button>
      </div>
      {msg && <pre className="code-block small">{msg}</pre>}
      <table className="admin-table">
        <thead>
          <tr>
            <th>Provider</th>
            <th>Kind</th>
            <th>Refresh policy</th>
            <th>Last run</th>
            <th>Last result</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {providers.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.kind}</td>
              <td className="small">{p.refreshPolicy.description}</td>
              <td className="small">{p.lastRunAt ? new Date(p.lastRunAt).toLocaleString("en-GB", { timeZone: "Asia/Dubai" }) : "never"}</td>
              <td className="small">{p.lastReport ? (p.lastReport.ok ? `✓ ${p.lastReport.created + p.lastReport.updated} changed` : `✖ ${p.lastReport.errors.join("; ")}`) : "—"}</td>
              <td>
                <button type="button" className="btn btn--ghost btn--xs" onClick={() => run(p.id)}>
                  Run
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="section-title">Changes awaiting review ({pending.length})</h3>
      <p className="small muted">Automated sources never overwrite admin-verified records; differences are queued here.</p>
      <ul className="audit-list">
        {pending.map((p) => (
          <li key={p.id} className="audit">
            <div className="audit__head">
              <code>{p.collection}</code> / <strong>{p.entityId}</strong> <span className="small muted">from {p.providerId}</span>
            </div>
            <details>
              <summary>Proposed</summary>
              <pre>{JSON.stringify(p.proposed, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function AdminPage({ sub }: { sub?: string }) {
  const { dataset, repo } = useCatalog();
  const tab: Tab = (TABS.some((t) => t.id === sub) ? sub : "quality") as Tab;
  const [editing, setEditing] = useState<Editing>();

  const editById = (collection: CollectionName, id: string) => {
    const e = (dataset[collection] as unknown as Rec[]).find((x) => entityId(collection, x) === id);
    if (e) setEditing({ collection, entity: e });
  };

  return (
    <div className="page page--wide">
      <header className="page__head">
        <h1>Admin</h1>
        <p className="muted">
          Internal data management · {repo?.mode === "remote" ? "connected to API server" : "local mode (edits saved in this browser)"} · dataset {dataset.version}
        </p>
      </header>
      <nav className="tabs tabs--scroll" aria-label="Admin sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`tab ${tab === t.id ? "is-active" : ""}`} onClick={() => navigate("admin", t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="admin-body">
        {tab === "quality" && <QualityDashboard onEdit={editById} />}
        {(["offers", "cards", "banks", "merchants", "mccs", "rewardCurrencies"] as const).includes(tab as never) && <CollectionTable collection={tab as CollectionName} onEdit={setEditing} />}
        {tab === "rules" && <RulesView onEdit={setEditing} />}
        {tab === "sources" && <SourcesView />}
        {tab === "audit" && <AuditView />}
        {tab === "ingestion" && <IngestionView />}
      </div>
      {editing && <EntityEditor key={JSON.stringify(editing.entity).length} collection={editing.collection} entity={editing.entity} isNew={editing.isNew} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

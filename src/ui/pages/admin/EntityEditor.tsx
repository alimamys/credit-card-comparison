import { useMemo, useState } from "react";
import { CATEGORIES } from "../../../core/domain/categories";
import type { CardOffer, CollectionName, OfferType, StackingRule } from "../../../core/domain/types";
import { uaeDateOnly } from "../../../core/time";
import { validateEntity, type ValidationIssue } from "../../../core/validation/validate";
import { STACKING_TEXT } from "../../components/offers";
import { Modal } from "../../components/ui";
import { useCatalog } from "../../state/AppState";
import { RepositoryError } from "../../state/repository";

type Rec = Record<string, unknown>;

export const COLLECTION_LABELS: Record<CollectionName, string> = {
  banks: "Bank",
  cards: "Card",
  rewardCurrencies: "Loyalty currency",
  merchants: "Merchant",
  mccs: "MCC",
  offers: "Offer",
};

export function templateFor(collection: CollectionName, now: Date): Rec {
  const today = uaeDateOnly(now);
  const base = { dataStatus: "verified", lastVerifiedAt: today, lastCheckedAt: today };
  switch (collection) {
    case "banks":
      return { id: "new_bank", name: "", shortName: "", country: "AE", website: "", ...base };
    case "merchants":
      return { id: "new_merchant", name: "", aliases: [], category: "other", mccs: [], ...base };
    case "mccs":
      return { code: "0000", description: "", category: "other", ...base };
    case "rewardCurrencies":
      return {
        id: "new_currency",
        name: "",
        shortName: "",
        type: "bank_points",
        unitSingular: "Point",
        unitPlural: "Points",
        badge: "REWARD POINTS",
        rounding: "floor",
        ...base,
        valuation: { currencyId: "new_currency", aedValuePerUnit: 0, valuationMethod: "market_estimate", lastUpdatedAt: today, confidence: "low", dataStatus: "estimated", sourceUrls: [] },
      };
    case "cards":
      return {
        id: "new_card",
        bankId: "",
        name: "",
        network: "Visa",
        networkTier: "Visa Platinum",
        rewardCurrencyId: "aed_cash",
        annualFeeAED: 0,
        foreignTransactionFeePct: 0,
        earnRules: [{ id: "base", label: "All other spend", unitsPerAED: 0.01, match: {} }],
        capGroups: [],
        design: { from: "#334155", to: "#0f172a" },
        termsUrl: "",
        sources: [],
        ...base,
      };
    case "offers":
      return {
        id: `offer_${Date.now().toString(36)}`,
        title: "",
        offerType: "cashback",
        rate: 0.1,
        startDate: today,
        endDate: today,
        stackingRule: "unknown",
        publisher: "",
        sourceType: "admin",
        sourceUrl: "",
        status: "active",
        ...base,
      };
  }
}

function Issues({ issues }: { issues: ValidationIssue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="issues">
      {issues.map((i, k) => (
        <li key={k} className={`issue issue--${i.severity}`}>
          {i.severity === "error" ? "✖" : "⚠"} {i.field ? <code>{i.field}</code> : null} {i.message}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Offer form (structured) — admins can edit offers without touching code
// ---------------------------------------------------------------------------

function Picker({ options, value, onChange, label }: { options: { id: string; label: string }[]; value: string[]; onChange(v: string[]): void; label: string }) {
  const [q, setQ] = useState("");
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <fieldset className="picker">
      <legend>
        {label} <span className="muted small">({value.length ? `${value.length} selected` : "any"})</span>
      </legend>
      {options.length > 8 && <input className="input input--sm" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />}
      <div className="picker__list">
        {shown.map((o) => (
          <label key={o.id} className="picker__opt">
            <input type="checkbox" checked={value.includes(o.id)} onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((v) => v !== o.id))} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const OFFER_TYPES: OfferType[] = ["cashback", "discount", "bonus_points", "bonus_miles", "multiplier", "fixed_reward", "statement_credit"];
const STACKING: StackingRule[] = ["stack", "replace_base", "best_of", "unknown"];

function OfferForm({ value, onChange }: { value: Rec; onChange(v: Rec): void }) {
  const { catalog } = useCatalog();
  const o = value as unknown as Partial<CardOffer>;
  const set = (k: keyof CardOffer, v: unknown) => {
    const next = { ...value, [k]: v };
    if (v === "" || v === undefined || (Array.isArray(v) && !v.length)) delete next[k];
    onChange(next);
  };
  const num = (k: keyof CardOffer) => ({
    value: value[k] === undefined ? "" : String(value[k]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value === "" ? undefined : Number(e.target.value)),
  });
  const pctTypes = o.offerType === "cashback" || o.offerType === "discount";
  const list = (k: keyof CardOffer) => ({
    value: ((value[k] as string[] | undefined) ?? []).join(", "),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value.split(",").map((s) => s.trim()).filter(Boolean)),
  });

  return (
    <div className="form-grid">
      <label className="field">
        <span>Id</span>
        <input value={o.id ?? ""} onChange={(e) => set("id", e.target.value)} />
      </label>
      <label className="field">
        <span>Canonical campaign id (dedupe)</span>
        <input value={o.canonicalOfferId ?? ""} onChange={(e) => set("canonicalOfferId", e.target.value)} placeholder="Same id for the same campaign across sources" />
      </label>
      <label className="field field--wide">
        <span>Title</span>
        <input value={o.title ?? ""} onChange={(e) => set("title", e.target.value)} />
      </label>
      <label className="field field--wide">
        <span>Description</span>
        <input value={o.description ?? ""} onChange={(e) => set("description", e.target.value)} />
      </label>

      <label className="field">
        <span>Offer type</span>
        <select value={o.offerType} onChange={(e) => set("offerType", e.target.value)}>
          {OFFER_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      {(pctTypes || o.offerType === "bonus_points" || o.offerType === "bonus_miles") && (
        <label className="field">
          <span>{pctTypes ? "Rate (%)" : "Bonus units per AED"}</span>
          <input
            type="number"
            step="0.01"
            value={o.rate === undefined ? "" : pctTypes ? +(o.rate * 100).toFixed(4) : o.rate}
            onChange={(e) => set("rate", e.target.value === "" ? undefined : pctTypes ? Number(e.target.value) / 100 : Number(e.target.value))}
          />
        </label>
      )}
      {o.offerType === "multiplier" && (
        <label className="field">
          <span>Multiplier (total, e.g. 5 = 5X)</span>
          <input type="number" step="0.5" {...num("multiplier")} />
        </label>
      )}
      {(o.offerType === "fixed_reward" || o.offerType === "statement_credit" || o.offerType === "discount") && (
        <label className="field">
          <span>Fixed value</span>
          <input type="number" {...num("fixedValue")} />
        </label>
      )}
      <label className="field">
        <span>Reward currency</span>
        <select value={o.rewardCurrencyId ?? ""} onChange={(e) => set("rewardCurrencyId", e.target.value)}>
          <option value="">Default (AED for cash, card currency otherwise)</option>
          {catalog.valuations.all().map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Minimum spend (AED)</span>
        <input type="number" {...num("minimumSpend")} />
      </label>
      <label className="field">
        <span>Maximum eligible spend (AED)</span>
        <input type="number" {...num("maximumSpend")} />
      </label>
      <label className="field">
        <span>Reward cap (per transaction)</span>
        <input type="number" {...num("rewardCap")} />
      </label>

      <label className="field field--wide">
        <span>Stacking with standard rewards</span>
        <select value={o.stackingRule} onChange={(e) => set("stackingRule", e.target.value)}>
          {STACKING.map((s) => (
            <option key={s} value={s}>
              {s} — {STACKING_TEXT[s]}
            </option>
          ))}
        </select>
      </label>

      <div className="field--wide picker-row">
        <Picker label="Cards" options={catalog.cards.all().map((c) => ({ id: c.id, label: c.name }))} value={o.cardIds ?? []} onChange={(v) => set("cardIds", v)} />
        <Picker label="Banks" options={catalog.cards.banksList().map((b) => ({ id: b.id, label: b.name }))} value={o.bankIds ?? []} onChange={(v) => set("bankIds", v)} />
        <Picker label="Merchants" options={catalog.merchants.all().map((m) => ({ id: m.id, label: m.name }))} value={o.merchants ?? []} onChange={(v) => set("merchants", v)} />
        <Picker label="Categories" options={CATEGORIES.map((c) => ({ id: c.id, label: c.label }))} value={o.categories ?? []} onChange={(v) => set("categories", v)} />
      </div>
      <label className="field">
        <span>Card network</span>
        <select value={o.network ?? ""} onChange={(e) => set("network", e.target.value)}>
          <option value="">Any</option>
          <option>Visa</option>
          <option>Mastercard</option>
          <option>Amex</option>
        </select>
      </label>
      <label className="field">
        <span>Network tiers (comma-separated)</span>
        <input {...list("networkTiers")} placeholder="Visa Signature, Visa Infinite" />
      </label>
      <label className="field">
        <span>Payment methods (comma-separated)</span>
        <input {...list("paymentMethodRestrictions")} placeholder="Apple Pay" />
      </label>

      <label className="field">
        <span>Start date</span>
        <input type="date" value={(o.startDate ?? "").slice(0, 10)} onChange={(e) => set("startDate", e.target.value)} />
      </label>
      <label className="field">
        <span>End date</span>
        <input type="date" value={(o.endDate ?? "").slice(0, 10)} onChange={(e) => set("endDate", e.target.value)} />
      </label>
      <label className="field">
        <span>Stored status</span>
        <select value={o.status} onChange={(e) => set("status", e.target.value)}>
          <option>active</option>
          <option>upcoming</option>
          <option value="expired">expired (withdrawn)</option>
        </select>
      </label>

      <label className="switch">
        <input type="checkbox" checked={!!o.registrationRequired} onChange={(e) => set("registrationRequired", e.target.checked || undefined)} />
        <span>Registration required</span>
      </label>
      <label className="field">
        <span>Registration URL</span>
        <input value={o.registrationUrl ?? ""} onChange={(e) => set("registrationUrl", e.target.value)} />
      </label>
      <label className="switch">
        <input type="checkbox" checked={!!o.promoCodeRequired} onChange={(e) => set("promoCodeRequired", e.target.checked || undefined)} />
        <span>Promo code required</span>
      </label>
      <label className="field">
        <span>Promo code</span>
        <input value={o.promoCode ?? ""} onChange={(e) => set("promoCode", e.target.value)} />
      </label>
      <label className="field field--wide">
        <span>Eligibility conditions (one per line)</span>
        <textarea rows={3} value={(o.eligibilityConditions ?? []).join("\n")} onChange={(e) => set("eligibilityConditions", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
      </label>

      <label className="field">
        <span>Publisher</span>
        <input value={o.publisher ?? ""} onChange={(e) => set("publisher", e.target.value)} />
      </label>
      <label className="field">
        <span>Source type</span>
        <select value={o.sourceType} onChange={(e) => set("sourceType", e.target.value)}>
          {["bank", "merchant", "network", "loyalty", "admin"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label className="field field--wide">
        <span>Source URL (required)</span>
        <input value={o.sourceUrl ?? ""} onChange={(e) => set("sourceUrl", e.target.value)} placeholder="https://… official terms page" />
      </label>
      <label className="field">
        <span>Last verified</span>
        <input type="date" value={(o.lastVerifiedAt ?? "").slice(0, 10)} onChange={(e) => set("lastVerifiedAt", e.target.value)} />
      </label>
      <label className="field">
        <span>Data status</span>
        <select value={o.dataStatus} onChange={(e) => set("dataStatus", e.target.value)}>
          {["live", "verified", "cached", "estimated", "demo", "expired"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function EntityEditor({ collection, entity, isNew, onClose }: { collection: CollectionName; entity: Rec; isNew?: boolean; onClose(): void }) {
  const { repo, replaceDataset, dataset } = useCatalog();
  const [mode, setMode] = useState<"form" | "json">(collection === "offers" ? "form" : "json");
  const [value, setValue] = useState<Rec>(entity);
  const [json, setJson] = useState(() => JSON.stringify(entity, null, 2));
  const [parseError, setParseError] = useState<string>();
  const [serverIssues, setServerIssues] = useState<ValidationIssue[]>([]);
  const [saving, setSaving] = useState(false);

  const current = useMemo(() => {
    if (mode === "form") return value;
    try {
      return JSON.parse(json) as Rec;
    } catch {
      return undefined;
    }
  }, [mode, value, json]);
  const issues = useMemo(() => (current ? validateEntity(collection, current, dataset) : []), [current, collection, dataset]);
  const hasErrors = !current || issues.some((i) => i.severity === "error");

  const switchMode = (m: "form" | "json") => {
    if (m === "json") setJson(JSON.stringify(value, null, 2));
    else if (current) setValue(current);
    setMode(m);
  };

  const save = async () => {
    if (!current || !repo) return;
    setSaving(true);
    try {
      const r = await repo.upsert(collection, current);
      replaceDataset(r.dataset);
      onClose();
    } catch (e) {
      setServerIssues(e instanceof RepositoryError ? e.issues : []);
      setParseError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`${isNew ? "New" : "Edit"} ${COLLECTION_LABELS[collection].toLowerCase()}`} onClose={onClose} wide>
      {collection === "offers" && (
        <div className="tabs tabs--sm">
          <button type="button" className={`tab ${mode === "form" ? "is-active" : ""}`} onClick={() => switchMode("form")}>
            Form
          </button>
          <button type="button" className={`tab ${mode === "json" ? "is-active" : ""}`} onClick={() => switchMode("json")} disabled={!current}>
            JSON
          </button>
        </div>
      )}
      {mode === "form" ? (
        <OfferForm value={value} onChange={setValue} />
      ) : (
        <>
          <p className="small muted">Edit the record as JSON. It is validated before saving and the change is written to the audit log.</p>
          <textarea
            className="json-editor"
            spellCheck={false}
            value={json}
            onChange={(e) => {
              setJson(e.target.value);
              try {
                JSON.parse(e.target.value);
                setParseError(undefined);
              } catch (err) {
                setParseError((err as Error).message);
              }
            }}
          />
        </>
      )}
      {parseError && <div className="callout callout--danger small">{parseError}</div>}
      <Issues issues={[...issues, ...serverIssues]} />
      <div className="row-actions row-actions--end">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary" disabled={hasErrors || saving} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

import type { Dataset, MccCode, Merchant } from "../domain/types";

export interface MerchantMatch {
  merchant: Merchant;
  alias: string;
  start: number;
  end: number;
  fuzzy: boolean;
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export class MerchantService {
  private readonly merchants: Map<string, Merchant>;
  private readonly mccs: Map<string, MccCode>;
  private readonly aliasIndex: { alias: string; merchant: Merchant; re: RegExp }[];

  constructor(dataset: Pick<Dataset, "merchants" | "mccs">) {
    this.merchants = new Map(dataset.merchants.map((m) => [m.id, m]));
    this.mccs = new Map(dataset.mccs.map((m) => [m.code, m]));
    this.aliasIndex = dataset.merchants
      .flatMap((merchant) =>
        [merchant.name, ...merchant.aliases].map((a) => normalise(a)).map((alias) => ({
          alias,
          merchant,
          re: new RegExp(`(^|[^a-z0-9])${escapeRegExp(alias)}(?=$|[^a-z0-9])`),
        })),
      )
      // Longest alias first so "emirates skywards" wins over "emirates".
      .sort((a, b) => b.alias.length - a.alias.length);
  }

  all(): Merchant[] {
    return [...this.merchants.values()];
  }

  get(id: string): Merchant | undefined {
    return this.merchants.get(id);
  }

  mcc(code: string): MccCode | undefined {
    return this.mccs.get(code);
  }

  mccList(): MccCode[] {
    return [...this.mccs.values()];
  }

  /** Find the merchant mentioned in free text. Exact alias match first, then a typo-tolerant match. */
  findInText(text: string): MerchantMatch | undefined {
    const t = normalise(text);
    const excluded = (merchant: Merchant) => merchant.negativeAliases?.some((n) => t.includes(normalise(n)));
    for (const { alias, merchant, re } of this.aliasIndex) {
      if (excluded(merchant)) continue;
      const m = re.exec(t);
      if (m) {
        const start = m.index + m[1].length;
        return { merchant, alias, start, end: start + alias.length, fuzzy: false };
      }
    }
    const tokens = [...t.matchAll(/[a-z][a-z0-9.&-]{3,}/g)];
    let best: MerchantMatch | undefined;
    let bestDist = Infinity;
    for (const tok of tokens) {
      for (const { alias, merchant } of this.aliasIndex) {
        if (alias.includes(" ") || alias.length < 5 || excluded(merchant)) continue;
        const d = levenshtein(tok[0], alias);
        const allowed = alias.length >= 8 ? 2 : 1;
        if (d <= allowed && d < bestDist) {
          bestDist = d;
          best = { merchant, alias, start: tok.index ?? 0, end: (tok.index ?? 0) + tok[0].length, fuzzy: true };
        }
      }
    }
    return best;
  }

  search(query: string, limit = 8): Merchant[] {
    const q = normalise(query.trim());
    if (!q) return this.all().slice(0, limit);
    return this.all()
      .filter((m) => normalise(m.name).includes(q) || m.aliases.some((a) => normalise(a).includes(q)))
      .slice(0, limit);
  }
}

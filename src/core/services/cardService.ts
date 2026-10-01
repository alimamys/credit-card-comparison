import type { Bank, Card, Dataset } from "../domain/types";

export class CardService {
  private readonly cards: Map<string, Card>;
  private readonly banks: Map<string, Bank>;

  constructor(dataset: Pick<Dataset, "cards" | "banks">) {
    this.cards = new Map(dataset.cards.map((c) => [c.id, c]));
    this.banks = new Map(dataset.banks.map((b) => [b.id, b]));
  }

  all(): Card[] {
    return [...this.cards.values()];
  }

  get(id: string): Card | undefined {
    return this.cards.get(id);
  }

  bank(id: string): Bank | undefined {
    return this.banks.get(id);
  }

  banksList(): Bank[] {
    return [...this.banks.values()];
  }

  bankForCard(card: Card): Bank | undefined {
    return this.banks.get(card.bankId);
  }

  /** Wallet cards in the order the user added them; unknown ids are ignored. */
  walletCards(ids: string[]): Card[] {
    return ids.map((id) => this.cards.get(id)).filter((c): c is Card => !!c);
  }

  notInWallet(ids: string[]): Card[] {
    const owned = new Set(ids);
    return this.all().filter((c) => !owned.has(c.id));
  }

  search(query: string): Card[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.all();
    return this.all().filter((c) => {
      const bank = this.banks.get(c.bankId);
      return `${c.name} ${bank?.name ?? ""} ${c.network} ${c.networkTier ?? ""}`.toLowerCase().includes(q);
    });
  }
}

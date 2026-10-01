import { FileStore } from "../store";
import { configuredProviders } from "./providers";
import { refresh } from "./scheduler";

// `npm run ingest` — run every configured provider once (e.g. from cron/CI).
const store = new FileStore();
await refresh(store, configuredProviders());
console.log(`Dataset now has ${store.state.dataset.cards.length} cards and ${store.state.dataset.offers.length} offers.`);

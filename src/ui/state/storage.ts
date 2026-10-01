/** localStorage wrapper that never throws (private mode, quota, SSR). */
const PREFIX = "tapwise:v1:";

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable — state stays in memory */
  }
}

export function remove(key: string): void {
  try {
    globalThis.localStorage?.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export function clearAll(): void {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return;
    for (const k of Object.keys(ls)) if (k.startsWith(PREFIX)) ls.removeItem(k);
  } catch {
    /* ignore */
  }
}

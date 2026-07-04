/**
 * Two-tier search cache:
 *   L1 — in-memory LRU (fast, ephemeral per session)
 *   L2 — OPFS (Origin Private File System) for offline-first anchor data
 *
 * This eliminates redundant searches and accelerates the pipeline.
 */

export interface CacheEntry {
  query: string;
  results: any[];
  ts: number;
  ttlMs: number;
}

// ─── L1: In-memory LRU ──────────────────────────────────────────────

class LRUCache<K, V> {
  private map = new Map<K, V>();
  constructor(private maxSize: number) {}
  get(k: K): V | undefined {
    const v = this.map.get(k);
    if (v !== undefined) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  set(k: K, v: V): void {
    if (this.map.size >= this.maxSize) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
    this.map.set(k, v);
  }
  clear(): void { this.map.clear(); }
  size(): number { return this.map.size; }
}

const l1 = new LRUCache<string, CacheEntry>(256);

function cacheKey(query: string, depth: number, source: string): string {
  return `${source}::${depth}::${query.trim().toLowerCase()}`;
}

export function l1Get(query: string, depth: number, source = "jina"): any[] | null {
  const k = cacheKey(query, depth, source);
  const entry = l1.get(k);
  if (!entry) return null;
  if (Date.now() - entry.ts > entry.ttlMs) return null;
  return entry.results;
}

export function l1Set(query: string, depth: number, results: any[], ttlMs = 300_000, source = "jina"): void {
  const k = cacheKey(query, depth, source);
  l1.set(k, { query, results, ts: Date.now(), ttlMs });
}

export function l1Stats() {
  return { size: l1.size() };
}

// ─── L2: OPFS (Origin Private File System) ──────────────────────────

const OPFS_DIR = "veritas-search-cache";
const OPFS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function getOpfsRoot(): Promise<FileSystemDirectoryHandle | null> {
  try {
    if (!navigator.storage || !navigator.storage.getDirectory) return null;
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(OPFS_DIR, { create: true });
  } catch {
    return null;
  }
}

function opfsFilename(query: string, depth: number, source: string): string {
  const s = cacheKey(query, depth, source);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return `${(h >>> 0).toString(36)}.json`;
}

export async function opfsGet(query: string, depth: number, source = "jina"): Promise<any[] | null> {
  try {
    const dir = await getOpfsRoot();
    if (!dir) return null;
    const name = opfsFilename(query, depth, source);
    const fh = await dir.getFileHandle(name);
    const file = await fh.getFile();
    const text = await file.text();
    const entry: CacheEntry = JSON.parse(text);
    if (Date.now() - entry.ts > OPFS_TTL_MS) return null;
    return entry.results;
  } catch {
    return null;
  }
}

export async function opfsSet(query: string, depth: number, results: any[], source = "jina"): Promise<void> {
  try {
    const dir = await getOpfsRoot();
    if (!dir) return;
    const name = opfsFilename(query, depth, source);
    const fh = await dir.getFileHandle(name, { create: true });
    // @ts-ignore
    const writable = await fh.createWritable();
    const entry: CacheEntry = { query, results, ts: Date.now(), ttlMs: OPFS_TTL_MS };
    await writable.write(JSON.stringify(entry));
    await writable.close();
  } catch { /**/ }
}

// ─── Cache-aware Jina wrapper ────────────────────────────────────────

import { jinaSearch as _jinaSearch } from "./jina";

export async function cachedJinaSearch(
  query: string,
  apiKey: string,
  depth: number,
  opts?: { ttlMs?: number; bypassCache?: boolean }
) {
  if (!opts?.bypassCache) {
    const l1hit = l1Get(query, depth, "jina");
    if (l1hit) return l1hit;
    const l2hit = await opfsGet(query, depth, "jina");
    if (l2hit) {
      l1Set(query, depth, l2hit, opts?.ttlMs, "jina");
      return l2hit;
    }
  }
  const results = await _jinaSearch(query, apiKey, depth);
  l1Set(query, depth, results, opts?.ttlMs, "jina");
  await opfsSet(query, depth, results, "jina");
  return results;
}

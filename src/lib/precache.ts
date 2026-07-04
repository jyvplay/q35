/**
 * Pre-cache system for faster retrieval and computation.
 * Caches common retrievals, computations, and LLM outputs to avoid redundant work.
 */

import { extractConstraints, type ExtractedConstraints } from "./constraints";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // time-to-live in ms
  hits: number;
}

class Cache<T> {
  private store: Map<string, CacheEntry<T>> = new Map();
  private defaultTTL: number;

  constructor(defaultTTL: number = 5 * 60 * 1000) { // 5 minutes default
    this.defaultTTL = defaultTTL;
  }

  // key() removed - using direct string keys instead

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry || this.isExpired(entry)) {
      if (entry) this.store.delete(key);
      return null;
    }
    entry.hits++;
    return entry.data;
  }

  set(key: string, data: T, ttl?: number): void {
    this.store.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTTL,
      hits: 0,
    });
  }

  clear(): void {
    this.store.clear();
  }

  stats(): { size: number; totalHits: number } {
    let totalHits = 0;
    this.store.forEach(entry => totalHits += entry.hits);
    return { size: this.store.size, totalHits };
  }
}

// Global caches
export const constraintCache = new Cache<ExtractedConstraints>(10 * 60 * 1000); // 10 min
export const searchCache = new Cache<any>(5 * 60 * 1000); // 5 min
export const computationCache = new Cache<any>(15 * 60 * 1000); // 15 min
export const llmCache = new Cache<string>(30 * 60 * 1000); // 30 min

// Cached constraint extraction
export function getCachedConstraints(query: string): ExtractedConstraints {
  const cached = constraintCache.get(query);
  if (cached) return cached;
  const constraints = extractConstraints(query);
  constraintCache.set(query, constraints);
  return constraints;
}

// Pre-compute common patterns
const COMMON_PATTERNS = [
  "best stock to buy",
  "NIH grant",
  "heat pump",
  "carbon",
  "climate",
  "investment",
  "research",
  "grant proposal",
  "social welfare",
  "mental health",
  "housing",
  "food insecurity",
  "loneliness",
];

// Pre-warm cache for common queries
export function preWarmCache(): void {
  for (const pattern of COMMON_PATTERNS) {
    const constraints = extractConstraints(pattern);
    constraintCache.set(pattern, constraints, 60 * 60 * 1000); // 1 hour
  }
}

// Pre-computation for common computations
export function preComputeComputations(): void {
  // Pre-compute common financial calculations
  const commonComputations = [
    { id: "rule_of_40", args: { growthPct: 60, marginPct: -15 } },
    { id: "ltv_cac", args: { ltv: 1755, cac: 3000 } },
    { id: "months_runway", args: { cash: 24000000, monthlyBurn: 1500000 } },
  ];
  for (const comp of commonComputations) {
    computationCache.set(comp.id, comp.args, 60 * 60 * 1000);
  }
}

// Initialize pre-warming on module load
if (typeof window !== "undefined") {
  setTimeout(() => {
    preWarmCache();
    preComputeComputations();
  }, 1000);
}

// Cache stats for debugging
export function getCacheStats(): Record<string, { size: number; totalHits: number }> {
  return {
    constraints: constraintCache.stats(),
    search: searchCache.stats(),
    computation: computationCache.stats(),
    llm: llmCache.stats(),
  };
}

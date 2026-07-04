export interface WikidataEntity {
  id: string;
  label: string;
  description: string;
  concepturi: string;
}

export interface AnchorProbeResult {
  entities: WikidataEntity[];
  coverage: number;
  gapNotes: string[];
}

export async function wikidataSearchEntities(query: string, limit = 6, signal?: AbortSignal): Promise<WikidataEntity[]> {
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("search", query);
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Wikidata search ${res.status}`);
  const data = (await res.json()) as { search?: Array<{ id: string; label?: string; description?: string; concepturi?: string }> };
  return (data.search ?? []).map((e) => ({
    id: e.id,
    label: e.label ?? e.id,
    description: e.description ?? "",
    concepturi: e.concepturi ?? `https://www.wikidata.org/wiki/${e.id}`,
  }));
}

export async function anchorProbe(query: string, signal?: AbortSignal): Promise<AnchorProbeResult> {
  const entities = await wikidataSearchEntities(query, 6, signal);
  const words = query.trim().split(/\s+/).filter((w) => w.length > 3);
  const labelText = entities.map((e) => `${e.label} ${e.description}`).join(" ").toLowerCase();
  const overlap = words.filter((w) => labelText.includes(w.toLowerCase())).length;
  const coverage = Math.min(0.9, Math.max(0, entities.length / 8 + overlap / Math.max(8, words.length * 2)));
  const gapNotes: string[] = [];
  if (coverage < 0.35) gapNotes.push("Anchor coverage is low; live web retrieval should stay enabled.");
  if (/latest|recent|today|202\d|current/i.test(query)) gapNotes.push("Temporal or current-events signal detected; anchor needs live freshness check.");
  if (entities.length === 0) gapNotes.push("No Wikidata entities found for the query phrase.");
  return { entities, coverage, gapNotes };
}
/**
 * CORS-safe academic/government API endpoints.
 * These return JSON directly — no proxy needed, no HTML parsing.
 * Each function returns results in the same shape as BrowserScraperSearchResult.
 */

export interface AcademicResult {
  title: string;
  url: string;
  description: string;
  content: string;
}

// ── PubMed (NCBI E-Utils) ────────────────────────────────────────────────
async function searchPubMed(query: string, count: number): Promise<AcademicResult[]> {
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=${count}&term=${encodeURIComponent(query)}`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) return [];
  const searchData = await searchRes.json();
  const ids: string[] = searchData?.esearchresult?.idlist ?? [];
  if (ids.length === 0) return [];
  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`;
  const summaryRes = await fetch(summaryUrl);
  if (!summaryRes.ok) return [];
  const summaryData = await summaryRes.json();
  const results: AcademicResult[] = [];
  for (const id of ids) {
    const doc = summaryData?.result?.[id];
    if (!doc) continue;
    results.push({
      title: doc.title || `PubMed ${id}`,
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      description: `${doc.source || ""} (${doc.pubdate || ""})`,
      content: `${doc.title || ""}. ${doc.source || ""}. ${doc.pubdate || ""}. Authors: ${(doc.authors || []).map((a: any) => a.name).slice(0, 5).join(", ")}. PMID: ${id}`,
    });
  }
  return results;
}

// ── NIH Reporter (funded grants) ─────────────────────────────────────────
async function searchNihReporter(query: string, count: number): Promise<AcademicResult[]> {
  const res = await fetch("https://api.reporter.nih.gov/v2/projects/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      criteria: { advanced_text_search: { operator: "and", search_field: "projecttitle,terms", search_text: query } },
      offset: 0, limit: Math.min(count, 10), sort_field: "project_start_date", sort_order: "desc",
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.results ?? []).map((p: any) => ({
    title: p.project_title || "NIH Project",
    url: `https://reporter.nih.gov/project-details/${p.appl_id}`,
    description: `${p.org_name || ""} | ${p.ic_name || ""} | ${p.fiscal_year || ""}`,
    content: `${p.project_title || ""}. ${p.abstract_text?.slice(0, 600) || "No abstract."}. IC: ${p.ic_name || "N/A"}. Mechanism: ${p.activity_code || "N/A"}. PI: [redacted].`,
  }));
}

// ── Europe PMC ───────────────────────────────────────────────────────────
async function searchEuropePmc(query: string, count: number): Promise<AcademicResult[]> {
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&pageSize=${count}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.resultList?.result ?? []).map((r: any) => ({
    title: r.title || "Europe PMC",
    url: r.doi ? `https://doi.org/${r.doi}` : `https://europepmc.org/article/${r.source}/${r.id}`,
    description: `${r.journalTitle || ""} (${r.pubYear || ""})`,
    content: `${r.title || ""}. ${r.abstractText?.slice(0, 600) || ""}`,
  }));
}

// ── Semantic Scholar ─────────────────────────────────────────────────────
async function searchSemanticScholar(query: string, count: number): Promise<AcademicResult[]> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${count}&fields=title,abstract,url,year`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.data ?? []).map((p: any) => ({
    title: p.title || "Semantic Scholar",
    url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
    description: `Year: ${p.year || "N/A"}`,
    content: `${p.title || ""}. ${p.abstract?.slice(0, 600) || "No abstract available."}`,
  }));
}

// ── OpenAlex ─────────────────────────────────────────────────────────────
async function searchOpenAlex(query: string, count: number): Promise<AcademicResult[]> {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=${count}&select=id,doi,title,abstract_inverted_index,publication_year`;
  const res = await fetch(url, { headers: { "User-Agent": "VeritasChat/1.0 (mailto:contact@example.com)" } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.results ?? []).map((w: any) => {
    let abstract = "";
    if (w.abstract_inverted_index) {
      const pairs: [string, number[]][] = Object.entries(w.abstract_inverted_index);
      const words: string[] = [];
      for (const [word, positions] of pairs) for (const pos of positions as number[]) words[pos] = word;
      abstract = words.filter(Boolean).join(" ").slice(0, 600);
    }
    return {
      title: w.title || "OpenAlex",
      url: w.doi ? `https://doi.org/${w.doi.replace("https://doi.org/", "")}` : w.id,
      description: `Year: ${w.publication_year || "N/A"}`,
      content: `${w.title || ""}. ${abstract}`,
    };
  });
}

// ── arXiv (CORS-safe XML) ────────────────────────────────────────────────
async function searchArxiv(query: string, count: number): Promise<AcademicResult[]> {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${count}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const xml = await res.text();
  const entries = xml.split(/<entry>/).slice(1);
  return entries.map((e) => {
    const title = (e.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "arXiv").replace(/\s+/g, " ").trim();
    const id = e.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() || "";
    const summary = (e.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || "").replace(/\s+/g, " ").trim();
    return { title, url: id, description: summary.slice(0, 200), content: `${title}. ${summary.slice(0, 600)}` };
  });
}

// ── CrossRef ─────────────────────────────────────────────────────────────
async function searchCrossRef(query: string, count: number): Promise<AcademicResult[]> {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${count}&select=DOI,title,abstract,published-print`;
  const res = await fetch(url, { headers: { "User-Agent": "VeritasChat/1.0 (mailto:contact@example.com)" } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.message?.items ?? []).map((w: any) => ({
    title: (w.title || ["CrossRef"])[0],
    url: `https://doi.org/${w.DOI}`,
    description: `DOI: ${w.DOI}`,
    content: `${(w.title || [""])[0]}. ${(w.abstract || "").replace(/<[^>]+>/g, " ").slice(0, 600)}`,
  }));
}

// ── Aggregator: run all CORS-safe APIs in parallel ───────────────────────

/** Strip conversational filler so academic APIs don't match "please", "find me", etc. */
function normalizeAcademicQuery(query: string): string {
  let q = query
    .replace(/^\s*(please|can you|could you|would you|i need you to|help me|find me|please find me|give me|show me)\b/gi, "")
    .replace(/\b(please|thanks|thank you|for me|the most likely|that is)\b/gi, "")
    .replace(/["“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Keep only the substantive nouns/keywords for API search (drop stopword-only fragments).
  if (q.length < 8) q = query;
  return q;
}

export async function searchAcademicSources(
  query: string,
  opts?: { count?: number; onDebug?: (msg: string) => void },
): Promise<AcademicResult[]> {
  const count = opts?.count ?? 5;
  const t0 = Date.now();
  const original = query;
  query = normalizeAcademicQuery(query);
  if (query !== original) opts?.onDebug?.(`[Academic] normalized query: "${original.slice(0, 60)}" → "${query.slice(0, 60)}"`);
  const results = await Promise.allSettled([
    searchPubMed(query, count),
    searchNihReporter(query, count),
    searchEuropePmc(query, count),
    searchSemanticScholar(query, count),
    searchOpenAlex(query, count),
    searchCrossRef(query, count),
    searchArxiv(query, count),
  ]);
  const all: AcademicResult[] = [];
  const names = ["PubMed", "NIH-Reporter", "EuropePMC", "SemanticScholar", "OpenAlex", "CrossRef", "arXiv"];
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.length > 0) {
      opts?.onDebug?.(`[Academic] ${names[i]}: ${r.value.length} results`);
      all.push(...r.value);
    } else {
      opts?.onDebug?.(`[Academic] ${names[i]}: ${r.status === "rejected" ? (r.reason as Error)?.message?.slice(0, 60) : "0 results"}`);
    }
  });
  // Dedup by URL
  const seen = new Set<string>();
  const deduped = all.filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; });
  opts?.onDebug?.(`[Academic] Total: ${deduped.length} unique results in ${Date.now() - t0}ms`);
  return deduped;
}

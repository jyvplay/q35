import type { ReactNode } from "react";

/** Lightweight safe Markdown-ish renderer for assistant prose.
 * Supports bold, headings, bullets, numbered lists, and simple pipe tables.
 * This avoids showing raw markdown as plain text while keeping implementation
 * dependency-free and safe (no HTML injection).
 */
export function MarkdownLite({ text, user = false }: { text: string; user?: boolean }) {
  if (user) return <div className="whitespace-pre-wrap text-sm leading-relaxed text-white">{text}</div>;
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\|.*\|$/.test(line) && i + 1 < lines.length && /^\|\s*:?-+/.test(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i])) rows.push(splitRow(lines[i++]));
      blocks.push(<Table key={blocks.length} header={header} rows={rows} />);
      continue;
    }
    if (/^#{1,4}\s+/.test(line)) {
      const level = line.match(/^#+/)![0].length;
      const content = line.replace(/^#{1,4}\s+/, "");
      blocks.push(<Heading key={blocks.length} level={level} text={content} />);
      i++; continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      blocks.push(<ul key={blocks.length} className="my-2 list-disc space-y-1 pl-5 text-sm text-zinc-900">{items.map((x, j) => <li key={j}>{inline(x)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ""));
      blocks.push(<ol key={blocks.length} className="my-2 list-decimal space-y-1 pl-5 text-sm text-zinc-900">{items.map((x, j) => <li key={j}>{inline(x)}</li>)}</ol>);
      continue;
    }
    const paras: string[] = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^\|.*\|$/.test(lines[i]) && !/^#{1,4}\s+/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) paras.push(lines[i++]);
    blocks.push(<p key={blocks.length} className="my-2 text-sm leading-relaxed text-zinc-900">{inline(paras.join(" "))}</p>);
  }
  return <div className="space-y-1">{blocks}</div>;
}

function inline(s: string): ReactNode[] {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p);
}

function Heading({ level, text }: { level: number; text: string }) {
  const cls = level <= 2 ? "mt-3 text-base font-bold text-zinc-950" : "mt-3 text-sm font-bold text-zinc-900";
  return <div className={cls}>{inline(text)}</div>;
}

function splitRow(s: string): string[] { return s.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(x => x.trim()); }

function Table({ header, rows }: { header: string[]; rows: string[][] }) {
  return <div className="my-3 overflow-x-auto rounded-xl border border-zinc-200"><table className="w-full text-sm"><thead className="bg-zinc-50"><tr>{header.map((h, i) => <th key={i} className="px-3 py-2 text-left font-bold text-zinc-700">{inline(h)}</th>)}</tr></thead><tbody className="divide-y divide-zinc-100">{rows.map((r, i) => <tr key={i}>{header.map((_, j) => <td key={j} className="px-3 py-2 text-zinc-900">{inline(r[j] ?? "")}</td>)}</tr>)}</tbody></table></div>;
}
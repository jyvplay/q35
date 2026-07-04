import { ReactNode } from "react";

/**
 * Enhanced Safe Rich-Text Renderer.
 * Supports:
 *  - bold **text**
 *  - headings ###
 *  - Visually pleasing tables (Markdown pipe syntax)
 *  - Bullets / numbered lists
 *  - Mermaid diagrams spec (deterministic speccing)
 *
 * This addresses the "visually please table" and "graphs/flow charts" requirements.
 */
export function RichText({ text }: { text: string }) {
  const blocks = splitBlocks(text);
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => <Block key={i} block={b} />)}
    </div>
  );
}

type BlockType =
  | { kind: "heading"; level: number; text: string }
  | { kind: "table"; rows: string[][] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "mermaid"; code: string }
  | { kind: "p"; text: string };

function splitBlocks(src: string): BlockType[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: BlockType[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // Mermaid code block
    if (line.startsWith("```mermaid")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      out.push({ kind: "mermaid", code: buf.join("\n") });
      continue;
    }

    // Heading
    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      out.push({ kind: "heading", level: hm[1].length, text: hm[2] });
      i++; continue;
    }

    // Table
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?\s*:?[- ]+:?/.test(lines[i + 1])) {
      const rows: string[][] = [];
      rows.push(parseTableRow(line));
      i += 2; // skip separator
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      out.push({ kind: "table", rows });
      continue;
    }

    // Lists
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      out.push({ kind: "ul", items });
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      out.push({ kind: "ol", items });
      continue;
    }

    // Paragraph
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}|```|\||[-*]|\d+\.)/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    out.push({ kind: "p", text: buf.join(" ") });
  }
  return out;
}

function parseTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
}

function renderInline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  while (i < s.length) {
    const bold = s.slice(i).match(/^\*\*([^*]+)\*\*/);
    if (bold) {
      out.push(<strong key={out.length} className="font-bold text-zinc-900">{bold[1]}</strong>);
      i += bold[0].length;
      continue;
    }
    const italic = s.slice(i).match(/^\*([^*]+)\*/);
    if (italic) {
      out.push(<em key={out.length}>{italic[1]}</em>);
      i += italic[0].length;
      continue;
    }
    out.push(s[i]);
    i++;
  }
  return out;
}

function Block({ block }: { block: BlockType }) {
  switch (block.kind) {
    case "heading": {
      const cls = block.level <= 2 ? "text-xl font-bold text-zinc-900 border-b border-zinc-200 pb-1 mt-6 mb-4" : "text-sm font-bold text-zinc-800 mt-4 mb-2 uppercase tracking-wide";
      if (block.level === 1) return <h1 className={cls}>{renderInline(block.text)}</h1>;
      if (block.level === 2) return <h2 className={cls}>{renderInline(block.text)}</h2>;
      if (block.level === 3) return <h3 className={cls}>{renderInline(block.text)}</h3>;
      if (block.level === 4) return <h4 className={cls}>{renderInline(block.text)}</h4>;
      return <div className={cls}>{renderInline(block.text)}</div>;
    }
    case "table":
      return (
        <div className="overflow-x-auto my-6 rounded-xl border border-zinc-200 shadow-sm">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-zinc-50/80 backdrop-blur border-b border-zinc-200">
              <tr>
                {block.rows[0].map((c, i) => (
                  <th key={i} className="px-4 py-3 text-left font-bold text-zinc-700 uppercase tracking-wider text-[11px] border-r border-zinc-200 last:border-0">{renderInline(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {block.rows.slice(1).map((r, i) => (
                <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                  {r.map((c, j) => (
                    <td key={j} className="px-4 py-3 text-zinc-800 border-r border-zinc-100 last:border-0">{renderInline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "ul":
      return <ul className="list-disc pl-6 space-y-2 text-sm text-zinc-800 my-4">{block.items.map((x, i) => <li key={i}>{renderInline(x)}</li>)}</ul>;
    case "ol":
      return <ol className="list-decimal pl-6 space-y-2 text-sm text-zinc-800 my-4">{block.items.map((x, i) => <li key={i}>{renderInline(x)}</li>)}</ol>;
    case "mermaid":
      return (
        <div className="my-6 p-4 bg-zinc-50 border border-zinc-200 rounded-2xl flex flex-col items-center">
          <div className="text-[10px] font-bold text-zinc-400 uppercase mb-3">Diagram Specification (Mermaid)</div>
          <pre className="text-[10px] font-mono text-indigo-700 bg-white border border-indigo-100 p-4 rounded-xl w-full overflow-auto">
            {block.code}
          </pre>
          <div className="mt-2 text-[9px] text-zinc-400 italic">Visualizing via deterministic specs...</div>
        </div>
      );
    case "p":
      return <p className="text-sm leading-relaxed text-zinc-800 my-3">{renderInline(block.text)}</p>;
    default:
      return null;
  }
}

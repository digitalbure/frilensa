import type { ReactNode } from 'react';

// Small renderer for the assistant's replies: headings, bullet and numbered lists, tables,
// **bold** and `code`. Text is rendered as React text nodes, never as HTML.

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index} className="font-extrabold text-slate-950">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={index} className="font-mono text-[10.5px] bg-slate-100 rounded px-1">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

const BULLET = /^[*-]\s+(.*)/;
const NUMBERED = /^(\d+)[.)]\s+(.*)/;
const TABLE_ROW = /^\|.*\|$/;
const TABLE_RULE = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;
const cells = (row: string) => row.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

export default function MarkdownText({ text }: { text: string }) {
  const lines = (text || '').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const key = `b${i}`;
    const heading = line.match(/^(#{1,4})\s*(.*)/);
    if (heading) {
      const level = heading[1].length;
      const cls = level === 1 ? 'text-base mt-4 mb-2' : level === 2 ? 'text-sm mt-3.5 mb-1.5' : level === 3 ? 'text-xs mt-2.5 mb-1' : 'text-[11px] mt-2 mb-1';
      out.push(<p key={key} className={`${cls} font-black text-slate-900 tracking-tight`}>{inline(heading[2])}</p>);
      i++;
      continue;
    }
    if (BULLET.test(line) || NUMBERED.test(line)) {
      const numbered = NUMBERED.test(line);
      const items: string[] = [];
      while (i < lines.length && (numbered ? NUMBERED : BULLET).test(lines[i].trim())) {
        const m = lines[i].trim().match(numbered ? NUMBERED : BULLET)!;
        items.push(numbered ? m[2] : m[1]);
        i++;
      }
      const start = numbered ? Number(line.match(NUMBERED)![1]) : undefined;
      const children = items.map((it, n) => <li key={n}>{inline(it)}</li>);
      out.push(numbered
        ? <ol key={key} start={start} className="list-decimal pl-5 text-[11px] text-slate-700 my-1 leading-relaxed space-y-0.5">{children}</ol>
        : <ul key={key} className="list-disc pl-5 text-[11px] text-slate-700 my-1 leading-relaxed space-y-0.5">{children}</ul>);
      continue;
    }
    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1].trim())) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW.test(lines[i].trim())) rows.push(cells(lines[i++].trim()));
      out.push(
        <div key={key} className="overflow-x-auto my-1.5">
          <table className="text-[11px] text-slate-700 border-collapse">
            <thead><tr>{head.map((h, n) => <th key={n} className="text-left font-bold text-slate-900 border-b border-slate-200 px-2 py-1">{inline(h)}</th>)}</tr></thead>
            <tbody>{rows.map((r, rn) => <tr key={rn}>{r.map((c, n) => <td key={n} className="border-b border-slate-100 px-2 py-1 align-top">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }
    if (line === '') out.push(<div key={key} className="h-1.5" />);
    else out.push(<p key={key} className="text-[11px] text-slate-700 leading-relaxed my-1">{inline(lines[i])}</p>);
    i++;
  }
  return <>{out}</>;
}

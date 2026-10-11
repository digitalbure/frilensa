import type { ReactNode } from 'react';

// Small renderer for the AI advisor's replies: headings, bullet and numbered lists, **bold**.
// Text is rendered as React text nodes, never as HTML.

function parseBoldText(text: string): ReactNode[] {
  return text.split(/(\*\*.*?\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index} className="font-extrabold text-slate-950">{part.slice(2, -2)}</strong>
      : part
  );
}

export default function MarkdownText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        const cleanLine = line.trim();
        if (cleanLine.startsWith('####')) {
          return <h4 key={i} className="text-[11px] font-black text-slate-800 mt-2 mb-1 tracking-tight">{cleanLine.replace('####', '').trim()}</h4>;
        }
        if (cleanLine.startsWith('###')) {
          return <h3 key={i} className="text-xs font-black text-slate-900 mt-2.5 mb-1 tracking-tight">{cleanLine.replace('###', '').trim()}</h3>;
        }
        if (cleanLine.startsWith('##')) {
          return <h2 key={i} className="text-sm font-black text-slate-900 mt-3.5 mb-1.5 tracking-tight">{cleanLine.replace('##', '').trim()}</h2>;
        }
        if (cleanLine.startsWith('#')) {
          return <h1 key={i} className="text-base font-black text-slate-900 mt-4 mb-2 tracking-tight">{cleanLine.replace('#', '').trim()}</h1>;
        }
        if (cleanLine.startsWith('* ') || cleanLine.startsWith('- ')) {
          return (
            <ul key={i} className="list-disc list-inside text-[11px] text-slate-700 pl-2 my-0.5 leading-relaxed">
              <li>{parseBoldText(cleanLine.substring(2))}</li>
            </ul>
          );
        }
        const numMatch = cleanLine.match(/^\d+\.\s(.*)/);
        if (numMatch) {
          return (
            <ol key={i} className="list-decimal list-inside text-[11px] text-slate-700 pl-2 my-0.5 leading-relaxed">
              <li>{parseBoldText(numMatch[1])}</li>
            </ol>
          );
        }
        if (cleanLine === '') return <div key={i} className="h-1.5" />;
        return <p key={i} className="text-[11px] text-slate-700 leading-relaxed my-1">{parseBoldText(line)}</p>;
      })}
    </>
  );
}

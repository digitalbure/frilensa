import { useMemo, useState } from 'react';
import { LifeBuoy, Search, ChevronDown, ChevronUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { HELP_ARTICLES, type HelpArticle } from '../help/articles';
import { useBranding } from '../lib/branding';

// Settings → Help: the in-app help articles (src/help/articles.ts), with search.
// The articles are Markdown (### headings, paragraphs, "- " and "1. " lists, **bold**). Like the
// other Markdown in the app, it's rendered as React text nodes, never as HTML.

interface Block { kind: 'h3' | 'h4' | 'p' | 'ul' | 'ol'; text: string; items: string[] }

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'p', text: paragraph.join(' '), items: [] });
    paragraph = [];
  };
  const pushItem = (kind: 'ul' | 'ol', text: string) => {
    const last = blocks[blocks.length - 1];
    if (last && last.kind === kind) last.items.push(text);
    else blocks.push({ kind, text: '', items: [text] });
  };
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    const numbered = line.match(/^\d+\.\s+(.*)/);
    if (!line) flush();
    else if (line.startsWith('#### ')) { flush(); blocks.push({ kind: 'h4', text: line.slice(5), items: [] }); }
    else if (line.startsWith('### ')) { flush(); blocks.push({ kind: 'h3', text: line.slice(4), items: [] }); }
    else if (line.startsWith('- ') || line.startsWith('* ')) { flush(); pushItem('ul', line.slice(2)); }
    else if (numbered) { flush(); pushItem('ol', numbered[1]); }
    else paragraph.push(line);
  }
  flush();
  return blocks;
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={i} className="font-semibold text-zinc-900">{part.slice(2, -2)}</strong>
      : part
  );
}

function renderBody(markdown: string): ReactNode[] {
  return parseBlocks(markdown).map((b, i) => {
    if (b.kind === 'ul') return <ul key={i} className="list-disc pl-4 space-y-1">{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>;
    if (b.kind === 'ol') return <ol key={i} className="list-decimal pl-4 space-y-1">{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ol>;
    if (b.kind === 'h3') return <h4 key={i} className="text-[11.5px] font-bold text-zinc-900 pt-1.5">{inline(b.text)}</h4>;
    if (b.kind === 'h4') return <h5 key={i} className="text-[11px] font-semibold text-zinc-800 pt-1">{inline(b.text)}</h5>;
    return <p key={i}>{inline(b.text)}</p>;
  });
}

const searchText = (a: HelpArticle) =>
  [a.title, a.summary, a.keywords.join(' '), a.body].join(' ').replace(/\*\*/g, '').toLowerCase();

export default function HelpCenter() {
  const brand = useBranding();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const index = useMemo(() => HELP_ARTICLES.map(a => ({ article: a, text: searchText(a) })), []);

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = terms.length
    ? index.filter(({ text }) => terms.every(t => text.includes(t))).map(r => r.article)
    : HELP_ARTICLES;

  return (
    <div className="bg-white rounded-xl p-5 border border-zinc-100 shadow-xs space-y-3.5 text-xs text-zinc-600">
      <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
        <div className="flex items-center gap-1.5 text-indigo-600">
          <LifeBuoy className="w-4 h-4" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-700">Help</span>
        </div>
        <span className="text-[10px] text-zinc-400">{HELP_ARTICLES.length} articles</span>
      </div>

      <p className="text-[11px] text-zinc-500">
        How to use Frilensa. You can also ask the assistant on the Assistant tab, which uses these articles.
      </p>

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="search"
          value={query}
          onChange={(e: any) => setQuery(e.target.value)}
          placeholder="Search help, e.g. receipt, VAT return, portal PIN"
          aria-label="Search help articles"
          className="w-full bg-zinc-50 border border-zinc-200 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-800 focus:outline-none focus:border-zinc-400 focus:bg-white"
        />
      </div>

      {results.length === 0 ? (
        <p className="text-[11px] text-zinc-500 py-2">No articles match "{query.trim()}". Try another word, or ask the assistant.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 border border-zinc-100 rounded-xl overflow-hidden">
          {results.map(a => {
            const open = openId === a.id;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : a.id)}
                  aria-expanded={open}
                  className={`w-full text-left px-3.5 py-2.5 flex items-start justify-between gap-3 cursor-pointer transition-colors ${open ? 'bg-zinc-50' : 'hover:bg-zinc-50'}`}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-zinc-900">{a.title}</span>
                    <span className="block text-[11px] text-zinc-500 mt-0.5">{a.summary}</span>
                  </span>
                  {open
                    ? <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                    : <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />}
                </button>
                {open && (
                  <div className="px-3.5 pb-3.5 pt-1 bg-zinc-50 space-y-2 text-[11.5px] leading-relaxed text-zinc-700">
                    {renderBody(a.body)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {(brand.supportEmail || brand.supportPhone) && (
        <p className="pt-2 border-t border-zinc-100 text-[11px] text-zinc-500">
          Still stuck? Contact {brand.name} support:{' '}
          {brand.supportEmail && <a href={`mailto:${brand.supportEmail}`} className="text-indigo-600 font-semibold">{brand.supportEmail}</a>}
          {brand.supportEmail && brand.supportPhone && ' · '}
          {brand.supportPhone && <a href={`tel:${brand.supportPhone.replace(/\s/g, '')}`} className="text-indigo-600 font-semibold">{brand.supportPhone}</a>}
        </p>
      )}
    </div>
  );
}

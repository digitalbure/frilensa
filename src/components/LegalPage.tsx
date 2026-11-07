import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import BrandMark from './BrandMark';
import MarkdownText from './MarkdownText';
import { useBranding } from '../lib/branding';
import { LEGAL_UPDATED, privacyPolicy, termsOfUse } from '../legal/legalText';

/** /privacy and /terms: readable without signing in. */
export default function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const brand = useBranding();
  const title = kind === 'privacy' ? 'Privacy policy' : 'Terms of use';
  const contact = brand.supportEmail || 'the email address on our website';
  useEffect(() => { document.title = `${title} · ${brand.name}`; }, [title, brand.name]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <a href="/" className="flex items-center gap-2 text-slate-900 font-black"><BrandMark size={30} /> {brand.name}</a>
          <a href="/" className="text-xs font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Back to {brand.name}</a>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8">
        <article className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-8 text-sm text-slate-700 leading-relaxed">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h1>
          <p className="text-xs text-slate-500 mt-1 mb-4">Last updated {LEGAL_UPDATED}</p>
          <MarkdownText text={kind === 'privacy' ? privacyPolicy(brand.name, contact) : termsOfUse(brand.name, contact)} />
        </article>
        <p className="text-xs text-slate-500 text-center mt-4">
          <a href="/privacy" className="underline">Privacy policy</a> · <a href="/terms" className="underline">Terms of use</a>
        </p>
      </main>
    </div>
  );
}

/** Small "Privacy · Terms" links for footers. */
export function LegalLinks({ className = 'text-[11px] text-slate-400' }: { className?: string }) {
  return (
    <span className={className}>
      <a href="/privacy" target="_blank" rel="noopener" className="underline hover:text-slate-600">Privacy</a>
      {' · '}
      <a href="/terms" target="_blank" rel="noopener" className="underline hover:text-slate-600">Terms</a>
    </span>
  );
}

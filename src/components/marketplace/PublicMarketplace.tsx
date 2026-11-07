import React, { useEffect } from 'react';
import BrandMark from '../BrandMark';
import { useBranding } from '../../lib/branding';
import { LegalLinks } from '../LegalPage';
import MarketplaceView from './MarketplaceView';

/** frilensa.com/marketplace for visitors: browse everything; sign in to request or list. */
export default function PublicMarketplace({ onSignIn }: { onSignIn: () => void }) {
  const brand = useBranding();
  useEffect(() => { document.title = `Marketplace · ${brand.name}`; }, [brand.name]);
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <a href="/" className="flex items-center gap-2 text-slate-900 font-black"><BrandMark size={30} /> {brand.name} <span className="text-slate-400 font-semibold">Marketplace</span></a>
          <button type="button" onClick={onSignIn} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer">Sign in to list or request</button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Rent, buy and hire in Fiji</h1>
          <p className="text-sm text-slate-600 mt-1">Cameras, sound, tools and more from people near you, and services from local freelancers and businesses.</p>
        </div>
        <MarketplaceView signedIn={false} onSignIn={onSignIn} />
        <footer className="pt-6 text-center"><LegalLinks /></footer>
      </main>
    </div>
  );
}

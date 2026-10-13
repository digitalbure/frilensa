import React, { useState } from 'react';
import { CRMData } from '../types';
import ServicesView from './ServicesView';
import RateCardSettings from './RateCardSettings';
import BookingSettingsCard from './BookingSettingsCard';
import RateRulesCard from './RateRulesCard';

type Section = 'catalogue' | 'ratecard' | 'bookings' | 'rules';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'catalogue', label: 'Services' },
  { id: 'ratecard', label: 'Rate card & terms' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'rules', label: 'Rate rules' }
];

/** The Services tab: what the active business sells and how people can buy it. */
export default function CatalogueView({ data, onUpdateData }: { data: CRMData; onUpdateData: (d: CRMData) => void }) {
  const [section, setSection] = useState<Section>('catalogue');
  return (
    <div className="space-y-4">
      <div className="flex bg-zinc-100 p-0.5 rounded-xl border border-zinc-200 overflow-x-auto" role="tablist">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            onClick={() => setSection(s.id)}
            className={`flex-1 whitespace-nowrap px-2 py-2 text-[10px] sm:text-xs font-extrabold tracking-tight rounded-lg transition-all cursor-pointer ${
              section === s.id ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/40' : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {section === 'catalogue' && <ServicesView data={data} onUpdateData={onUpdateData} />}
      {section === 'ratecard' && <RateCardSettings data={data} onUpdateData={onUpdateData} />}
      {section === 'bookings' && <BookingSettingsCard data={data} onUpdateData={onUpdateData} />}
      {section === 'rules' && <RateRulesCard data={data} onUpdateData={onUpdateData} />}
    </div>
  );
}

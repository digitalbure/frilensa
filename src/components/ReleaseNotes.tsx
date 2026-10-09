import React, { useMemo, useState } from 'react';
import { Code } from 'lucide-react';
import changelog from '../../CHANGELOG.md?raw';
import { parseChangelog } from '../lib/changelog';

export default function ReleaseNotes() {
  const [open, setOpen] = useState(false);
  const releases = useMemo(() => parseChangelog(changelog), []);

  return (
    <div className="bg-white rounded-xl p-5 border border-zinc-100 shadow-xs space-y-3.5 text-xs text-zinc-600">
      <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
        <div className="flex items-center gap-1.5 text-indigo-600">
          <Code className="w-4 h-4" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-700">App Version & Release Notes</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-emerald-50 text-emerald-700 text-[9px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-100 font-mono">
            v{__APP_VERSION__} (Build {__BUILD_DATE__})
          </span>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="text-[10px] text-emerald-600 hover:text-emerald-800 font-bold underline cursor-pointer"
          >
            {open ? 'Hide Notes' : 'View Changelog'}
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-3 bg-zinc-50 p-3.5 rounded-xl border border-zinc-200/70 text-[10.5px] max-h-[28rem] overflow-y-auto">
          {releases.map((r, i) => (
            <div key={r.version} className="space-y-1">
              <div className="flex items-center justify-between">
                <strong className={i === 0 ? 'text-zinc-900 font-bold' : 'text-zinc-800 font-semibold'}>Version {r.version}</strong>
                <span className="text-[9px] text-zinc-400 font-mono">{r.date}</span>
              </div>
              {r.sections.map(section => (
                <div key={section.heading}>
                  <span className="text-[9px] uppercase tracking-wider text-zinc-400 font-bold">{section.heading}</span>
                  <ul className="list-disc pl-4 space-y-0.5 text-zinc-500">
                    {section.items.map((item, j) => <li key={j}>{item}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

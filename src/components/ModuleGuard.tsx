import React from 'react';
import { PowerOff } from 'lucide-react';
import { usePlatformConfig } from '../lib/platformConfig';
import { MODULE_INFO, type ModuleId, type ModuleSettings } from '../lib/modules';

/** The module switches super admins set for everyone (Admin → Modules), plus the directory switch. */
export function useModules(): ModuleSettings & { directory: { enabled: boolean } } {
  const { config } = usePlatformConfig();
  return { ...config.modules, directory: { enabled: config.directory.enabled } };
}

/** Shows its children only while a module is switched on; otherwise a short note saying it's off. */
export default function ModuleGuard({ id, children, quiet = false }: { id: ModuleId; children: React.ReactNode; quiet?: boolean }) {
  const modules = useModules();
  if (modules[id]?.enabled) return <>{children}</>;
  if (quiet) return null;
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 text-xs text-zinc-600 flex items-start gap-2">
      <PowerOff className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
      <span><strong className="text-zinc-800">{MODULE_INFO[id].name}</strong> is switched off by Frilensa right now. Your settings and records are kept.</span>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { CalendarClock, AlertTriangle, Play } from 'lucide-react';
import type { AutomationSettings, CRMData } from '../types';
import { fetchAutomationStatus, runAutomationNow, type AutomationRun, type AutomationStatus } from '../lib/api';
import { planReminders, REMINDER_STAGES } from '../lib/reminders';
import { todayIn } from '../lib/retainers';

interface Props {
  data: CRMData;
  onUpdateData: (data: CRMData) => void;
  onManualCloudSync?: () => Promise<void>;
}

function describeRun(run: AutomationRun) {
  const when = new Date(run.ranAt).toLocaleString('en-FJ', { timeZone: 'Pacific/Fiji', dateStyle: 'medium', timeStyle: 'short' });
  const invoices = run.invoicesCreated.length;
  const emailed = run.invoicesCreated.filter(i => i.emailedTo).length;
  const parts = [
    invoices === 0 ? 'no retainer invoices due' : `${invoices} retainer invoice${invoices === 1 ? '' : 's'} created${emailed ? ` (${emailed} emailed)` : ''}`,
    `${run.remindersSent.length} reminder${run.remindersSent.length === 1 ? '' : 's'} sent`
  ];
  return `${run.trigger === 'manual' ? 'Run manually' : 'Daily run'} ${when}: ${parts.join(', ')}.`;
}

/** Settings card for the daily server job: retainer invoices and overdue reminders. */
export default function AutomationSettingsCard({ data, onUpdateData, onManualCloudSync }: Props) {
  const settings: AutomationSettings = data.userProfile.automation || {};
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchAutomationStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const update = (patch: Partial<AutomationSettings>) =>
    onUpdateData({ ...data, userProfile: { ...data.userProfile, automation: { ...settings, ...patch } } });

  const autoRetainers = (data.recurringInvoices || []).filter(r => r.status === 'active' && r.autoGenerate).length;
  const remindersDueToday = planReminders(data, todayIn()).length;
  const wantsEmail = Boolean(settings.emailRetainerInvoices || settings.overdueReminders);

  const handleRunNow = async () => {
    setRunning(true);
    setMessage(null);
    try {
      // Make sure the server sees the latest settings and documents first.
      await onManualCloudSync?.();
      const run = await runAutomationNow();
      setStatus(s => (s ? { ...s, lastRun: run } : s));
      setMessage(describeRun(run));
    } catch (err: any) {
      setMessage(err?.message || 'The run could not be started.');
    } finally {
      setRunning(false);
    }
  };

  const toggle = (label: string, description: string, checked: boolean, onChange: (v: boolean) => void, disabled = false) => (
    <label className={`flex items-start justify-between gap-3 py-2 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span>
        <span className="block text-[11px] font-semibold text-zinc-800">{label}</span>
        <span className="block text-[10px] text-zinc-500">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 rounded border-zinc-300 text-sky-600 focus:ring-sky-500 shrink-0"
      />
    </label>
  );

  return (
    <div className="p-3.5 rounded-xl border border-zinc-200/90 bg-zinc-50/70 space-y-1">
      <div className="flex items-start gap-2">
        <div className="w-7 h-7 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0">
          <CalendarClock className="w-3.5 h-3.5" />
        </div>
        <div>
          <span className="block text-[11px] font-bold text-zinc-900">Automatic invoices and reminders</span>
          <span className="block text-[10px] leading-snug text-zinc-500">
            Runs every morning (Fiji time). Retainers set to "auto-generate" get their invoice on the due date
            {autoRetainers > 0 ? ` (${autoRetainers} set up)` : ''}, even when Frilensa isn't open.
          </span>
        </div>
      </div>

      <div className="divide-y divide-zinc-200/80">
        {toggle(
          'Email retainer invoices to clients',
          'When the daily run creates a retainer invoice marked "sent", email it to the client with its online link.',
          Boolean(settings.emailRetainerInvoices),
          v => update({ emailRetainerInvoices: v })
        )}
        {toggle(
          'Send overdue reminders',
          `Email clients about unpaid invoices ${REMINDER_STAGES.map(s => s.daysOverdue).join(', ')} days after the due date (friendly, then firm, then final). Skips invoices the client has reported paying.${settings.overdueReminders ? '' : remindersDueToday ? ` ${remindersDueToday} invoice${remindersDueToday === 1 ? '' : 's'} would get one today.` : ''}`,
          Boolean(settings.overdueReminders),
          v => update({ overdueReminders: v })
        )}
        {toggle(
          'Copy me on reminders',
          `Send a copy of each reminder to ${data.userProfile.email || 'my account email'}.`,
          Boolean(settings.ccMeOnReminders),
          v => update({ ccMeOnReminders: v }),
          !settings.overdueReminders
        )}
      </div>

      {status && wantsEmail && !status.emailConfigured && (
        <p className="flex items-start gap-1.5 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Email delivery isn't set up on the server yet (SendGrid), so invoices will be created but nothing will be emailed.
        </p>
      )}
      {status && !status.scheduleConfigured && (
        <p className="flex items-start gap-1.5 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          The daily schedule isn't switched on for this server yet. "Run now" still works.
        </p>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <span className="text-[10px] text-zinc-500">
          {message || (status?.lastRun ? describeRun(status.lastRun) : 'No runs yet.')}
          {!message && status?.lastRun?.problems?.length ? ` ${status.lastRun.problems.join(' ')}` : ''}
        </span>
        <button
          type="button"
          onClick={handleRunNow}
          disabled={running}
          className="shrink-0 flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-60 cursor-pointer"
        >
          <Play className="w-3 h-3" /> {running ? 'Running…' : 'Run now'}
        </button>
      </div>
    </div>
  );
}

import React from 'react';
import {
  X,
  RotateCcw,
  History,
  Check,
  Calendar,
  AlertCircle,
  Trash2,
  ArrowRight
} from 'lucide-react';
import { Transaction } from '../types';
import {
  LedgerRestorePoint,
  getLedgerRestorePoints,
  rollbackLedgerState,
  clearLedgerRestorePoints
} from '../lib/ledgerHistory';

interface LedgerHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  currentTransactions: Transaction[];
  onRollback: (restoredTransactions: Transaction[], restoredPoint: LedgerRestorePoint) => void;
}

export const LedgerHistoryModal: React.FC<LedgerHistoryModalProps> = ({
  isOpen,
  onClose,
  userEmail,
  currentTransactions,
  onRollback
}) => {
  const [points, setPoints] = React.useState<LedgerRestorePoint[]>([]);

  React.useEffect(() => {
    if (isOpen) {
      setPoints(getLedgerRestorePoints(userEmail));
    }
  }, [isOpen, userEmail]);

  if (!isOpen) return null;

  const handleRestore = (point: LedgerRestorePoint) => {
    const confirmMessage = `Rollback ledger to state: "${point.actionTitle}" (${point.displayTime})?\n\nThis will restore your ledger to ${point.transactions.length} transactions. A backup of your current state will be saved automatically before rolling back.`;
    if (window.confirm(confirmMessage)) {
      const result = rollbackLedgerState(userEmail, point.id, currentTransactions);
      if (result) {
        onRollback(result.restoredTransactions, result.restoredPoint);
        onClose();
      }
    }
  };

  const handleClearHistory = () => {
    if (window.confirm('Clear all ledger rollback history points?')) {
      clearLedgerRestorePoints(userEmail);
      setPoints([]);
    }
  };

  return (
    <div className="fixed inset-0 bg-zinc-950/65 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 z-50 animate-fade-in">
      <div className="bg-white w-full max-w-2xl max-h-[85vh] rounded-2xl border border-zinc-200 shadow-2xl overflow-hidden flex flex-col text-zinc-800">
        
        {/* Header */}
        <div className="bg-zinc-900 text-white px-5 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <History className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight">Ledger History & Rollback Points</h3>
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-semibold px-2 py-0.5 rounded-full border border-indigo-500/30">
                  {points.length} Snapshots
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Recover prior ledger versions before imports, batch reconciliations, or accidental edits
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {points.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="w-12 h-12 bg-zinc-100 text-zinc-400 rounded-full flex items-center justify-center mx-auto">
                <History className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-zinc-900">No Restore Points Yet</h4>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Restore points are automatically captured whenever you import bank statements, approve review batches, or clean duplicates.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-xs text-zinc-500 pb-1 border-b border-zinc-150">
                <span>Select a restore point to rollback your ledger:</span>
                <span className="font-mono text-[11px]">Current: {currentTransactions.length} entries</span>
              </div>

              {points.map((point, index) => {
                const isLatest = index === 0;
                const diff = point.transactions.length - currentTransactions.length;

                return (
                  <div
                    key={point.id}
                    className={`border rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                      isLatest
                        ? 'border-indigo-200 bg-indigo-50/30 shadow-xs'
                        : 'border-zinc-200 bg-white hover:border-zinc-300'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isLatest && (
                          <span className="text-[9px] font-black uppercase tracking-wider bg-indigo-600 text-white px-1.5 py-0.5 rounded">
                            Latest Point
                          </span>
                        )}
                        <span className="text-xs font-bold text-zinc-900">
                          {point.actionTitle}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-zinc-500 flex-wrap">
                        <span className="flex items-center gap-1 font-mono">
                          <Calendar className="w-3 h-3 text-zinc-400" />
                          {point.displayTime}
                        </span>
                        <span>•</span>
                        <span className="font-mono font-medium">
                          {point.transactions.length} entries
                          {diff !== 0 && (
                            <span className={`ml-1 font-semibold ${diff > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              ({diff > 0 ? `+${diff}` : diff} vs now)
                            </span>
                          )}
                        </span>
                      </div>

                      {point.summary && (
                        <p className="text-[10.5px] text-zinc-500 leading-snug">
                          {point.summary}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => handleRestore(point)}
                      className="self-start sm:self-center bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer active:scale-95"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-indigo-300" />
                      <span>Restore This State</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-zinc-50 border-t border-zinc-200 px-5 py-3 flex justify-between items-center shrink-0">
          {points.length > 0 ? (
            <button
              type="button"
              onClick={handleClearHistory}
              className="text-[11px] text-rose-600 hover:text-rose-800 font-bold px-2 py-1 rounded transition-colors cursor-pointer"
            >
              Clear History
            </button>
          ) : <div />}

          <button
            type="button"
            onClick={onClose}
            className="text-xs bg-zinc-200 hover:bg-zinc-300 text-zinc-800 font-bold px-4 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};

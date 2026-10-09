import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  Check,
  Trash2,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Info
} from 'lucide-react';
import { Transaction } from '../types';
import {
  DuplicateCluster,
  findDuplicatesInLedger
} from '../lib/transactionDeduplication';

interface DuplicateAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  onResolveDuplicates: (cleanTransactions: Transaction[], removedCount: number) => void;
}

export const DuplicateAuditModal: React.FC<DuplicateAuditModalProps> = ({
  isOpen,
  onClose,
  transactions,
  onResolveDuplicates
}) => {
  const clusters: DuplicateCluster[] = findDuplicatesInLedger(transactions);

  // Map cluster key -> set of selected item IDs to KEEP
  const [selectedKeeps, setSelectedKeeps] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    clusters.forEach(c => {
      initial[c.key] = c.suggestedKeepId;
    });
    return initial;
  });

  // Re-sync when clusters change
  React.useEffect(() => {
    const initial: Record<string, string> = {};
    clusters.forEach(c => {
      initial[c.key] = c.suggestedKeepId;
    });
    setSelectedKeeps(initial);
  }, [transactions]);

  if (!isOpen) return null;

  const totalDuplicatesToRemove = clusters.reduce((sum, c) => sum + (c.items.length - 1), 0);
  const totalExcessAmount = clusters.reduce((sum, c) => sum + c.totalExcessAmount, 0);

  const handleSelectKeep = (clusterKey: string, itemId: string) => {
    setSelectedKeeps(prev => ({
      ...prev,
      [clusterKey]: itemId
    }));
  };

  const handleApplyCleanAll = () => {
    const idsToRemove = new Set<string>();

    clusters.forEach(c => {
      const keepId = selectedKeeps[c.key] || c.suggestedKeepId;
      c.items.forEach(item => {
        if (item.id !== keepId) {
          idsToRemove.add(item.id);
        }
      });
    });

    const clean = transactions.filter(t => !idsToRemove.has(t.id));
    onResolveDuplicates(clean, idsToRemove.size);
    onClose();
  };

  const handleResolveSingleCluster = (cluster: DuplicateCluster) => {
    const keepId = selectedKeeps[cluster.key] || cluster.suggestedKeepId;
    const idsToRemove = new Set<string>();
    cluster.items.forEach(item => {
      if (item.id !== keepId) {
        idsToRemove.add(item.id);
      }
    });

    const clean = transactions.filter(t => !idsToRemove.has(t.id));
    onResolveDuplicates(clean, idsToRemove.size);
  };

  return (
    <div className="fixed inset-0 bg-zinc-950/65 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 z-50 animate-fade-in">
      <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-2xl border border-zinc-200 shadow-2xl overflow-hidden flex flex-col text-zinc-800">
        
        {/* Header */}
        <div className="bg-amber-500/10 border-b border-amber-200/60 px-5 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-700">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-900 tracking-tight">Ledger Duplicate Audit & Correction</h3>
                <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full border border-amber-300">
                  {totalDuplicatesToRemove} {totalDuplicatesToRemove === 1 ? 'Duplicate' : 'Duplicates'} Found
                </span>
              </div>
              <p className="text-[11px] text-zinc-500">
                Review and resolve duplicate bank entries to prevent double-counting numbers
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {clusters.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-zinc-900">Your Ledger is Completely Clean</h4>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  No duplicate entries detected across dates, amounts, or bank account balances.
                </p>
              </div>
              <button
                onClick={onClose}
                className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all cursor-pointer"
              >
                Close Audit
              </button>
            </div>
          ) : (
            <>
              {/* Summary Banner */}
              <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900">
                <div className="flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold">
                      Found {clusters.length} duplicate {clusters.length === 1 ? 'group' : 'groups'} ({totalDuplicatesToRemove} redundant entries).
                    </p>
                    <p className="text-[11px] text-amber-700">
                      Double-counted volume: <strong className="font-mono text-zinc-900">FJD ${totalExcessAmount.toFixed(2)}</strong>.
                      The system automatically selected the best entry to keep in each group (prioritizing reconciled status and attachments).
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleApplyCleanAll}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Auto-Clean All ({totalDuplicatesToRemove})</span>
                </button>
              </div>

              {/* Duplicate Clusters List */}
              <div className="space-y-3">
                {clusters.map((cluster, groupIdx) => {
                  const keepId = selectedKeeps[cluster.key] || cluster.suggestedKeepId;

                  return (
                    <div
                      key={cluster.key}
                      className="border border-zinc-200 rounded-xl p-3.5 bg-zinc-50/50 space-y-2.5 hover:border-amber-300 transition-colors"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-zinc-200/60 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider bg-zinc-200 text-zinc-700 px-2 py-0.5 rounded">
                            Group #{groupIdx + 1}
                          </span>
                          <span className="text-xs font-bold text-zinc-900">
                            {cluster.representative.description}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-black font-mono ${
                            cluster.representative.amount > 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}>
                            {cluster.representative.amount > 0 ? '+' : ''}FJD ${cluster.representative.amount.toFixed(2)}
                          </span>
                          <button
                            onClick={() => handleResolveSingleCluster(cluster)}
                            className="text-[10px] text-amber-700 hover:text-amber-900 font-bold bg-amber-100/70 hover:bg-amber-200 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                            title="Resolve just this duplicate pair"
                          >
                            Resolve this
                          </button>
                        </div>
                      </div>

                      {/* Entries within this group */}
                      <div className="space-y-1.5">
                        {cluster.items.map((item) => {
                          const isKept = item.id === keepId;

                          return (
                            <div
                              key={item.id}
                              onClick={() => handleSelectKeep(cluster.key, item.id)}
                              className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-3 cursor-pointer transition-all ${
                                isKept
                                  ? 'bg-emerald-50/70 border-emerald-300 shadow-xs'
                                  : 'bg-white border-zinc-200/80 opacity-70 hover:opacity-100 hover:border-rose-300'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                                  isKept
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-zinc-200 text-zinc-500'
                                }`}>
                                  {isKept ? <Check className="w-3 h-3" /> : <Trash2 className="w-2.5 h-2.5 text-rose-500" />}
                                </div>

                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-[11px] text-zinc-500">{item.date}</span>
                                    <span className="font-semibold text-zinc-900 truncate max-w-[200px] sm:max-w-[280px]">
                                      {item.description}
                                    </span>
                                    <span className="text-[9px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded font-mono">
                                      🏦 {item.bankName}
                                    </span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                      item.status === 'reconciled'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-zinc-100 text-zinc-600'
                                    }`}>
                                      {item.status}
                                    </span>
                                    {item.balance !== undefined && (
                                      <span className="text-[9px] bg-emerald-50 text-emerald-700 font-mono px-1 rounded">
                                        Bal: ${item.balance.toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="shrink-0 flex items-center gap-2">
                                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                  isKept
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : 'bg-rose-100 text-rose-700 border border-rose-200'
                                }`}>
                                  {isKept ? 'Keep This' : 'Remove Copy'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-zinc-50 border-t border-zinc-200 px-5 py-3 flex justify-between items-center shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-zinc-600 hover:text-zinc-900 font-bold px-3 py-1.5 rounded-lg hover:bg-zinc-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          {clusters.length > 0 && (
            <button
              type="button"
              onClick={handleApplyCleanAll}
              className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Deduplication ({totalDuplicatesToRemove} Removed)</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

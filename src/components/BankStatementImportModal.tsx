import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  X,
  Sparkles,
  Upload,
  FileSpreadsheet,
  ArrowUpRight,
  ArrowDownLeft,
  Building2,
  Check,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Copy,
  CheckCheck,
  ShieldCheck,
  Filter
} from 'lucide-react';
import { Transaction } from '../types';
import {
  parseBankStatement,
  ParsedStatementItem
} from '../lib/bankStatementParser';
import {
  annotateIncomingStatementDuplicates,
  checkTransactionDuplicate
} from '../lib/transactionDeduplication';

interface BankStatementImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (transactions: Transaction[]) => void;
  defaultVatRate?: number;
  categoryOptions: string[];
  existingTransactions?: Transaction[];
}

export const BankStatementImportModal: React.FC<BankStatementImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
  defaultVatRate = 12.5,
  categoryOptions,
  existingTransactions = []
}) => {
  const [activeTab, setActiveTab] = useState<'paste' | 'upload'>('paste');
  const [rawText, setRawText] = useState<string>('');
  const [isClassifying, setIsClassifying] = useState<boolean>(false);
  const [reassurance, setReassurance] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Real-time parsing of statement text
  const parseResult = useMemo(() => {
    return parseBankStatement(rawText, defaultVatRate);
  }, [rawText, defaultVatRate]);

  // Local editable rows state
  const [editableRows, setEditableRows] = useState<ParsedStatementItem[]>([]);

  // Selected indices for import (defaults to non-duplicates)
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [skipDuplicates, setSkipDuplicates] = useState<boolean>(true);

  // Sync editable rows whenever parseResult changes
  useEffect(() => {
    setEditableRows(parseResult.transactions);
  }, [parseResult]);

  // Compute duplicate annotations against existing ledger
  const annotatedRows = useMemo(() => {
    return annotateIncomingStatementDuplicates(editableRows, existingTransactions);
  }, [editableRows, existingTransactions]);

  const duplicateCount = useMemo(() => {
    return annotatedRows.filter(r => r.isDuplicate).length;
  }, [annotatedRows]);

  // Whenever annotated rows change or skipDuplicates toggles, initialize selected indices
  useEffect(() => {
    const selected = new Set<number>();
    annotatedRows.forEach((row, idx) => {
      if (!skipDuplicates || !row.isDuplicate) {
        selected.add(idx);
      }
    });
    setSelectedIndices(selected);
  }, [annotatedRows, skipDuplicates]);

  if (!isOpen) return null;

  const toggleSelectRow = (index: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const all = new Set<number>();
    annotatedRows.forEach((_, idx) => all.add(idx));
    setSelectedIndices(all);
    setSkipDuplicates(false);
  };

  const handleSelectOnlyNew = () => {
    const onlyNew = new Set<number>();
    annotatedRows.forEach((row, idx) => {
      if (!row.isDuplicate) onlyNew.add(idx);
    });
    setSelectedIndices(onlyNew);
    setSkipDuplicates(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawText(content);
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawText(content);
      }
    };
    reader.readAsText(file);
  };

  const handleRowCategoryChange = (index: number, newCategory: string) => {
    setEditableRows(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], category: newCategory };
      return updated;
    });
  };

  const handleRemoveRow = (index: number) => {
    setEditableRows(prev => prev.filter((_, i) => i !== index));
  };

  // 1. Direct Instant Import (Rule-based)
  const handleInstantImport = () => {
    const rowsToImport = editableRows.filter((_, idx) => selectedIndices.has(idx));
    if (rowsToImport.length === 0) {
      if (duplicateCount > 0 && selectedIndices.size === 0) {
        alert('Every row is already in your ledger, so none are ticked. Tick the rows you want, or click "Select all anyway" to import them all.');
      }
      return;
    }

    const formatted: Transaction[] = rowsToImport.map((item, idx) => ({
      id: `bsp-${Date.now()}-${idx}`,
      date: item.date,
      description: item.description,
      amount: item.amount,
      balance: item.balance,
      category: item.category,
      status: 'pending',
      confidence: item.confidence || 90,
      bankName: item.bankName || 'BSP Fiji',
      vatAmount: item.vatAmount || 0,
      currency: item.foreignCurrency,
      originalAmount: item.foreignAmount,
      exchangeRate: item.exchangeRate,
      netReceived: item.amount > 0 ? item.amount : undefined,
      notes: item.balance !== undefined ? `Statement balance: FJD $${item.balance.toFixed(2)}` : undefined
    }));

    onImport(formatted);
    onClose();
  };

  // 2. Refine with Gemini AI
  const handleGeminiAnalyze = async () => {
    if (!rawText.trim() && editableRows.length === 0) return;

    setIsClassifying(true);
    setReassurance('Categorising transactions with AI…');

    try {
      const res = await fetch('/api/bookkeeping/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textStatement: rawText,
          vatRate: defaultVatRate
        })
      });

      const data = await res.json();
      if (data.categorized && Array.isArray(data.categorized)) {
        let formatted: Transaction[] = data.categorized.map((item: any, i: number) => ({
          id: `upload-${Date.now()}-${i}`,
          date: item.date || new Date().toISOString().split('T')[0],
          description: item.description,
          amount: item.amount,
          balance: item.balance,
          category: item.category,
          status: 'pending',
          confidence: item.confidence || 95,
          bankName: item.bankName || 'BSP Fiji',
          vatAmount: item.vatAmount || 0,
          notes: item.balance !== undefined ? `Statement balance: FJD $${item.balance.toFixed(2)}` : undefined
        }));

        // If skip duplicates is active, filter out duplicates automatically
        if (skipDuplicates) {
          formatted = formatted.filter(tx => {
            const check = checkTransactionDuplicate(tx, existingTransactions);
            return !check.isDuplicate;
          });
        }

        onImport(formatted);
        onClose();
      } else {
        // Fallback to local rows
        handleInstantImport();
      }
    } catch (err) {
      console.error('Gemini statement parse error:', err);
      // Fallback on network or API failure
      handleInstantImport();
    } finally {
      setIsClassifying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 z-50 animate-fade-in">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl border border-zinc-200 shadow-2xl overflow-hidden flex flex-col text-zinc-800">
        
        {/* Header */}
        <div className="bg-zinc-950 text-white px-5 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight">Import bank statement</h3>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30">
                  CSV or text
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Import statements from BSP, ANZ, Westpac or M-PAiSA
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Top Bar: Tabs & Sample button */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-3">
            <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('paste')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === 'paste'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Paste text
              </button>
              <button
                onClick={() => setActiveTab('upload')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === 'upload'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                Upload file
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-400 font-mono">
                Reads BSP, ANZ, Westpac and M-PAiSA formats
              </span>
              {rawText && (
                <button
                  type="button"
                  onClick={() => setRawText('')}
                  className="text-xs text-zinc-500 hover:text-zinc-800 px-2 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Tab 1: Paste Text */}
          {activeTab === 'paste' && (
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs text-zinc-500">
                <span>Paste statement lines or a CSV export:</span>
                <span className="font-mono text-[11px] text-zinc-400">
                  Columns: Date, Description, Credit (FJD), Debit (FJD), Balance (FJD)
                </span>
              </div>
              <textarea
                rows={5}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={`Date,Description,Credit (FJD),Debit (FJD),Balance (FJD)
6/9/2026,DEP TRF VT1S Crewing Fees,1000.00,,10191.10
4/9/2026,IB FUNDS TRANSFER TO 82872136 DIR LON PAYMENT R#987774,,7230.00,9191.10
4/9/2026,Inward TT THE PACIFIC SPV PTY LTDAUD10500@0.6386,16432.22,,16421.10
31/8/2026,SERV FEE,,5.00,-11.12`}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-xs font-mono focus:outline-none focus:border-zinc-800 focus:bg-white transition-all resize-y"
              />
            </div>
          )}

          {/* Tab 2: Upload File */}
          {activeTab === 'upload' && (
            <div>
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-200 hover:border-emerald-500 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all bg-zinc-50 hover:bg-emerald-50/20 group text-center"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.tsv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-105 transition-transform mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="text-sm font-semibold text-zinc-800">
                  Drop a statement file here, or click to choose one
                </span>
                <span className="text-xs text-zinc-400 mt-1">
                  .csv, .tsv or .txt exported from your bank
                </span>
              </div>
            </div>
          )}

          {/* Statement Detection & Summary Card */}
          {editableRows.length > 0 && (
            <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full">
                    <Check className="w-3.5 h-3.5" />
                    {parseResult.bankIdentified} statement ({editableRows.length} transactions)
                  </span>
                  <span className="text-xs text-zinc-500">
                    VAT rate: <span className="font-semibold text-zinc-700">{defaultVatRate}%</span>
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    Credits: +FJD ${parseResult.totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-zinc-300">|</span>
                  <span className="text-rose-600 font-semibold flex items-center gap-1">
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                    Debits: -FJD ${parseResult.totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-zinc-300">|</span>
                  <span className="font-bold text-zinc-800">
                    Net: FJD ${parseResult.netFlow.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Duplicate Prevention Guard Banner */}
              {duplicateCount > 0 && (
                <div className="bg-amber-500/10 border border-amber-300/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-amber-950">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Possible duplicates:</span>{' '}
                      <span>
                        <strong>{duplicateCount}</strong> already in your ledger, so they're unticked.
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleSelectOnlyNew}
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        skipDuplicates
                          ? 'bg-amber-600 text-white'
                          : 'bg-amber-100 hover:bg-amber-200 text-amber-900'
                      }`}
                    >
                      Skip duplicates ({duplicateCount})
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-[11px] font-bold bg-white border border-amber-300 hover:bg-amber-50 text-amber-900 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                    >
                      Select all anyway
                    </button>
                  </div>
                </div>
              )}

              {/* Table Preview */}
              <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white max-h-[300px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-zinc-100/80 sticky top-0 z-10 border-b border-zinc-200 text-zinc-600 font-semibold">
                    <tr>
                      <th className="py-2 px-2 text-center w-8">
                        <input
                          type="checkbox"
                          checked={selectedIndices.size === editableRows.length && editableRows.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              handleSelectAll();
                            } else {
                              setSelectedIndices(new Set());
                            }
                          }}
                          className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                        />
                      </th>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Description</th>
                      <th className="py-2 px-3 text-right">Credit (+FJD)</th>
                      <th className="py-2 px-3 text-right">Debit (-FJD)</th>
                      <th className="py-2 px-3 text-right">Balance</th>
                      <th className="py-2 px-3">Category</th>
                      <th className="py-2 px-3 text-right">Fiji VAT</th>
                      <th className="py-2 px-2 text-center w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {editableRows.map((row, idx) => {
                      const isCredit = row.amount > 0;
                      const isSelected = selectedIndices.has(idx);
                      const isDup = annotatedRows[idx]?.isDuplicate;
                      const dupReason = annotatedRows[idx]?.duplicateReason;

                      return (
                        <tr
                          key={row.id || idx}
                          className={`transition-colors ${
                            isDup
                              ? 'bg-amber-50/40 hover:bg-amber-100/50'
                              : isSelected
                              ? 'hover:bg-zinc-50/70'
                              : 'opacity-50 hover:opacity-75 bg-zinc-50/30'
                          }`}
                        >
                          <td className="py-2 px-2 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectRow(idx)}
                              className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                            />
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-zinc-600 whitespace-nowrap">
                            {row.date}
                          </td>
                          <td className="py-2 px-3 text-zinc-900 font-medium max-w-[240px]" title={row.description}>
                            <div className="flex flex-col gap-0.5">
                              <span className="truncate">{row.description}</span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {isDup && (
                                  <span
                                    className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-1 py-0.2 rounded"
                                    title={dupReason}
                                  >
                                    <AlertTriangle className="w-2.5 h-2.5 text-amber-700" />
                                    Already in ledger
                                  </span>
                                )}
                                {row.isForeignCurrency && (
                                  <span className="inline-block text-[9px] font-bold bg-sky-100 text-sky-800 px-1 py-0.2 rounded">
                                    {row.foreignCurrency} {row.foreignAmount} @ {row.exchangeRate}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-700 whitespace-nowrap">
                            {isCredit ? `+${row.amount.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-rose-600 whitespace-nowrap">
                            {!isCredit ? `-${Math.abs(row.amount).toFixed(2)}` : '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-zinc-500 whitespace-nowrap">
                            {row.balance !== undefined ? `$${row.balance.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <select
                              value={row.category}
                              onChange={(e) => handleRowCategoryChange(idx, e.target.value)}
                              className="bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-800 focus:outline-none focus:border-zinc-800"
                            >
                              {categoryOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-[11px] text-indigo-700 whitespace-nowrap">
                            {row.vatAmount > 0 ? `$${row.vatAmount.toFixed(2)}` : '0%'}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              onClick={() => handleRemoveRow(idx)}
                              className="text-zinc-400 hover:text-rose-600 p-1 rounded transition-colors cursor-pointer"
                              title="Remove item"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Helpful Tips Callout */}
          {editableRows.length === 0 && (
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1 leading-relaxed">
                <span className="font-bold block">Statement format</span>
                <p className="text-[11px] text-amber-800">
                  Bank statements usually have these columns: <code className="font-mono bg-amber-100/80 px-1 rounded">Date</code>, <code className="font-mono bg-amber-100/80 px-1 rounded">Description</code>, <code className="font-mono bg-amber-100/80 px-1 rounded">Credit (FJD)</code>, <code className="font-mono bg-amber-100/80 px-1 rounded">Debit (FJD)</code>, and <code className="font-mono bg-amber-100/80 px-1 rounded">Balance (FJD)</code>.
                  Paste the rows with or without headers, or upload the CSV file.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-zinc-50 border-t border-zinc-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-zinc-500">
            {editableRows.length > 0 ? (
              <span>
                Ready to import <strong className="text-zinc-800">{selectedIndices.size}</strong> of {editableRows.length} transaction{editableRows.length === 1 ? '' : 's'}
                {duplicateCount > 0 && (
                  <span className="ml-1 text-amber-700 font-medium">
                    ({editableRows.length - selectedIndices.size} duplicate{editableRows.length - selectedIndices.size === 1 ? '' : 's'} excluded)
                  </span>
                )}
              </span>
            ) : (
              <span>Paste or upload a statement to see its transactions</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/70 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>

            {/* Quick Instant Import */}
            <button
              type="button"
              disabled={selectedIndices.size === 0 || isClassifying}
              onClick={handleInstantImport}
              className="px-4 py-2 text-xs font-semibold bg-white border border-zinc-300 hover:bg-zinc-100 text-zinc-800 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              Import ({selectedIndices.size})
            </button>

            {/* Gemini AI Powered Import */}
            <button
              type="button"
              disabled={selectedIndices.size === 0 || isClassifying}
              onClick={handleGeminiAnalyze}
              className="px-4 py-2 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 active:scale-98 text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              {isClassifying ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
                  Categorising…
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                  Import with AI categories ({selectedIndices.size})
                </>
              )}
            </button>
          </div>
        </div>

        {/* Floating loading banner */}
        {isClassifying && reassurance && (
          <div className="bg-sky-50 border-t border-sky-200 px-4 py-2 text-center text-xs font-medium text-sky-900 flex items-center justify-center gap-2 animate-pulse">
            <Sparkles className="w-4 h-4 text-sky-600" />
            {reassurance}
          </div>
        )}
      </div>
    </div>
  );
};

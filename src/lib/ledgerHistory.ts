import { Transaction } from '../types';

export interface LedgerRestorePoint {
  id: string;
  timestamp: string; // ISO string
  displayTime: string; // Formatted local time
  actionTitle: string; // e.g. "Before Bank Statement Import (12 items)"
  actionType: 'import_statement' | 'approve_review' | 'deduplicate' | 'delete_entry' | 'manual_change' | 'restore_previous';
  summary: string;
  previousCount: number;
  currentCount: number;
  transactions: Transaction[]; // The snapshot before the change
}

function getStorageKey(userEmail: string): string {
  const normalized = (userEmail || 'default_user').trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `fiji_crm_ledger_history_${normalized}`;
}

/**
 * Retrieve all saved restore points for the current user.
 */
export function getLedgerRestorePoints(userEmail: string): LedgerRestorePoint[] {
  try {
    const raw = localStorage.getItem(getStorageKey(userEmail));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Failed to load ledger restore points:', e);
    return [];
  }
}

/**
 * Get the most recent restore point available for a quick "Undo".
 */
export function getLatestLedgerRestorePoint(userEmail: string): LedgerRestorePoint | null {
  const points = getLedgerRestorePoints(userEmail);
  return points.length > 0 ? points[0] : null;
}

/**
 * Saves a new restore point of the ledger state prior to a mutating action.
 */
export function saveLedgerRestorePoint(
  userEmail: string,
  actionTitle: string,
  actionType: LedgerRestorePoint['actionType'],
  previousTransactions: Transaction[],
  resultingTransactions: Transaction[],
  customSummary?: string
): LedgerRestorePoint {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { month: 'short', day: 'numeric' });

  const restorePoint: LedgerRestorePoint = {
    id: `rp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: now.toISOString(),
    displayTime: `${dateStr} at ${timeStr}`,
    actionTitle,
    actionType,
    summary: customSummary || `Snapshotted ${previousTransactions.length} entries before ${actionTitle.toLowerCase()}`,
    previousCount: previousTransactions.length,
    currentCount: resultingTransactions.length,
    // Deep clone to ensure immutability
    transactions: JSON.parse(JSON.stringify(previousTransactions))
  };

  try {
    const existing = getLedgerRestorePoints(userEmail);
    // Keep at most 20 restore points to respect storage bounds
    const updated = [restorePoint, ...existing].slice(0, 20);
    localStorage.setItem(getStorageKey(userEmail), JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to persist ledger restore point:', e);
  }

  return restorePoint;
}

/**
 * Rollback to a specific restore point.
 * Also registers a counter-restore point so the user can easily re-apply/redo if desired.
 */
export function rollbackLedgerState(
  userEmail: string,
  pointId: string,
  currentTransactions: Transaction[]
): {
  restoredTransactions: Transaction[];
  restoredPoint: LedgerRestorePoint;
} | null {
  const points = getLedgerRestorePoints(userEmail);
  const targetPoint = points.find(p => p.id === pointId);
  if (!targetPoint) return null;

  // Save current state as a restore point before applying the rollback
  saveLedgerRestorePoint(
    userEmail,
    `Before Undo: Restoring ${targetPoint.actionTitle}`,
    'restore_previous',
    currentTransactions,
    targetPoint.transactions,
    `Backup captured before restoring to ${targetPoint.displayTime}`
  );

  return {
    restoredTransactions: JSON.parse(JSON.stringify(targetPoint.transactions)),
    restoredPoint: targetPoint
  };
}

/**
 * Clear restore points history.
 */
export function clearLedgerRestorePoints(userEmail: string): void {
  try {
    localStorage.removeItem(getStorageKey(userEmail));
  } catch (e) {
    console.warn('Failed to clear ledger history:', e);
  }
}

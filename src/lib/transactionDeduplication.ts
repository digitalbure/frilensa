import { Transaction } from '../types';
import { ParsedStatementItem } from './bankStatementParser';

/**
 * Normalizes a description by stripping transaction noise tokens, punctuation,
 * currency symbols, and extra whitespace for accurate matching.
 */
export function normalizeTransactionDescription(text: string): string {
  if (!text) return '';
  let clean = text.toLowerCase();

  // Strip common bank noise prefixes / suffixes
  const noisePatterns = [
    /\bpos\s+(?:debit|purchase|auth)\b/g,
    /\beftpos\b/g,
    /\bvisa\s+(?:debit|purchase)\b/g,
    /\bmastercard\b/g,
    /\batm\s+(?:wdl|withdrawal)\b/g,
    /\b(?:direct\s+debit|bill\s+pay|bpay)\b/g,
    /\b(?:transfer\s+to|transfer\s+from|funds\s+transfer|ib\s+trf)\b/g,
    /\b(?:bsp|anz|westpac|m-?paisa|mycash)\b/g,
    /\b(?:fee|charge|intl|tx|ref[:\s]*\w+)\b/g,
    /\b(?:fiji|suva|nadi|lautoka|nausori|labasa)\b/g
  ];

  for (const pattern of noisePatterns) {
    clean = clean.replace(pattern, ' ');
  }

  // Remove punctuation, currency signs, and non-alphanumeric chars (keep spaces and digits)
  clean = clean.replace(/[^a-z0-9\s]/g, ' ');
  // Collapse whitespace
  clean = clean.replace(/\s+/g, ' ').trim();

  return clean || text.toLowerCase().trim();
}

/**
 * Calculate similarity between two strings using token set overlap (Jaccard index)
 * and substring inclusion.
 */
export function calculateTextSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const normA = normalizeTransactionDescription(a);
  const normB = normalizeTransactionDescription(b);

  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) return 0.9;

  const tokensA = new Set(normA.split(/\s+/).filter(t => t.length > 2));
  const tokensB = new Set(normB.split(/\s+/).filter(t => t.length > 2));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersectionCount = 0;
  tokensA.forEach(token => {
    if (tokensB.has(token)) intersectionCount++;
  });

  const unionSize = new Set([...tokensA, ...tokensB]).size;
  return unionSize > 0 ? intersectionCount / unionSize : 0;
}

export interface DuplicateMatchResult {
  isDuplicate: boolean;
  score: number; // 0 to 100
  reason: string;
  matchedTransaction?: Transaction;
}

/**
 * Checks if a single transaction candidate is a duplicate of any transaction in existingList.
 */
export function checkTransactionDuplicate(
  candidate: {
    date: string;
    amount: number;
    description: string;
    balance?: number;
    bankName?: string;
    id?: string;
  },
  existingList: Transaction[]
): DuplicateMatchResult {
  const candidateAmt = Math.abs(candidate.amount);
  const candidateDate = candidate.date?.split('T')[0] || '';

  for (const existing of existingList) {
    // Skip comparing transaction to itself if IDs match
    if (candidate.id && existing.id === candidate.id) continue;

    const existingAmt = Math.abs(existing.amount);
    const existingDate = existing.date?.split('T')[0] || '';

    // Check amount: must be identical within 1 cent
    if (Math.abs(candidateAmt - existingAmt) > 0.01) {
      continue;
    }

    // Direction check: both must be income or both expense
    const sameDirection = (candidate.amount >= 0 && existing.amount >= 0) ||
                          (candidate.amount < 0 && existing.amount < 0);
    if (!sameDirection) {
      continue;
    }

    // Exact balance match rule (strongest proof in bank statements)
    if (
      candidate.balance !== undefined &&
      existing.balance !== undefined &&
      Math.abs(candidate.balance - existing.balance) < 0.01 &&
      candidateDate === existingDate
    ) {
      return {
        isDuplicate: true,
        score: 100,
        reason: `Exact match on date (${candidateDate}), amount (FJD $${candidateAmt.toFixed(2)}), and statement balance (FJD $${candidate.balance.toFixed(2)})`,
        matchedTransaction: existing
      };
    }

    // Date difference in days
    let dayDiff = 999;
    if (candidateDate && existingDate) {
      const d1 = new Date(candidateDate).getTime();
      const d2 = new Date(existingDate).getTime();
      dayDiff = Math.abs(Math.round((d1 - d2) / (1000 * 60 * 60 * 24)));
    }

    const similarity = calculateTextSimilarity(candidate.description, existing.description);

    // Exact date + high text similarity or identical description
    if (dayDiff === 0) {
      if (similarity >= 0.65 || candidate.description.trim().toLowerCase() === existing.description.trim().toLowerCase()) {
        return {
          isDuplicate: true,
          score: 98,
          reason: `Exact match on date (${candidateDate}) and amount (FJD $${candidateAmt.toFixed(2)}), with matching payee "${existing.description}"`,
          matchedTransaction: existing
        };
      }
      // Same date and same amount even if description has varied bank descriptors
      if (similarity >= 0.35) {
        return {
          isDuplicate: true,
          score: 85,
          reason: `Same date (${candidateDate}) and amount (FJD $${candidateAmt.toFixed(2)}) with similar description`,
          matchedTransaction: existing
        };
      }
    }

    // Near-date match (within 1 day weekend/bank clearing lag) with identical or very high similarity description
    if (dayDiff <= 1 && similarity >= 0.75) {
      return {
        isDuplicate: true,
        score: 88,
        reason: `Matches amount (FJD $${candidateAmt.toFixed(2)}) and payee within 1 business day (${existingDate} vs ${candidateDate})`,
        matchedTransaction: existing
      };
    }
  }

  return {
    isDuplicate: false,
    score: 0,
    reason: 'No matching transaction found in ledger'
  };
}

export interface DuplicateCluster {
  key: string;
  representative: Transaction;
  items: Transaction[];
  suggestedKeepId: string;
  duplicateIds: string[];
  totalExcessAmount: number;
}

/**
 * Scans an existing list of transactions to detect duplicate clusters currently inside the ledger.
 */
export function findDuplicatesInLedger(transactions: Transaction[]): DuplicateCluster[] {
  const visitedIds = new Set<string>();
  const clusters: DuplicateCluster[] = [];

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    if (visitedIds.has(tx.id)) continue;

    const duplicateGroup: Transaction[] = [tx];

    for (let j = i + 1; j < transactions.length; j++) {
      const other = transactions[j];
      if (visitedIds.has(other.id)) continue;

      const check = checkTransactionDuplicate(
        {
          id: other.id,
          date: other.date,
          amount: other.amount,
          description: other.description,
          balance: other.balance,
          bankName: other.bankName
        },
        [tx]
      );

      if (check.isDuplicate) {
        duplicateGroup.push(other);
      }
    }

    if (duplicateGroup.length > 1) {
      // Mark all as visited in this cluster
      duplicateGroup.forEach(item => visitedIds.add(item.id));

      // Determine which one to keep:
      // Preference: Reconciled > Has document/invoice link > Has notes/attachments > Oldest ID or position
      let bestItem = duplicateGroup[0];
      for (const item of duplicateGroup) {
        const bestScore = getItemRetentionScore(bestItem);
        const itemScore = getItemRetentionScore(item);
        if (itemScore > bestScore) {
          bestItem = item;
        }
      }

      const duplicateIds = duplicateGroup.filter(t => t.id !== bestItem.id).map(t => t.id);
      const excessAmount = duplicateGroup
        .filter(t => t.id !== bestItem.id)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      clusters.push({
        key: `dup-${tx.date}-${tx.amount.toFixed(2)}-${i}`,
        representative: bestItem,
        items: duplicateGroup,
        suggestedKeepId: bestItem.id,
        duplicateIds,
        totalExcessAmount: excessAmount
      });
    }
  }

  return clusters;
}

function getItemRetentionScore(item: Transaction): number {
  let score = 0;
  if (item.status === 'reconciled') score += 50;
  if (item.documentId) score += 40;
  if (item.paymentAttachments && item.paymentAttachments.length > 0) score += 30;
  if (item.receiptImage) score += 30;
  if (item.notes && item.notes.trim().length > 0) score += 20;
  if (item.referenceNumber) score += 10;
  // If it has an earlier timestamp or standard ID
  return score;
}

/**
 * Automatically cleans duplicates from a transaction list, keeping only one entry per duplicate group.
 */
export function deduplicateLedger(
  transactions: Transaction[],
  preferredKeepIds?: Set<string>
): {
  cleanTransactions: Transaction[];
  removedTransactions: Transaction[];
  removedCount: number;
  duplicateGroupsCount: number;
} {
  const clusters = findDuplicatesInLedger(transactions);
  if (clusters.length === 0) {
    return {
      cleanTransactions: transactions,
      removedTransactions: [],
      removedCount: 0,
      duplicateGroupsCount: 0
    };
  }

  const idsToRemove = new Set<string>();

  clusters.forEach(cluster => {
    // If a custom preferred ID is passed, keep that, otherwise keep suggested
    let keepId = cluster.suggestedKeepId;
    if (preferredKeepIds) {
      const userSelected = cluster.items.find(t => preferredKeepIds.has(t.id));
      if (userSelected) keepId = userSelected.id;
    }

    cluster.items.forEach(t => {
      if (t.id !== keepId) {
        idsToRemove.add(t.id);
      }
    });
  });

  const cleanTransactions = transactions.filter(t => !idsToRemove.has(t.id));
  const removedTransactions = transactions.filter(t => idsToRemove.has(t.id));

  return {
    cleanTransactions,
    removedTransactions,
    removedCount: removedTransactions.length,
    duplicateGroupsCount: clusters.length
  };
}

/**
 * Annotates incoming parsed statement items with duplicate detection results.
 */
export function annotateIncomingStatementDuplicates(
  incomingItems: ParsedStatementItem[],
  existingTransactions: Transaction[]
): Array<ParsedStatementItem & { isDuplicate: boolean; duplicateReason?: string; matchedTx?: Transaction }> {
  return incomingItems.map(item => {
    const check = checkTransactionDuplicate(
      {
        date: item.date,
        amount: item.amount,
        description: item.description,
        balance: item.balance,
        bankName: item.bankName
      },
      existingTransactions
    );

    return {
      ...item,
      isDuplicate: check.isDuplicate,
      duplicateReason: check.reason,
      matchedTx: check.matchedTransaction
    };
  });
}

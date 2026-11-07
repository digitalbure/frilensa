import React from 'react';
import { adjustmentRows } from '../lib/documentAdjustments';
import type { CRMDocument } from '../types';

/**
 * A document's discount and rounding lines for a totals block. `before` is the before-tax discount
 * (shown under the subtotal); `after` is the after-tax discount and rounding (shown above the total).
 */
export default function DocAdjustmentRows({ doc, currency, position, className = 'flex justify-between', colon = false }: {
  doc: Pick<CRMDocument, 'discount' | 'roundingAdjustment'>;
  currency: string;
  position: 'before' | 'after';
  className?: string;
  colon?: boolean;
}) {
  const rows = adjustmentRows(doc).filter(r => position === 'before' ? r.key === 'discount_before' : r.key !== 'discount_before');
  if (!rows.length) return null;
  return (
    <>
      {rows.map(r => (
        <div key={r.key} className={`${className} ${r.key === 'rounding' ? 'text-teal-700' : 'text-violet-700'}`}>
          <span>{r.label}{r.key === 'discount_before' ? ' (before tax)' : r.key === 'discount_after' ? ' (after tax)' : ''}{colon ? ':' : ''}</span>
          <span className="font-mono">{r.amount < 0 ? '−' : '+'}{currency} ${Math.abs(r.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      ))}
    </>
  );
}

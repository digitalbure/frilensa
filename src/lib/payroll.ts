import type { CRMData, ExpenseRecord, Transaction } from '../types';

// Payroll for employees in Fiji: PAYE (income tax withheld from pay) and FNPF (the national provident fund).
//
// PAYE follows the FRCS Employer Guide 2026 and Regulation 6 of the Income Tax (Withholding Tax)
// Regulations 2013: tax code P (primary employment) uses the year-to-date formula
//   tax = (A1 / F × G) − B1 + Tax(C2) − Tax(C1)
// where C1 is the projected year's normal pay, C2 adds bonuses and overtime to date, and B1 is tax withheld
// so far. Code S (secondary employment) and no tax code declaration are taxed at a flat 20%.
// PAYE is paid to FRCS by the last day of the month after the pay date.
// FNPF: 8% from the employee, 10% from the employer, temporarily 8% from 1 August 2026 to 31 July 2027
// (2026–2027 National Budget). Rates are in the platform config so admins can follow changes.

export type PayFrequency = 'weekly' | 'fortnightly' | 'monthly';
export const PERIODS_PER_YEAR: Record<PayFrequency, number> = { weekly: 52, fortnightly: 26, monthly: 12 };
export const FREQUENCY_NAMES: Record<PayFrequency, string> = { weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly' };

export interface PayrollSettings {
  fnpfEmployee: number;
  fnpfEmployer: number;
  /** A temporary employer rate between two dates (by pay date), e.g. 8% from 2026-08-01 to 2027-07-31. */
  fnpfEmployerTemporary: { rate: number; from: string; to: string } | null;
  /** Code S (secondary employment) and no-declaration rate. */
  secondaryRate: number;
}

export const DEFAULT_PAYROLL: PayrollSettings = {
  fnpfEmployee: 8,
  fnpfEmployer: 10,
  fnpfEmployerTemporary: { rate: 8, from: '2026-08-01', to: '2027-07-31' },
  secondaryRate: 20
};

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const pct = (v: unknown, fallback: number) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 50 ? Math.round(n * 100) / 100 : fallback; };

export function cleanPayroll(raw: any): PayrollSettings {
  const r = raw && typeof raw === 'object' ? raw : {};
  const t = r.fnpfEmployerTemporary;
  return {
    fnpfEmployee: pct(r.fnpfEmployee, DEFAULT_PAYROLL.fnpfEmployee),
    fnpfEmployer: pct(r.fnpfEmployer, DEFAULT_PAYROLL.fnpfEmployer),
    fnpfEmployerTemporary: t === null ? null
      : t && isDate(t.from) && isDate(t.to) && t.from <= t.to ? { rate: pct(t.rate, DEFAULT_PAYROLL.fnpfEmployer), from: t.from, to: t.to }
      : DEFAULT_PAYROLL.fnpfEmployerTemporary,
    secondaryRate: pct(r.secondaryRate, DEFAULT_PAYROLL.secondaryRate)
  };
}

/** The employer's FNPF rate on a pay date. */
export const employerFnpfRate = (s: PayrollSettings, payDate: string) =>
  s.fnpfEmployerTemporary && payDate >= s.fnpfEmployerTemporary.from && payDate <= s.fnpfEmployerTemporary.to ? s.fnpfEmployerTemporary.rate : s.fnpfEmployer;

// ---------- Income tax tables (FRCS, from the 2024 tax year) ----------

type Band = { upTo: number; rate: number };
export const RESIDENT_BANDS: Band[] = [
  { upTo: 30_000, rate: 0 }, { upTo: 50_000, rate: 18 }, { upTo: 270_000, rate: 20 }, { upTo: 300_000, rate: 33 },
  { upTo: 350_000, rate: 34 }, { upTo: 400_000, rate: 35 }, { upTo: 450_000, rate: 36 }, { upTo: 500_000, rate: 37 },
  { upTo: 1_000_000, rate: 38 }, { upTo: Infinity, rate: 39 }
];
export const NON_RESIDENT_BANDS: Band[] = [
  { upTo: 270_000, rate: 20 }, { upTo: 300_000, rate: 33 }, { upTo: 350_000, rate: 34 }, { upTo: 400_000, rate: 35 },
  { upTo: 450_000, rate: 36 }, { upTo: 500_000, rate: 37 }, { upTo: 1_000_000, rate: 38 }, { upTo: Infinity, rate: 39 }
];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Income tax on a year's chargeable income. */
export function annualTax(income: number, residency: 'resident' | 'non_resident' = 'resident') {
  let tax = 0, from = 0;
  for (const b of residency === 'non_resident' ? NON_RESIDENT_BANDS : RESIDENT_BANDS) {
    if (income <= from) break;
    tax += (Math.min(income, b.upTo) - from) * b.rate / 100;
    from = b.upTo;
  }
  return round2(tax);
}

// ---------- Employees and pay runs ----------

export interface Employee {
  id: string;
  businessId: string;
  name: string;
  tin: string;
  fnpfNumber: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  /** P: primary employment; S: secondary employment; N: no tax code declaration received. */
  taxCode: 'P' | 'S' | 'N';
  residency: 'resident' | 'non_resident';
  frequency: PayFrequency;
  payType: 'salary' | 'hourly';
  /** Salary per pay period, or the hourly rate. */
  rate: number;
  /** Usual hours per pay period for hourly pay. */
  hours?: number;
  /** Contributes to FNPF (some short-term foreign experts don't). */
  fnpf: boolean;
  /** Extra employer FNPF on top of the mandatory rate, percent (the total stays within the standard 10%). */
  employerTopUp?: number;
  startDate: string;
  endDate?: string;
  bankAccount?: string;
  notes?: string;
  /** Pay and tax earlier in the tax year before using Frilensa (from the old payroll), so PAYE stays right. */
  openingYtd?: { year: string; normal: number; extra: number; paye: number; fnpfEmployee: number };
  createdAt: string;
  updatedAt?: string;
}

export interface PayLine {
  employeeId: string;
  name: string;
  tin: string;
  fnpfNumber: string;
  taxCode: Employee['taxCode'];
  residency: Employee['residency'];
  hours?: number;
  /** Basic wage or salary for the period. */
  normalPay: number;
  /** Overtime, bonuses, commissions and taxable allowances (taxed as extra pay). */
  extraPay: number;
  /** Reimbursing allowances (not taxed, no FNPF), e.g. travel or meal costs. */
  reimbursements: number;
  /** Other deductions from net pay (advances, union fees). */
  otherDeductions: number;
  gross: number;
  paye: number;
  fnpfEmployee: number;
  fnpfEmployer: number;
  net: number;
  note?: string;
}

export interface PayRun {
  id: string;
  businessId: string;
  frequency: PayFrequency;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  status: 'draft' | 'paid';
  lines: PayLine[];
  createdAt: string;
  updatedAt?: string;
  paidAt?: string;
  /** Expenses recorded when the run was paid. */
  expenseIds?: string[];
}

/** Which pay period of the tax year (calendar year) a pay date is in: 1..F. */
export function periodNumber(payDate: string, frequency: PayFrequency) {
  const d = new Date(`${payDate}T00:00:00Z`);
  if (frequency === 'monthly') return d.getUTCMonth() + 1;
  const day = Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
  return Math.min(PERIODS_PER_YEAR[frequency], Math.ceil(day / (frequency === 'weekly' ? 7 : 14)));
}

/** An employee's pay so far this tax year from paid runs before this one (by pay date). */
export function yearToDate(runs: PayRun[], employeeId: string, payDate: string, exceptRunId?: string) {
  const year = payDate.slice(0, 4);
  let normal = 0, extra = 0, paye = 0, gross = 0, fnpfEmployee = 0, fnpfEmployer = 0;
  for (const r of runs) {
    if (r.id === exceptRunId || r.status !== 'paid' || r.payDate.slice(0, 4) !== year || r.payDate > payDate) continue;
    for (const l of r.lines) if (l.employeeId === employeeId) {
      normal += l.normalPay; extra += l.extraPay; paye += l.paye; gross += l.gross; fnpfEmployee += l.fnpfEmployee; fnpfEmployer += l.fnpfEmployer;
    }
  }
  return { normal: round2(normal), extra: round2(extra), paye: round2(paye), gross: round2(gross), fnpfEmployee: round2(fnpfEmployee), fnpfEmployer: round2(fnpfEmployer) };
}

/** Year to date for an employee: paid runs plus any opening figures for that tax year. */
export function ytdFor(runs: PayRun[], e: Pick<Employee, 'id' | 'openingYtd'>, payDate: string, exceptRunId?: string) {
  const y = yearToDate(runs, e.id, payDate, exceptRunId);
  const o = e.openingYtd;
  if (!o || o.year !== payDate.slice(0, 4)) return y;
  return { ...y, normal: round2(y.normal + o.normal), extra: round2(y.extra + o.extra), paye: round2(y.paye + o.paye), gross: round2(y.gross + o.normal + o.extra), fnpfEmployee: round2(y.fnpfEmployee + (o.fnpfEmployee || 0)) };
}

/**
 * PAYE for one pay (Regulation 6 for code P; a flat rate for S and no declaration).
 * `ytd` is pay and tax in earlier pay periods this year.
 */
export function payeFor(
  p: { taxCode: Employee['taxCode']; residency: Employee['residency']; frequency: PayFrequency; payDate: string; normalPay: number; extraPay: number },
  ytd: { normal: number; extra: number; paye: number },
  settings: PayrollSettings = DEFAULT_PAYROLL
) {
  const gross = p.normalPay + p.extraPay;
  if (p.taxCode !== 'P') return round2(Math.max(0, gross) * settings.secondaryRate / 100);
  const F = PERIODS_PER_YEAR[p.frequency];
  const G = periodNumber(p.payDate, p.frequency);
  const C1 = p.normalPay * (F - G + 1) + ytd.normal;
  const A1 = annualTax(C1, p.residency);
  const C2 = C1 + ytd.extra + p.extraPay;
  const tax = (A1 / F) * G - ytd.paye + annualTax(C2, p.residency) - annualTax(C1, p.residency);
  return Math.max(0, round2(tax));
}

/** Works out one employee's pay line. Amounts entered: normal pay, extra pay, reimbursements, other deductions. */
export function calcLine(
  e: Employee,
  input: { normalPay: number; extraPay: number; reimbursements: number; otherDeductions: number; hours?: number; note?: string },
  run: { frequency: PayFrequency; payDate: string },
  ytd: { normal: number; extra: number; paye: number },
  settings: PayrollSettings = DEFAULT_PAYROLL
): PayLine {
  const normalPay = round2(Math.max(0, input.normalPay));
  const extraPay = round2(Math.max(0, input.extraPay));
  const reimbursements = round2(Math.max(0, input.reimbursements));
  const otherDeductions = round2(Math.max(0, input.otherDeductions));
  const gross = round2(normalPay + extraPay);
  const paye = payeFor({ taxCode: e.taxCode, residency: e.residency, frequency: run.frequency, payDate: run.payDate, normalPay, extraPay }, ytd, settings);
  const erRate = employerFnpfRate(settings, run.payDate);
  const topUp = Math.max(0, Math.min(Number(e.employerTopUp) || 0, Math.max(0, 10 - erRate)));
  const fnpfEmployee = e.fnpf ? round2(gross * settings.fnpfEmployee / 100) : 0;
  const fnpfEmployer = e.fnpf ? round2(gross * (erRate + topUp) / 100) : 0;
  return {
    employeeId: e.id, name: e.name, tin: e.tin, fnpfNumber: e.fnpfNumber, taxCode: e.taxCode, residency: e.residency,
    ...(input.hours !== undefined ? { hours: input.hours } : {}),
    normalPay, extraPay, reimbursements, otherDeductions, gross, paye, fnpfEmployee, fnpfEmployer,
    net: round2(gross + reimbursements - paye - fnpfEmployee - otherDeductions),
    ...(input.note ? { note: input.note } : {})
  };
}

/** Normal pay for a period from the employee's rate (hourly × hours, or the salary). */
export const normalPayFor = (e: Employee, hours?: number) => round2(e.payType === 'hourly' ? e.rate * (hours ?? e.hours ?? 0) : e.rate);

export function runTotals(run: Pick<PayRun, 'lines'>) {
  const sum = (k: keyof PayLine) => round2(run.lines.reduce((s, l) => s + (Number(l[k]) || 0), 0));
  return { gross: sum('gross'), reimbursements: sum('reimbursements'), paye: sum('paye'), fnpfEmployee: sum('fnpfEmployee'), fnpfEmployer: sum('fnpfEmployer'), otherDeductions: sum('otherDeductions'), net: sum('net') };
}

/** The last day of the month after a date's month. */
export function endOfNextMonth(date: string) {
  const [y, m] = date.slice(0, 7).split('-').map(Number);
  return new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
}

export interface PayrollMonth {
  month: string;
  payeDue: string;
  fnpfScheduleDue: string;
  rows: { employeeId: string; name: string; tin: string; fnpfNumber: string; gross: number; paye: number; fnpfEmployee: number; fnpfEmployer: number }[];
  gross: number; paye: number; fnpfEmployee: number; fnpfEmployer: number;
}

/** PAYE and FNPF for a month, from paid runs by pay date. */
export function payrollMonth(runs: PayRun[], businessId: string, month: string): PayrollMonth {
  const byId = new Map<string, PayrollMonth['rows'][number]>();
  for (const r of runs) {
    if (r.status !== 'paid' || r.businessId !== businessId || r.payDate.slice(0, 7) !== month) continue;
    for (const l of r.lines) {
      const row = byId.get(l.employeeId) || { employeeId: l.employeeId, name: l.name, tin: l.tin, fnpfNumber: l.fnpfNumber, gross: 0, paye: 0, fnpfEmployee: 0, fnpfEmployer: 0 };
      row.gross = round2(row.gross + l.gross); row.paye = round2(row.paye + l.paye);
      row.fnpfEmployee = round2(row.fnpfEmployee + l.fnpfEmployee); row.fnpfEmployer = round2(row.fnpfEmployer + l.fnpfEmployer);
      byId.set(l.employeeId, row);
    }
  }
  const rows = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  const [y, m] = month.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 14)).toISOString().slice(0, 10);
  const sum = (k: 'gross' | 'paye' | 'fnpfEmployee' | 'fnpfEmployer') => round2(rows.reduce((s, r) => s + r[k], 0));
  return { month, payeDue: endOfNextMonth(`${month}-01`), fnpfScheduleDue: next, rows, gross: sum('gross'), paye: sum('paye'), fnpfEmployee: sum('fnpfEmployee'), fnpfEmployer: sum('fnpfEmployer') };
}

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function payrollMonthCsv(m: PayrollMonth) {
  const lines = [['Employee', 'TIN', 'FNPF number', 'Gross pay', 'PAYE', 'FNPF employee', 'FNPF employer', 'FNPF total'].map(csvCell).join(',')];
  for (const r of m.rows) lines.push([r.name, r.tin, r.fnpfNumber, r.gross.toFixed(2), r.paye.toFixed(2), r.fnpfEmployee.toFixed(2), r.fnpfEmployer.toFixed(2), (r.fnpfEmployee + r.fnpfEmployer).toFixed(2)].map(csvCell).join(','));
  lines.push(['Total', '', '', m.gross.toFixed(2), m.paye.toFixed(2), m.fnpfEmployee.toFixed(2), m.fnpfEmployer.toFixed(2), (m.fnpfEmployee + m.fnpfEmployer).toFixed(2)].map(csvCell).join(','));
  return lines.join('\n');
}

/** An employee's year, for their tax withholding certificate. */
export function employeeYear(runs: PayRun[], employeeId: string, year: string) {
  const list = runs.filter(r => r.status === 'paid' && r.payDate.slice(0, 4) === year)
    .flatMap(r => r.lines.filter(l => l.employeeId === employeeId).map(l => ({ run: r, line: l })))
    .sort((a, b) => a.run.payDate.localeCompare(b.run.payDate));
  const sum = (k: keyof PayLine) => round2(list.reduce((s, x) => s + (Number(x.line[k]) || 0), 0));
  return { pays: list, gross: sum('gross'), paye: sum('paye'), fnpfEmployee: sum('fnpfEmployee'), fnpfEmployer: sum('fnpfEmployer'), net: sum('net') };
}

/**
 * The bookkeeping entries for a paid run: wages (gross pay and reimbursements) and the employer's FNPF,
 * as expenses with their ledger entries.
 */
export function bookkeepingForRun(run: PayRun): { expenses: ExpenseRecord[]; transactions: Transaction[] } {
  const t = runTotals(run);
  const now = new Date().toISOString();
  const label = `${FREQUENCY_NAMES[run.frequency]} pay ${run.periodStart} to ${run.periodEnd}`;
  const expenses: ExpenseRecord[] = [];
  if (t.gross + t.reimbursements > 0) expenses.push({
    id: `exp-pay-${run.id}`, date: run.payDate, vendor: 'Employees', description: `Wages: ${label} (${run.lines.length} ${run.lines.length === 1 ? 'person' : 'people'})`,
    amount: round2(t.gross + t.reimbursements), category: 'Wages & Salaries', paymentMethod: 'Bank Transfer', isTaxDeductible: true, isVatClaimable: false,
    businessId: run.businessId, currency: 'FJD', createdAt: now,
    notes: `Gross pay FJD ${t.gross.toFixed(2)}${t.reimbursements ? ` and reimbursements FJD ${t.reimbursements.toFixed(2)}` : ''}. Net pay FJD ${t.net.toFixed(2)}; PAYE FJD ${t.paye.toFixed(2)} and employee FNPF FJD ${t.fnpfEmployee.toFixed(2)} withheld${t.otherDeductions ? `; other deductions FJD ${t.otherDeductions.toFixed(2)}` : ''}.`
  });
  if (t.fnpfEmployer > 0) expenses.push({
    id: `exp-fnpf-${run.id}`, date: run.payDate, vendor: 'FNPF', description: `Employer FNPF: ${label}`,
    amount: t.fnpfEmployer, category: 'Wages & Salaries', paymentMethod: 'Bank Transfer', isTaxDeductible: true, isVatClaimable: false,
    businessId: run.businessId, currency: 'FJD', createdAt: now
  });
  const transactions: Transaction[] = expenses.map(e => ({
    id: e.id, date: e.date, description: e.description, amount: -Math.abs(e.amount), category: e.category, status: 'reconciled', confidence: 100,
    bankName: e.paymentMethod, vendor: e.vendor, paymentMethod: e.paymentMethod, isTaxDeductible: true, isVatClaimable: false, notes: e.notes, businessId: e.businessId
  } as Transaction));
  return { expenses, transactions };
}

/** PAYE or FNPF paid for a month. */
export interface PayrollPayment {
  id: string;
  businessId: string;
  month: string;
  kind: 'paye' | 'fnpf';
  amount: number;
  date: string;
  reference?: string;
  updatedAt?: string;
}

/** Removes a run's bookkeeping entries (when a paid run is reopened). */
export function withoutRunBookkeeping(data: Pick<CRMData, 'expenses' | 'transactions'>, run: PayRun) {
  const ids = new Set(run.expenseIds || []);
  return { expenses: (data.expenses || []).filter(e => !ids.has(e.id)), transactions: (data.transactions || []).filter(t => !ids.has(t.id)) };
}

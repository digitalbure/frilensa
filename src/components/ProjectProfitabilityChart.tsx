import React, { useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Line, Area
} from 'recharts';
import { 
  DollarSign, TrendingUp, Clock, AlertCircle, CheckCircle2, 
  BarChart3, Activity, Layers, ArrowUpRight, Scale, ChevronDown, ChevronUp
} from 'lucide-react';
import { Project, ExpenseRecord, CRMDocument } from '../types';
import { getCurrencyConfig, formatCurrencyAmount, convertCurrency } from '../lib/currencies';

interface ProjectProfitabilityChartProps {
  projects: Project[];
  expenses?: ExpenseRecord[];
  documents?: CRMDocument[];
  defaultCurrency?: string;
}

export default function ProjectProfitabilityChart({
  projects,
  expenses = [],
  documents = [],
  defaultCurrency = 'FJD'
}: ProjectProfitabilityChartProps) {
  const [chartMetric, setChartMetric] = useState<'costs' | 'hours_vs_revenue'>('costs');
  const [sortBy, setSortBy] = useState<'profit' | 'margin' | 'revenue' | 'hours'>('profit');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const currencyConfig = getCurrencyConfig(defaultCurrency);

  // Compute financial metrics for each project
  const projectMetrics = useMemo(() => {
    return projects.map((proj) => {
      const projCurrency = proj.currency || defaultCurrency;
      const isForeign = projCurrency.toUpperCase() !== defaultCurrency.toUpperCase();

      // 1. Estimated Cost / Budget
      const rawEstimatedCost = proj.cost || 0;
      const { convertedAmount: baseEstimatedCost } = convertCurrency(rawEstimatedCost, projCurrency, defaultCurrency);

      // 2. Actual logged expenses linked to this project (expenses have their own currency or default)
      const linkedExpenses = expenses.filter(e => e.projectId === proj.id);
      const expenseCosts = linkedExpenses.reduce((sum, e) => {
        const expCurrency = (e as any).currency || defaultCurrency;
        const { convertedAmount } = convertCurrency(Number(e.amount) || 0, expCurrency, defaultCurrency);
        return sum + convertedAmount;
      }, 0);

      // 3. Tracked billable hours across all tasks
      const trackedHours = (proj.tasks || []).reduce((sum, t) => sum + (Number(t.trackedHours) || 0), 0);

      // Approximate labor cost if hourly rate is present
      const laborCost = (proj.tasks || []).reduce((sum, t) => {
        const rate = t.hourlyRate || (proj.rateType === 'hourly' ? proj.cost : 0);
        const { convertedAmount: baseRate } = convertCurrency(rate || 0, projCurrency, defaultCurrency);
        return sum + ((t.trackedHours || 0) * baseRate);
      }, 0);

      // Total actual cost (expenses + labor if tracked separately, or just expenses)
      const totalActualCost = expenseCosts + (proj.rateType === 'hourly' ? laborCost : 0);

      // 4. Invoiced / Paid Revenue linked to this project
      const linkedDocs = documents.filter(d => d.projectId === proj.id && d.type === 'invoice' && d.status !== 'cancelled');
      const invoicedRevenue = linkedDocs.reduce((sum, d) => {
        const docCurrency = d.currency || defaultCurrency;
        const { convertedAmount } = convertCurrency(Number(d.total) || 0, docCurrency, defaultCurrency);
        return sum + convertedAmount;
      }, 0);

      // Effective revenue: Invoiced if invoices exist, otherwise converted estimated cost/contract value
      const recognizedRevenue = invoicedRevenue > 0 ? invoicedRevenue : baseEstimatedCost;

      // Gross Profit and Profit Margin
      const grossProfit = recognizedRevenue - totalActualCost;
      const profitMargin = recognizedRevenue > 0 ? Math.round((grossProfit / recognizedRevenue) * 100) : (baseEstimatedCost > 0 ? 100 : 0);

      // Hourly Realization ($ / hour) in base currency
      const hourlyRealization = trackedHours > 0 ? Math.round(recognizedRevenue / trackedHours * 100) / 100 : 0;

      return {
        id: proj.id,
        name: proj.name.length > 18 ? proj.name.slice(0, 16) + '...' : proj.name,
        fullName: proj.name,
        currency: projCurrency,
        isForeign,
        rawEstimatedCost,
        estimatedCost: Math.round(baseEstimatedCost * 100) / 100,
        actualCost: Math.round(totalActualCost * 100) / 100,
        expenseCosts: Math.round(expenseCosts * 100) / 100,
        invoicedRevenue: Math.round(recognizedRevenue * 100) / 100,
        grossProfit: Math.round(grossProfit * 100) / 100,
        profitMargin,
        trackedHours: Number(trackedHours.toFixed(1)),
        hourlyRealization
      };
    });
  }, [projects, expenses, documents, defaultCurrency]);

  // Sort metrics based on user selection
  const sortedMetrics = useMemo(() => {
    return [...projectMetrics].sort((a, b) => {
      if (sortBy === 'profit') return b.grossProfit - a.grossProfit;
      if (sortBy === 'margin') return b.profitMargin - a.profitMargin;
      if (sortBy === 'revenue') return b.invoicedRevenue - a.invoicedRevenue;
      if (sortBy === 'hours') return b.trackedHours - a.trackedHours;
      return 0;
    });
  }, [projectMetrics, sortBy]);

  // Portfolio Totals
  const portfolioSummary = useMemo(() => {
    const totalEstimated = projectMetrics.reduce((sum, p) => sum + p.estimatedCost, 0);
    const totalActual = projectMetrics.reduce((sum, p) => sum + p.actualCost, 0);
    const totalRevenue = projectMetrics.reduce((sum, p) => sum + p.invoicedRevenue, 0);
    const totalProfit = totalRevenue - totalActual;
    const overallMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;
    const totalHours = projectMetrics.reduce((sum, p) => sum + p.trackedHours, 0);
    const avgRealization = totalHours > 0 ? Math.round(totalRevenue / totalHours * 100) / 100 : 0;

    return {
      totalEstimated,
      totalActual,
      totalRevenue,
      totalProfit,
      overallMargin,
      totalHours: Number(totalHours.toFixed(1)),
      avgRealization
    };
  }, [projectMetrics]);

  if (projects.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all text-left">
      {/* Header Bar */}
      <div 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="p-4 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-100/60 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-500 text-white flex items-center justify-center shadow-xs">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-800 tracking-tight font-sans">
                Project profitability
              </h3>
              <span className="bg-sky-100 text-sky-700 text-[9px] font-extrabold px-2 py-0.5 rounded-full border border-sky-200/60">
                {projects.length} {projects.length === 1 ? 'project' : 'projects'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Budget against actual costs, revenue and billable hours.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-4 sm:p-5 space-y-5 animate-fade-in">
          {/* Key KPI Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-slate-50/80 border border-slate-150/60 p-3 rounded-xl">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 block">Estimated budget</span>
              <span className="text-sm font-extrabold text-slate-800 font-mono mt-0.5 block">
                {defaultCurrency} ${portfolioSummary.totalEstimated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[8.5px] text-slate-400 mt-0.5 block">Planned project cost</span>
            </div>

            <div className="bg-amber-50/60 border border-amber-200/60 p-3 rounded-xl">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-700 block">Actual costs</span>
              <span className="text-sm font-extrabold text-amber-900 font-mono mt-0.5 block">
                {defaultCurrency} ${portfolioSummary.totalActual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[8.5px] text-amber-700/80 mt-0.5 block">Expenses so far</span>
            </div>

            <div className="bg-emerald-50/60 border border-emerald-200/60 p-3 rounded-xl">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-700 block">Gross profit</span>
              <span className="text-sm font-extrabold text-emerald-900 font-mono mt-0.5 block flex items-center gap-1">
                <span>{defaultCurrency} ${portfolioSummary.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="text-[10px] font-bold px-1 rounded bg-emerald-200/70 text-emerald-900">
                  {portfolioSummary.overallMargin}%
                </span>
              </span>
              <span className="text-[8.5px] text-emerald-700/80 mt-0.5 block">Revenue - actual costs</span>
            </div>

            <div className="bg-sky-50/60 border border-sky-200/60 p-3 rounded-xl">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-sky-700 block">Billable hours</span>
              <span className="text-sm font-extrabold text-sky-900 font-mono mt-0.5 block flex items-center gap-1">
                <span>{portfolioSummary.totalHours} hrs</span>
                <span className="text-[10px] font-normal text-sky-700">(@ ${portfolioSummary.avgRealization}/hr)</span>
              </span>
              <span className="text-[8.5px] text-sky-700/80 mt-0.5 block">Revenue per tracked hour</span>
            </div>
          </div>

          {/* Chart Controls Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 border-t border-slate-100">
            {/* View Switcher: Cost Comparison vs Hours vs Revenue */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl self-start">
              <button
                type="button"
                onClick={() => setChartMetric('costs')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  chartMetric === 'costs'
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-sky-600" />
                <span>Budget vs actual</span>
              </button>

              <button
                type="button"
                onClick={() => setChartMetric('hours_vs_revenue')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  chartMetric === 'hours_vs_revenue'
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                <span>Hours vs revenue</span>
              </button>
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="profit">Highest profit</option>
                <option value="margin">Highest margin %</option>
                <option value="revenue">Highest revenue</option>
                <option value="hours">Most hours</option>
              </select>
            </div>
          </div>

          {/* Recharts Visualization Container */}
          <div className="h-72 w-full bg-slate-50/40 rounded-xl p-2 border border-slate-100">
            {chartMetric === 'costs' ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sortedMetrics}
                  margin={{ top: 15, right: 15, left: 5, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickFormatter={(val) => `$${val}`}
                  />
                  <Tooltip 
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const item = sortedMetrics.find(m => m.name === label);
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-800 text-xs space-y-1.5 min-w-[220px]">
                            <div className="border-b border-slate-800 pb-1 flex items-center justify-between gap-2">
                              <p className="font-bold text-sky-400 truncate">{item?.fullName || label}</p>
                              {item?.isForeign && (
                                <span className="bg-sky-950 text-sky-300 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold border border-sky-800 shrink-0">
                                  {item.currency} project
                                </span>
                              )}
                            </div>
                            <div className="flex justify-between text-slate-300">
                              <span>Estimated budget:</span>
                              <div className="text-right">
                                <span className="font-mono font-bold text-white">${item?.estimatedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {defaultCurrency}</span>
                                {item?.isForeign && (
                                  <span className="block text-[9px] font-mono text-sky-300">
                                    (Original: {item.currency} ${item.rawEstimatedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex justify-between text-amber-300">
                              <span>Actual cost:</span>
                              <span className="font-mono font-bold text-amber-300">${item?.actualCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {defaultCurrency}</span>
                            </div>
                            <div className="flex justify-between text-emerald-400">
                              <span>Revenue:</span>
                              <span className="font-mono font-bold text-emerald-400">${item?.invoicedRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {defaultCurrency}</span>
                            </div>
                            <div className="flex justify-between text-slate-300 pt-1 border-t border-slate-800 font-semibold">
                              <span>Gross profit (margin):</span>
                              <span className={`font-mono ${(item?.grossProfit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                ${item?.grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({item?.profitMargin}%)
                              </span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend 
                    wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} 
                  />
                  <Bar dataKey="estimatedCost" name="Estimated budget ($)" fill="#0284c7" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="actualCost" name="Actual cost ($)" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="invoicedRevenue" name="Revenue ($)" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={sortedMetrics}
                  margin={{ top: 15, right: 15, left: 5, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                  />
                  <YAxis 
                    yAxisId="left"
                    orientation="left"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(val) => `${val}h`}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 10, fill: '#10b981' }}
                    tickFormatter={(val) => `$${val}`}
                  />
                  <Tooltip 
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const item = sortedMetrics.find(m => m.name === label);
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-800 text-xs space-y-1.5 min-w-[220px]">
                            <div className="border-b border-slate-800 pb-1 flex items-center justify-between gap-2">
                              <p className="font-bold text-sky-400 truncate">{item?.fullName || label}</p>
                              {item?.isForeign && (
                                <span className="bg-sky-950 text-sky-300 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold border border-sky-800 shrink-0">
                                  {item.currency} project
                                </span>
                              )}
                            </div>
                            <div className="flex justify-between text-sky-300">
                              <span>Tracked hours:</span>
                              <span className="font-mono font-bold text-white">{item?.trackedHours} hrs</span>
                            </div>
                            <div className="flex justify-between text-emerald-400">
                              <span>Revenue:</span>
                              <span className="font-mono font-bold text-emerald-400">${item?.invoicedRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {defaultCurrency}</span>
                            </div>
                            <div className="flex justify-between text-slate-300 pt-1 border-t border-slate-800">
                              <span>Revenue per hour:</span>
                              <span className="font-mono font-bold text-amber-300">${item?.hourlyRealization}/hr ({defaultCurrency})</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar yAxisId="left" dataKey="trackedHours" name="Billable hours" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Line yAxisId="right" type="monotone" dataKey="invoicedRevenue" name={`Revenue (${defaultCurrency} $)`} stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981' }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Project Profit Margin Cards Strip */}
          <div className="space-y-1.5">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 block">
              By project (in {defaultCurrency})
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {sortedMetrics.map((p) => {
                const isHealthy = p.profitMargin >= 40;
                const isModerate = p.profitMargin >= 15 && p.profitMargin < 40;

                return (
                  <div 
                    key={p.id}
                    className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col justify-between gap-2"
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800 text-xs truncate block" title={p.fullName}>
                          {p.fullName}
                        </span>
                        {p.isForeign && (
                          <span className="text-[8px] font-mono text-sky-600 font-semibold">
                            {p.currency} {p.rawEstimatedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                      <span className={`text-[8.5px] font-extrabold px-1.5 py-0.5 rounded shrink-0 ${
                        isHealthy ? 'bg-emerald-100 text-emerald-800' :
                        isModerate ? 'bg-amber-100 text-amber-800' :
                        'bg-rose-100 text-rose-800'
                      }`}>
                        {p.profitMargin}% margin
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1 text-[9px] pt-1 border-t border-slate-100 text-slate-500">
                      <div>
                        <span className="text-[7.5px] text-slate-400 block uppercase">Estimate</span>
                        <span className="font-mono font-bold text-slate-700">${p.estimatedCost}</span>
                      </div>
                      <div>
                        <span className="text-[7.5px] text-amber-600 block uppercase">Actual</span>
                        <span className="font-mono font-bold text-amber-700">${p.actualCost}</span>
                      </div>
                      <div>
                        <span className="text-[7.5px] text-emerald-600 block uppercase">Profit</span>
                        <span className="font-mono font-bold text-emerald-700">${p.grossProfit}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

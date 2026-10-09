import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Briefcase, FileText, CheckCircle2, Clock, CreditCard, ArrowUpRight, 
  Calendar, CheckSquare, ListChecks, Percent, ChevronRight, ChevronDown,
  Sparkles, MessageSquare, Send, Eye, Download, Check, AlertCircle,
  TrendingUp, ShieldCheck, Waves, Layers, Activity, AlertTriangle,
  Receipt, ArrowRight, ArrowDownRight, CornerDownRight, Tag
} from 'lucide-react';
import { Project, Business, CRMDocument, Client } from '../types';

interface ClientOverviewViewProps {
  clientAuth: {
    email: string;
    clientName: string;
    clientId: string;
    consultantId: string;
  };
  clientProfile: Client | null;
  primaryBusiness: Business;
  businesses: Business[];
  documents: any[];
  projects: Project[];
  services: any[];
  brandColor: string;
  renderBrandLogo: (biz: any, size?: 'sm' | 'md' | 'lg') => React.ReactNode;
  onSelectDocument: (doc: any) => void;
  onPayInvoice: (doc: any) => void;
  onInquireAboutProject: (project: Project) => void;
  onInquireAboutDoc: (doc: any) => void;
  onNavigateToDocuments: () => void;
  onNavigateToSupport: () => void;
}

export default function ClientOverviewView({
  clientAuth,
  clientProfile,
  primaryBusiness,
  businesses,
  documents,
  projects,
  services,
  brandColor,
  renderBrandLogo,
  onSelectDocument,
  onPayInvoice,
  onInquireAboutProject,
  onInquireAboutDoc,
  onNavigateToDocuments,
  onNavigateToSupport,
}: ClientOverviewViewProps) {
  // Expanded project scope section states
  const [expandedProjectIds, setExpandedProjectIds] = useState<Record<string, boolean>>({});
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'invoice' | 'quote' | 'receipt'>('all');

  const toggleProjectExpand = (projId: string) => {
    setExpandedProjectIds(prev => ({
      ...prev,
      [projId]: !prev[projId]
    }));
  };

  // Filter projects specific to this logged-in client
  const clientProjects = useMemo(() => {
    const cId = clientProfile?.id || clientAuth.clientId;
    const cEmail = clientAuth.email?.toLowerCase();
    const cName = clientAuth.clientName?.toLowerCase();

    const filtered = projects.filter(p => {
      if (p.clientId && cId && p.clientId === cId) return true;
      if (cEmail && p.description?.toLowerCase().includes(cEmail)) return true;
      if (cName && (p.name.toLowerCase().includes(cName) || p.description?.toLowerCase().includes(cName))) return true;
      if (cName?.includes('pacific') || cName?.includes('airways')) {
        return p.id === 'proj-1';
      }
      if (cName?.includes('resort') || cName?.includes('harbour')) {
        return p.id === 'proj-2';
      }
      return false;
    });

    // If matching yields none (e.g. generic testing), fallback to projects matching client ID or return all demo projects if single-client
    if (filtered.length === 0 && projects.length > 0) {
      const fallback = projects.filter(p => p.clientId === cId || !p.clientId);
      return fallback.length > 0 ? fallback : [projects[0]];
    }

    return filtered;
  }, [projects, clientProfile, clientAuth]);

  // Pending unpaid invoices specific to this logged in client
  const pendingInvoices = useMemo(() => {
    return documents.filter(d => d.type === 'invoice' && (d.status === 'sent' || d.status === 'draft'));
  }, [documents]);

  // Total outstanding balance
  const outstandingTotal = useMemo(() => {
    return pendingInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  }, [pendingInvoices]);

  // Total paid invoices + receipts
  const paidTotal = useMemo(() => {
    return documents
      .filter(d => (d.type === 'invoice' && d.status === 'paid') || d.type === 'receipt')
      .reduce((sum, d) => sum + (d.total || 0), 0);
  }, [documents]);

  // Filtered timeline documents (chronologically sorted)
  const timelineDocuments = useMemo(() => {
    const sorted = [...documents].sort((a, b) => new Date(b.issueDate || 0).getTime() - new Date(a.issueDate || 0).getTime());
    if (timelineFilter === 'all') return sorted;
    return sorted.filter(d => d.type === timelineFilter);
  }, [documents, timelineFilter]);

  // Helper to format date nicely
  const formatDateDisplay = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Welcome Lounge & Client Identity Banner */}
      <div 
        className="text-white p-4.5 rounded-2xl relative overflow-hidden shadow-md transition-all"
        style={{
          background: `linear-gradient(135deg, ${brandColor} 0%, #0f172a 100%)`
        }}
      >
        <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-15 pointer-events-none">
          <Waves className="w-36 h-36 text-white" />
        </div>

        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-amber-300 text-[9.5px] font-bold tracking-wider uppercase">
              <Sparkles className="w-3 h-3 fill-amber-300" /> Client Overview Workspace
            </div>
            <h3 className="text-base font-bold tracking-tight text-white font-display">
              Bula Vinaka, {clientAuth.clientName}
            </h3>
            <p className="text-[10px] text-white/80 leading-snug">
              Welcome to your dedicated project, billing, and document management hub with <strong>{primaryBusiness.name}</strong>.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-2 text-[9px] text-white/70">
              <span className="bg-white/15 px-2 py-0.5 rounded-full backdrop-blur-xs font-mono">
                Client TIN: {clientProfile?.tin || '99-12345-0-0'}
              </span>
              <span className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 rounded-full backdrop-blur-xs font-semibold flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5" /> Portal Verified
              </span>
            </div>
          </div>

          <div className="shrink-0 bg-white/10 p-2 rounded-2xl backdrop-blur-xs border border-white/20 shadow-xs">
            {renderBrandLogo(primaryBusiness, 'lg')}
          </div>
        </div>
      </div>

      {/* 2. Key Executive Summary Metric Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Active Projects */}
        <div className="bg-white p-3 rounded-xl border border-zinc-150 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[8.5px] text-zinc-400 font-bold uppercase tracking-wider">
              Active Projects
            </span>
            <div className="w-5 h-5 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <Briefcase className="w-3 h-3" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-zinc-900 font-display">
              {clientProjects.length}
            </span>
            <span className="text-[9px] text-zinc-500 font-medium">
              underway
            </span>
          </div>
        </div>

        {/* Pending Invoices */}
        <div className={`p-3 rounded-xl border shadow-xs space-y-1 ${
          outstandingTotal > 0 
            ? 'bg-amber-50/40 border-amber-200 text-amber-950' 
            : 'bg-white border-zinc-150 text-zinc-900'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[8.5px] font-bold uppercase tracking-wider text-zinc-400">
              Pending Invoices
            </span>
            <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${
              outstandingTotal > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-600'
            }`}>
              <CreditCard className="w-3 h-3" />
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-sm font-bold font-mono ${outstandingTotal > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              FJD {outstandingTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            {pendingInvoices.length > 0 && (
              <span className="text-[8.5px] px-1 py-0.2 rounded font-bold bg-amber-200/60 text-amber-900">
                {pendingInvoices.length} due
              </span>
            )}
          </div>
        </div>

        {/* Total Settled to Date */}
        <div className="bg-white p-3 rounded-xl border border-zinc-150 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[8.5px] text-zinc-400 font-bold uppercase tracking-wider">
              Settled to Date
            </span>
            <div className="w-5 h-5 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-3 h-3" />
            </div>
          </div>
          <span className="text-sm font-bold font-mono text-emerald-700 block">
            FJD {paidTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>

        {/* Active Retainers / Subscriptions */}
        <div className="bg-white p-3 rounded-xl border border-zinc-150 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[8.5px] text-zinc-400 font-bold uppercase tracking-wider">
              Active Retainers
            </span>
            <div className="w-5 h-5 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Layers className="w-3 h-3" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-zinc-900 font-display">
              {clientProfile?.subscriptions?.length || 0}
            </span>
            <span className="text-[9px] text-zinc-500 font-medium">
              plans
            </span>
          </div>
        </div>
      </div>

      {/* 3. Active Projects Section */}
      <div className="bg-white rounded-2xl border border-zinc-150 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <Briefcase className="w-3.5 h-3.5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-zinc-900 tracking-tight">
                Active Projects & Engagements
              </h4>
              <span className="text-[9px] text-zinc-400 block">
                Deliverables, progress tracking, and scheduled timelines
              </span>
            </div>
          </div>
          <span className="text-[9px] font-mono font-bold bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-full">
            {clientProjects.length} Project{clientProjects.length === 1 ? '' : 's'}
          </span>
        </div>

        {clientProjects.length === 0 ? (
          <div className="bg-zinc-50 border border-dashed border-zinc-200 rounded-xl p-6 text-center space-y-2">
            <Briefcase className="w-6 h-6 text-zinc-300 mx-auto" />
            <p className="text-xs text-zinc-600 font-medium">No active projects currently listed for your account.</p>
            <p className="text-[10px] text-zinc-400 max-w-xs mx-auto">
              Any agreed project milestones, deliverables, and timelines will be displayed here in real-time.
            </p>
            <button
              onClick={onNavigateToSupport}
              className="text-[10px] text-sky-600 font-bold hover:underline inline-flex items-center gap-1 mt-1"
            >
              <MessageSquare className="w-3 h-3" /> Inquire about a new project engagement
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {clientProjects.map((project) => {
              const matchedBiz = businesses.find(b => b.id === project.businessId) || primaryBusiness;
              const isExpanded = !!expandedProjectIds[project.id];
              
              // Task progress calculation
              const totalTasks = project.tasks?.length || 0;
              const doneTasks = project.tasks?.filter(t => t.status === 'done').length || 0;
              const inProgressTasks = project.tasks?.filter(t => t.status === 'in_progress').length || 0;
              const progressPercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 50;

              // Status styles
              let statusLabel = 'In Progress';
              let statusClasses = 'bg-sky-50 text-sky-700 border-sky-200';
              if (project.status === 'completed') {
                statusLabel = 'Completed';
                statusClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
              } else if (project.status === 'not_started') {
                statusLabel = 'Scheduled / Upcoming';
                statusClasses = 'bg-zinc-100 text-zinc-700 border-zinc-200';
              } else if (project.status === 'on_hold') {
                statusLabel = 'On Hold';
                statusClasses = 'bg-amber-50 text-amber-700 border-amber-200';
              }

              return (
                <div 
                  key={project.id}
                  className="bg-zinc-50/70 border border-zinc-200/80 rounded-xl p-3.5 space-y-3 hover:border-zinc-300 transition-all shadow-2xs"
                >
                  {/* Top Row: Title, Venture, Status Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      {renderBrandLogo(matchedBiz, 'sm')}
                      <div className="min-w-0">
                        <h5 className="text-xs font-bold text-zinc-900 tracking-tight leading-snug">
                          {project.name}
                        </h5>
                        <span className="text-[9px] text-zinc-500 block truncate">
                          Venture: <strong>{matchedBiz.name}</strong>
                        </span>
                      </div>
                    </div>
                    <span className={`text-[8px] font-extrabold uppercase px-2 py-0.5 rounded-full border shrink-0 ${statusClasses}`}>
                      {statusLabel}
                    </span>
                  </div>

                  {/* Project Description */}
                  {project.description && (
                    <p className="text-[10.5px] text-zinc-600 leading-relaxed">
                      {project.description}
                    </p>
                  )}

                  {/* Key Metrics Row */}
                  <div className="grid grid-cols-3 gap-2 bg-white p-2.5 rounded-lg border border-zinc-150 text-[9.5px]">
                    <div>
                      <span className="text-[8px] text-zinc-400 font-bold uppercase block">Budget / Value</span>
                      <span className="font-mono font-bold text-zinc-900 block mt-0.5">
                        FJD ${project.cost?.toLocaleString() || '0'}
                      </span>
                      <span className="text-[7.5px] text-zinc-400 capitalize">({project.rateType || 'flat'})</span>
                    </div>

                    <div>
                      <span className="text-[8px] text-zinc-400 font-bold uppercase block">Timeline Window</span>
                      <span className="font-medium text-zinc-800 block mt-0.5 truncate">
                        {formatDateDisplay(project.startDate)}
                      </span>
                      <span className="text-[7.5px] text-zinc-400 truncate">to {formatDateDisplay(project.endDate)}</span>
                    </div>

                    <div>
                      <span className="text-[8px] text-zinc-400 font-bold uppercase block">Milestones</span>
                      <span className="font-semibold text-zinc-800 block mt-0.5">
                        {doneTasks}/{totalTasks} Done
                      </span>
                      <span className="text-[7.5px] text-emerald-600 font-bold">{progressPercent}% complete</span>
                    </div>
                  </div>

                  {/* Visual Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[8.5px] font-semibold text-zinc-500">
                      <span>Milestone Completion</span>
                      <span className="font-mono">{progressPercent}%</span>
                    </div>
                    <div className="w-full h-2 bg-zinc-200 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPercent}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: brandColor }}
                      />
                    </div>
                  </div>

                  {/* Tasks & Scope Deliverables Checklist */}
                  {project.tasks && project.tasks.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                        <span>Scope Deliverables & Tasks</span>
                        <button
                          onClick={() => toggleProjectExpand(project.id)}
                          className="text-sky-600 hover:text-sky-800 flex items-center gap-0.5 capitalize text-[9px]"
                        >
                          {isExpanded ? 'Collapse' : 'Show All'}
                          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {(isExpanded ? project.tasks : project.tasks.slice(0, 2)).map((task) => (
                          <div 
                            key={task.id} 
                            className="bg-white p-2 rounded-lg border border-zinc-150 flex items-center justify-between text-[10px] gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {task.status === 'done' ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              ) : task.status === 'in_progress' ? (
                                <Clock className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                              ) : (
                                <div className="w-3.5 h-3.5 rounded-full border border-zinc-300 shrink-0" />
                              )}
                              <span className={`truncate ${task.status === 'done' ? 'line-through text-zinc-400' : 'text-zinc-800 font-medium'}`}>
                                {task.title}
                              </span>
                            </div>
                            <span className={`text-[7.5px] font-bold uppercase px-1.5 py-0.2 rounded shrink-0 ${
                              task.status === 'done' ? 'bg-emerald-50 text-emerald-700' :
                              task.status === 'in_progress' ? 'bg-sky-50 text-sky-700 font-semibold' :
                              'bg-zinc-100 text-zinc-500'
                            }`}>
                              {task.status === 'done' ? 'Done' : task.status === 'in_progress' ? 'Active' : 'Queued'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Project Action Footer */}
                  <div className="pt-2 border-t border-zinc-200/70 flex items-center justify-between gap-2">
                    <button
                      onClick={() => onInquireAboutProject(project)}
                      className="text-[9.5px] font-bold text-zinc-700 hover:text-zinc-950 bg-white hover:bg-zinc-100 border border-zinc-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                    >
                      <MessageSquare className="w-3 h-3 text-sky-600" />
                      Inquire on Project
                    </button>
                    <button
                      onClick={onNavigateToDocuments}
                      className="text-[9.5px] font-bold text-sky-600 hover:text-sky-800 flex items-center gap-1 transition-colors"
                    >
                      View Associated Invoices <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Pending Invoices Section (High-priority payment actions) */}
      <div className="bg-white rounded-2xl border border-zinc-150 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
              pendingInvoices.length > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
            }`}>
              <CreditCard className="w-3.5 h-3.5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-zinc-900 tracking-tight">
                Pending Invoices & Remittance Requests
              </h4>
              <span className="text-[9px] text-zinc-400 block">
                Direct settlement via Vodafone M-Paisa, Digicel MyCash, or Fiji Bank Wire
              </span>
            </div>
          </div>
          {pendingInvoices.length > 0 && (
            <span className="text-[9px] font-mono font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
              FJD ${outstandingTotal.toFixed(2)} Due
            </span>
          )}
        </div>

        {pendingInvoices.length === 0 ? (
          <div className="bg-emerald-50/50 border border-emerald-150 rounded-xl p-5 text-center space-y-1.5">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <Check className="w-4 h-4 stroke-[3]" />
            </div>
            <h5 className="text-xs font-bold text-emerald-950">All Invoices Settled</h5>
            <p className="text-[10px] text-emerald-800 leading-snug max-w-xs mx-auto">
              You have no outstanding invoices due. Vinaka vakalevu for keeping your account current!
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {pendingInvoices.map((inv) => {
              const matchedBiz = businesses.find(b => b.id === inv.businessId) || primaryBusiness;
              const isOverdue = inv.dueDate && new Date(inv.dueDate).getTime() < new Date().getTime();

              return (
                <div 
                  key={inv.id}
                  className="bg-white border-2 border-amber-150 rounded-xl p-3.5 space-y-3 shadow-2xs hover:border-amber-300 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {renderBrandLogo(matchedBiz, 'sm')}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-zinc-950">
                            Invoice #{inv.documentNumber}
                          </span>
                          <span className={`text-[7.5px] font-extrabold uppercase px-1.5 py-0.2 rounded ${
                            isOverdue ? 'bg-rose-100 text-rose-800 font-black' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {isOverdue ? 'Overdue' : 'Payment Due'}
                          </span>
                        </div>
                        <span className="text-[9px] text-zinc-500 block truncate">
                          Issued by {matchedBiz.name} • Due {formatDateDisplay(inv.dueDate || inv.issueDate)}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono text-sm font-bold text-zinc-950 block">
                        FJD {inv.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                      {inv.vatAmount && (
                        <span className="text-[8px] text-zinc-400 block">
                          (incl. FJD ${inv.vatAmount.toFixed(2)} VAT)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Items Preview */}
                  {inv.items && inv.items.length > 0 && (
                    <div className="bg-zinc-50 rounded-lg p-2 text-[10px] space-y-1 border border-zinc-150">
                      {inv.items.map((item: any, iIdx: number) => (
                        <div key={iIdx} className="flex justify-between text-zinc-700">
                          <span className="truncate pr-2 font-medium">• {item.name}</span>
                          <span className="font-mono font-semibold shrink-0">
                            FJD {item.total?.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions Row */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => onSelectDocument(inv)}
                      className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold py-2 rounded-xl text-[10.5px] flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5 text-zinc-500" /> View Tax Invoice
                    </button>
                    <button
                      onClick={() => onPayInvoice(inv)}
                      className="flex-1 text-white font-bold py-2 rounded-xl text-[10.5px] shadow-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
                      style={{ backgroundColor: brandColor }}
                    >
                      <CreditCard className="w-3.5 h-3.5" /> Pay / Submit Proof
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Document History Timeline */}
      <div className="bg-white rounded-2xl border border-zinc-150 p-4 shadow-xs space-y-3.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Calendar className="w-3.5 h-3.5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-zinc-900 tracking-tight">
                Document History Timeline
              </h4>
              <span className="text-[9px] text-zinc-400 block">
                Chronological ledger of quotes, tax invoices, and payment receipts
              </span>
            </div>
          </div>

          {/* Timeline Type Filters */}
          <div className="flex bg-zinc-100 p-0.5 rounded-lg text-[8.5px] font-bold">
            {(['all', 'invoice', 'receipt', 'quote'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setTimelineFilter(filter)}
                className={`px-2 py-1 rounded-md capitalize transition-all ${
                  timelineFilter === filter
                    ? 'bg-white text-zinc-900 shadow-2xs font-extrabold'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                {filter === 'all' ? 'All' : `${filter}s`}
              </button>
            ))}
          </div>
        </div>

        {timelineDocuments.length === 0 ? (
          <div className="bg-zinc-50 border border-dashed border-zinc-200 rounded-xl p-6 text-center text-xs text-zinc-400">
            No document history found for the selected filter.
          </div>
        ) : (
          <div className="relative pl-5 space-y-3 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-200">
            {timelineDocuments.map((docItem, index) => {
              const matchedBiz = businesses.find(b => b.id === docItem.businessId) || primaryBusiness;
              
              // Timeline Icon & Color mapping
              let nodeColor = 'bg-sky-500 text-white ring-4 ring-sky-100';
              let NodeIcon = FileText;
              let badgeStyle = 'bg-zinc-100 text-zinc-600';

              if (docItem.type === 'receipt') {
                nodeColor = 'bg-emerald-500 text-white ring-4 ring-emerald-100';
                NodeIcon = CheckCircle2;
                badgeStyle = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
              } else if (docItem.type === 'quote') {
                nodeColor = 'bg-purple-500 text-white ring-4 ring-purple-100';
                NodeIcon = Sparkles;
                badgeStyle = docItem.status === 'accepted' ? 'bg-zinc-900 text-white' : 'bg-purple-50 text-purple-700 border border-purple-200';
              } else {
                if (docItem.status === 'paid') {
                  nodeColor = 'bg-emerald-600 text-white ring-4 ring-emerald-100';
                  badgeStyle = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
                } else {
                  nodeColor = 'bg-amber-500 text-white ring-4 ring-amber-100';
                  badgeStyle = 'bg-amber-50 text-amber-700 border border-amber-200';
                }
              }

              return (
                <div key={docItem.id} className="relative group">
                  {/* Timeline Node Dot */}
                  <div className={`absolute -left-5 top-2.5 w-4 h-4 rounded-full flex items-center justify-center ${nodeColor} z-10 shadow-2xs`}>
                    <NodeIcon className="w-2.5 h-2.5" />
                  </div>

                  {/* Timeline Card */}
                  <div 
                    onClick={() => onSelectDocument(docItem)}
                    className="bg-zinc-50/70 hover:bg-zinc-50 border border-zinc-200/80 hover:border-zinc-300 rounded-xl p-3 space-y-2 cursor-pointer transition-all shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-zinc-900 capitalize">
                          {docItem.type} #{docItem.documentNumber}
                        </span>
                        <span className={`text-[7.5px] font-extrabold uppercase px-1.5 py-0.2 rounded ${badgeStyle}`}>
                          {docItem.status}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono text-zinc-400">
                        {formatDateDisplay(docItem.issueDate)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-zinc-600">
                      <span className="truncate pr-2 font-medium">
                        {docItem.items?.[0]?.name || `${matchedBiz.name} Item`}
                        {docItem.items?.length > 1 && ` (+${docItem.items.length - 1} more)`}
                      </span>
                      <span className="font-mono font-bold text-zinc-950 shrink-0">
                        FJD {docItem.total?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[8.5px] text-zinc-400 pt-1 border-t border-zinc-200/50">
                      <span>Issuer: <strong className="text-zinc-600 font-semibold">{matchedBiz.name}</strong></span>
                      <span className="text-sky-600 font-bold flex items-center gap-0.5 group-hover:underline">
                        View Details <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="pt-2 text-center">
          <button
            onClick={onNavigateToDocuments}
            className="text-[10px] font-bold text-zinc-600 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-colors"
          >
            <FileText className="w-3 h-3 text-zinc-400" /> Open Complete Document Registry
          </button>
        </div>
      </div>
    </div>
  );
}

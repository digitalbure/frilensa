import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Briefcase, CheckCircle2, Clock, Play, Pause, ChevronRight, 
  FileText, Plus, GripVertical, AlertCircle, Sparkles, MoreVertical,
  Calendar, Layers, ArrowRight, Check
} from 'lucide-react';
import { Project, Client, CRMData } from '../types';
import ProjectCurrencyDisplay from './ProjectCurrencyDisplay';
import { resolveProjectCurrency, convertCurrency, getCurrencyConfig } from '../lib/currencies';

interface ProjectKanbanBoardProps {
  projects: Project[];
  clients: Client[];
  baseCurrency?: string;
  activeTimerTaskId?: string | null;
  runningProjectId?: string | null;
  onSelectProject: (project: Project) => void;
  onUpdateProjectStatus: (projectId: string, newStatus: 'lead' | 'in_progress' | 'pending_review' | 'completed') => void;
  onNewProject: (defaultStatus?: 'lead' | 'in_progress' | 'pending_review' | 'completed') => void;
  onEditProject?: (project: Project) => void;
}

interface KanbanColumn {
  id: 'lead' | 'in_progress' | 'pending_review' | 'completed';
  title: string;
  badgeColor: string;
  borderColor: string;
  bgHeaderColor: string;
  icon: React.ReactNode;
  description: string;
}

const KANBAN_COLUMNS: KanbanColumn[] = [
  {
    id: 'lead',
    title: 'Lead',
    badgeColor: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    borderColor: 'border-indigo-200',
    bgHeaderColor: 'bg-indigo-50/70',
    icon: <Sparkles className="w-3.5 h-3.5 text-indigo-600" />,
    description: 'Enquiries, proposals and scoping'
  },
  {
    id: 'in_progress',
    title: 'In progress',
    badgeColor: 'bg-sky-100 text-sky-700 border-sky-200',
    borderColor: 'border-sky-200',
    bgHeaderColor: 'bg-sky-50/70',
    icon: <Clock className="w-3.5 h-3.5 text-sky-600" />,
    description: 'Work under way'
  },
  {
    id: 'pending_review',
    title: 'Pending review',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    borderColor: 'border-amber-200',
    bgHeaderColor: 'bg-amber-50/70',
    icon: <AlertCircle className="w-3.5 h-3.5 text-amber-600" />,
    description: 'Waiting on client review or sign-off'
  },
  {
    id: 'completed',
    title: 'Completed',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    borderColor: 'border-emerald-200',
    bgHeaderColor: 'bg-emerald-50/70',
    icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
    description: 'Delivered and invoiced'
  }
];

export default function ProjectKanbanBoard({
  projects,
  clients,
  baseCurrency = 'FJD',
  activeTimerTaskId,
  runningProjectId,
  onSelectProject,
  onUpdateProjectStatus,
  onNewProject,
  onEditProject
}: ProjectKanbanBoardProps) {
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [statusMenuOpenProjId, setStatusMenuOpenProjId] = useState<string | null>(null);

  // Normalize project status to one of the 4 Kanban columns
  const getNormalizedStatus = (status: Project['status']): 'lead' | 'in_progress' | 'pending_review' | 'completed' => {
    if (status === 'lead' || status === 'not_started') return 'lead';
    if (status === 'in_progress') return 'in_progress';
    if (status === 'pending_review' || status === 'on_hold') return 'pending_review';
    if (status === 'completed') return 'completed';
    return 'in_progress';
  };

  // Group projects into their columns
  const projectsByColumn = KANBAN_COLUMNS.reduce((acc, col) => {
    acc[col.id] = projects.filter(p => getNormalizedStatus(p.status) === col.id);
    return acc;
  }, {} as Record<string, Project[]>);

  // Drag Event Handlers
  const handleDragStart = (e: React.DragEvent, projectId: string) => {
    setDraggedProjectId(projectId);
    e.dataTransfer.setData('text/plain', projectId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedProjectId(null);
    setDragOverColumnId(null);
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumnId !== colId) {
      setDragOverColumnId(colId);
    }
  };

  const handleDragLeave = (e: React.DragEvent, colId: string) => {
    // Check if we left the column container completely
    if (dragOverColumnId === colId) {
      setDragOverColumnId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetColId: 'lead' | 'in_progress' | 'pending_review' | 'completed') => {
    e.preventDefault();
    const droppedId = e.dataTransfer.getData('text/plain') || draggedProjectId;
    if (droppedId) {
      onUpdateProjectStatus(droppedId, targetColId);
    }
    setDraggedProjectId(null);
    setDragOverColumnId(null);
  };

  const baseCfg = getCurrencyConfig(baseCurrency);

  return (
    <div className="w-full select-none text-left">
      {/* Kanban Grid Container (4 Responsive Columns) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {KANBAN_COLUMNS.map((column) => {
          const colProjects = projectsByColumn[column.id] || [];
          const isDraggingOverThis = dragOverColumnId === column.id;
          
          // Calculate total valuation in base currency
          const columnTotalValueInBase = colProjects.reduce((sum, p) => {
            const client = clients.find(c => c.id === p.clientId);
            const projCurr = resolveProjectCurrency(p, client, baseCurrency);
            const { convertedAmount } = convertCurrency(Number(p.cost) || 0, projCurr, baseCurrency);
            return sum + convertedAmount;
          }, 0);

          return (
            <div
              key={column.id}
              onDragOver={(e) => handleDragOver(e, column.id)}
              onDragLeave={(e) => handleDragLeave(e, column.id)}
              onDrop={(e) => handleDrop(e, column.id)}
              className={`flex flex-col bg-slate-50/70 rounded-2xl border transition-all duration-200 min-h-[480px] ${
                isDraggingOverThis 
                  ? 'border-sky-400 ring-2 ring-sky-300/40 bg-sky-50/40 shadow-md' 
                  : 'border-slate-200/80 shadow-2xs hover:border-slate-300/80'
              }`}
            >
              {/* Column Header */}
              <div className={`p-3 rounded-t-2xl border-b border-slate-200/70 ${column.bgHeaderColor} flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded-lg bg-white shadow-2xs">
                    {column.icon}
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-bold text-slate-800 tracking-tight">
                        {column.title}
                      </h4>
                      <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full border ${column.badgeColor}`}>
                        {colProjects.length}
                      </span>
                    </div>
                    <span className="text-[9px] text-slate-500 font-mono block">
                      {baseCfg.symbol}{columnTotalValueInBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onNewProject(column.id)}
                  title={`Add project to ${column.title}`}
                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-white/80 rounded-lg transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Column Cards Container */}
              <div className="p-2.5 flex-1 flex flex-col gap-2.5 overflow-y-auto max-h-[700px]">
                {colProjects.length === 0 ? (
                  <div className={`flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl text-center transition-colors ${
                    isDraggingOverThis ? 'border-sky-300 bg-sky-50/50 text-sky-700' : 'border-slate-200 text-slate-400'
                  }`}>
                    <p className="text-[11px] font-medium">
                      {isDraggingOverThis ? 'Drop project here' : 'No projects in this stage'}
                    </p>
                    <button
                      type="button"
                      onClick={() => onNewProject(column.id)}
                      className="mt-2 text-[10px] text-sky-600 hover:text-sky-700 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add project
                    </button>
                  </div>
                ) : (
                  <AnimatePresence>
                    {colProjects.map((proj) => {
                      const client = clients.find(c => c.id === proj.clientId);
                      const isDragged = draggedProjectId === proj.id;
                      const hasRunningTimer = runningProjectId === proj.id;
                      const totalTasks = (proj.tasks || []).length;
                      const completedTasks = (proj.tasks || []).filter(t => t.status === 'done' || (t as any).completed).length;
                      const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                      const totalTrackedHours = (proj.tasks || []).reduce((sum, t) => sum + (t.trackedHours || 0), 0);

                      const isMenuOpen = statusMenuOpenProjId === proj.id;

                      return (
                        <motion.div
                          key={proj.id}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          draggable
                          onDragStart={(e) => handleDragStart(e as any, proj.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => onSelectProject(proj)}
                          className={`group bg-white p-3 rounded-xl border transition-all cursor-grab active:cursor-grabbing relative flex flex-col gap-2 shadow-2xs hover:shadow-md ${
                            isDragged ? 'opacity-40 border-dashed border-sky-400 scale-95' : 
                            hasRunningTimer ? 'border-sky-300 ring-1 ring-sky-300' : 
                            'border-slate-200/90 hover:border-sky-200'
                          }`}
                        >
                          {/* Card Top Row: Grip Handle, Client & Status Menu */}
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-slate-300 group-hover:text-slate-500 transition-colors shrink-0">
                                <GripVertical className="w-3.5 h-3.5" />
                              </span>
                              <div className="min-w-0">
                                <span className="text-[9.5px] font-bold text-slate-400 truncate block">
                                  {client ? client.name : 'No client'}
                                </span>
                              </div>
                            </div>

                            {/* Status Quick Switcher Menu */}
                            <div className="relative" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setStatusMenuOpenProjId(isMenuOpen ? null : proj.id)}
                                title="Change stage"
                                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                              >
                                <MoreVertical className="w-3 h-3" />
                              </button>

                              {isMenuOpen && (
                                <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 shadow-xl rounded-xl p-1 z-30 min-w-[140px] flex flex-col gap-0.5 animate-in fade-in zoom-in-95">
                                  <span className="text-[8.5px] font-extrabold text-slate-400 px-2 py-0.5 uppercase tracking-wider">
                                    Move to
                                  </span>
                                  {KANBAN_COLUMNS.map((c) => (
                                    <button
                                      key={c.id}
                                      type="button"
                                      onClick={() => {
                                        setStatusMenuOpenProjId(null);
                                        onUpdateProjectStatus(proj.id, c.id);
                                      }}
                                      className={`text-left px-2 py-1 rounded-lg text-[10px] font-bold flex items-center justify-between cursor-pointer hover:bg-slate-50 ${
                                        getNormalizedStatus(proj.status) === c.id ? 'text-sky-700 bg-sky-50 font-black' : 'text-slate-700'
                                      }`}
                                    >
                                      <span className="flex items-center gap-1.5">
                                        {c.icon}
                                        <span>{c.title}</span>
                                      </span>
                                      {getNormalizedStatus(proj.status) === c.id && <Check className="w-3 h-3 text-sky-600" />}
                                    </button>
                                  ))}
                                  {onEditProject && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setStatusMenuOpenProjId(null);
                                        onEditProject(proj);
                                      }}
                                      className="text-left px-2 py-1 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-100 border-t border-slate-100 mt-1 cursor-pointer"
                                    >
                                      Edit details
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Project Name */}
                          <h4 className="text-xs font-extrabold text-slate-800 tracking-tight leading-snug group-hover:text-sky-700 transition-colors">
                            {proj.name}
                          </h4>

                          {/* Description if any */}
                          {proj.description && (
                            <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed">
                              {proj.description}
                            </p>
                          )}

                          {/* Running Timer Live Badge */}
                          {hasRunningTimer && (
                            <div className="bg-sky-500 text-white rounded-lg p-1.5 flex items-center justify-between text-[9px] font-bold shadow-xs animate-pulse">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 animate-spin" /> Timer running
                              </span>
                              <span>Tracking…</span>
                            </div>
                          )}

                          {/* Task Progress Bar */}
                          {totalTasks > 0 && (
                            <div className="space-y-1 pt-1">
                              <div className="flex justify-between text-[9px] font-semibold text-slate-500">
                                <span>Tasks: {completedTasks}/{totalTasks}</span>
                                <span>{progressPct}%</span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div 
                                  className="bg-sky-500 h-full rounded-full transition-all duration-300"
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Bottom Row: Cost, Hours & Date */}
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] gap-2">
                            <div className="min-w-0">
                              <ProjectCurrencyDisplay 
                                amount={proj.cost}
                                currency={resolveProjectCurrency(proj, client, baseCurrency)}
                                baseCurrency={baseCurrency}
                                variant="compact"
                                rateType={proj.rateType}
                              />
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {totalTrackedHours > 0 && (
                                <span className="text-slate-400 text-[9px] font-mono">
                                  {totalTrackedHours.toFixed(1)}h
                                </span>
                              )}
                              {proj.endDate && (
                                <span className="text-[9px] text-slate-400 flex items-center gap-0.5 font-mono">
                                  <Calendar className="w-2.5 h-2.5" />
                                  {proj.endDate}
                                </span>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

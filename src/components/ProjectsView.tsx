import React, { useState } from 'react';
import { 
  Briefcase, CheckSquare, Calendar, DollarSign, Plus, ArrowLeft, 
  Trash2, Edit3, Clock, CheckCircle2, Circle, Play, AlertCircle, 
  User, ChevronRight, Search, Percent, ListTodo, LayoutGrid, Kanban, Columns,
  ArrowUpDown, Link2, FileText, Info, RefreshCw, Coins, Globe, Clapperboard,
  Code, Scale, Wrench, Hammer, Sparkles, Layers, Wand2, Copy
} from 'lucide-react';
import { CRMData, Project, Task, Client, Business } from '../types';
import { SUPPORTED_CURRENCIES, getCurrencyConfig, formatCurrencyAmount, convertCurrency, resolveProjectCurrency } from '../lib/currencies';
import { INDUSTRY_PRESETS, getIndustryPreset } from '../lib/industryPresets';
import DateInput from './DateInput';
import ProjectProfitabilityChart from './ProjectProfitabilityChart';
import ProjectKanbanBoard from './ProjectKanbanBoard';
import ProjectCurrencyDisplay from './ProjectCurrencyDisplay';
import { documentDefaults } from '../lib/documentTerms';
import { recalcDocumentTotals } from '../lib/invoiceTotals';
import { suggestDocumentNumber } from '../lib/documentNumbers';
import { generateShareToken } from '../lib/documentLinks';

interface ProjectsViewProps {
  data: CRMData;
  onUpdateData: (newData: CRMData) => void;
  onNavigateToTab?: (tab: 'dashboard' | 'billing' | 'clients' | 'services' | 'settings' | 'projects', selectedDocId?: string) => void;
}

export default function ProjectsView({ data, onUpdateData, onNavigateToTab }: ProjectsViewProps) {
  // Ensure data.projects exists
  const projects = data.projects || [];

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectsViewMode, setProjectsViewMode] = useState<'kanban' | 'grid'>('kanban');
  
  // Modals
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Form State for Project
  const [projName, setProjName] = useState('');
  const [projDesc, setProjDesc] = useState('');
  const [projClientId, setProjClientId] = useState('');
  const [projBizId, setProjBizId] = useState(data.activeBusinessId || data.businesses[0]?.id || '');
  const [projCurrency, setProjCurrency] = useState<string>(data.userProfile.defaultCurrency || 'FJD');
  const [projStartDate, setProjStartDate] = useState('');
  const [projEndDate, setProjEndDate] = useState('');
  const [projCost, setProjCost] = useState<number>(0);
  const [projRateType, setProjRateType] = useState<'flat' | 'hourly' | 'monthly'>('flat');
  const [projStatus, setProjStatus] = useState<'lead' | 'in_progress' | 'pending_review' | 'completed' | 'not_started' | 'on_hold'>('in_progress');
  const [projIndustrySector, setProjIndustrySector] = useState<string>('custom');

  // Form State for Task
  const [showAddTaskForm, setShowAddTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [taskViewMode, setTaskViewMode] = useState<'list' | 'kanban'>('kanban');
  const [taskSortOrder, setTaskSortOrder] = useState<'default' | 'priority'>('default');
  const [isDraggingOverColumn, setIsDraggingOverColumn] = useState<string | null>(null);

  // Task Detail & Reference Management state
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [refTitle, setRefTitle] = useState('');
  const [refType, setRefType] = useState<'note' | 'link'>('note');
  const [refContent, setRefContent] = useState('');

  // Timer & Billing state
  const [ticker, setTicker] = useState(0);
  const [billingTask, setBillingTask] = useState<Task | null>(null);
  const [billingRate, setBillingRate] = useState<number>(50);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('new');

  // Scope of Work (SOW) Builder State
  const [projectDetailTab, setProjectDetailTab] = useState<'scope' | 'tasks' | 'documents'>('scope');
  const [showAddScopeModal, setShowAddScopeModal] = useState(false);
  const [editingScopeId, setEditingScopeId] = useState<string | null>(null);
  const [scopeTitle, setScopeTitle] = useState('');
  const [scopeDesc, setScopeDesc] = useState('');
  const [scopeCost, setScopeCost] = useState<number>(0);
  const [scopeDeliverables, setScopeDeliverables] = useState<string[]>([]);
  const [newDeliverable, setNewDeliverable] = useState('');

  // AI scope generation options
  const [isAiGeneratingScope, setIsAiGeneratingScope] = useState(false);
  const [aiScopePrompt, setAiScopePrompt] = useState('');

  // Selected project object
  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // Trigger interval if any task in the selected project has an active running timer
  const hasActiveTimer = React.useMemo(() => {
    return selectedProject?.tasks?.some(t => !!t.timerStartedAt);
  }, [selectedProject]);

  React.useEffect(() => {
    if (!hasActiveTimer) return;
    const interval = setInterval(() => {
      setTicker(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [hasActiveTimer]);

  // Filter projects
  const filteredProjects = projects.filter(proj => {
    const matchesSearch = proj.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          proj.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || proj.status === statusFilter;
    const matchesActiveBiz = proj.businessId === data.activeBusinessId; // Filter by the active business selected in the header/dashboard
    
    return matchesSearch && matchesStatus && matchesActiveBiz;
  });

  // Open creation modal
  const handleOpenAdd = (presetId?: string) => {
    setEditingProject(null);
    const defaultClient = data.clients[0];
    setProjClientId(defaultClient?.id || '');
    setProjBizId(data.activeBusinessId || data.businesses[0]?.id || '');
    setProjCurrency(defaultClient?.currency || data.userProfile.defaultCurrency || 'FJD');
    setProjStartDate(new Date().toISOString().split('T')[0]);
    
    // Default end date is 1 month from now
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);
    setProjEndDate(futureDate.toISOString().split('T')[0]);
    setProjStatus('in_progress');

    if (presetId && presetId !== 'custom') {
      const preset = getIndustryPreset(presetId);
      setProjName(preset.sampleProject.name);
      setProjDesc(preset.sampleProject.description);
      setProjCost(preset.sampleProject.defaultCost);
      setProjRateType(preset.sampleProject.rateType);
      setProjIndustrySector(preset.id);
    } else {
      setProjName('');
      setProjDesc('');
      setProjCost(1000);
      setProjRateType('flat');
      setProjIndustrySector('custom');
    }
    
    setShowAddProjectModal(true);
  };

  // Open edit modal
  const handleOpenEdit = (proj: Project, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering project selection
    const projClient = data.clients.find(c => c.id === proj.clientId);
    setEditingProject(proj);
    setProjName(proj.name);
    setProjDesc(proj.description);
    setProjClientId(proj.clientId || '');
    setProjBizId(proj.businessId);
    setProjCurrency(proj.currency || projClient?.currency || data.userProfile.defaultCurrency || 'FJD');
    setProjStartDate(proj.startDate);
    setProjEndDate(proj.endDate);
    setProjCost(proj.cost);
    setProjRateType(proj.rateType);
    setProjStatus(proj.status);
    setProjIndustrySector(proj.industrySector || 'custom');
    setShowAddProjectModal(true);
  };

  // Handle Project Create / Update Submit
  const handleProjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projName.trim()) return;

    if (editingProject) {
      // Update
      const updatedProjects = projects.map(p => 
        p.id === editingProject.id 
          ? { 
              ...p, 
              name: projName, 
              description: projDesc, 
              clientId: projClientId || undefined,
              businessId: projBizId,
              currency: projCurrency || undefined,
              startDate: projStartDate,
              endDate: projEndDate,
              cost: Number(projCost),
              rateType: projRateType,
              status: projStatus,
              industrySector: projIndustrySector !== 'custom' ? projIndustrySector : undefined
            }
          : p
      );
      onUpdateData({
        ...data,
        projects: updatedProjects
      });
    } else {
      // Create - If an industry preset was chosen, pre-load its sample tasks and scope sections
      let initialTasks: Task[] = [];
      let initialScope: any[] = [];

      if (projIndustrySector !== 'custom') {
        const preset = getIndustryPreset(projIndustrySector);
        if (preset?.sampleProject) {
          const newProjId = `proj-${Date.now()}`;
          initialTasks = preset.sampleProject.tasks.map((t, idx) => ({
            ...t,
            id: `task-${Date.now()}-${idx}`,
            projectId: newProjId
          }));
          initialScope = preset.sampleProject.scopeSections.map((s, idx) => ({
            ...s,
            id: `scope-${Date.now()}-${idx}`
          }));
        }
      }

      const newProjId = `proj-${Date.now()}`;
      // Ensure tasks have matching project ID
      if (initialTasks.length > 0) {
        initialTasks = initialTasks.map(t => ({ ...t, projectId: newProjId }));
      }

      const newProj: Project = {
        id: newProjId,
        name: projName,
        description: projDesc,
        clientId: projClientId || undefined,
        businessId: projBizId,
        currency: projCurrency || undefined,
        startDate: projStartDate,
        endDate: projEndDate,
        cost: Number(projCost),
        rateType: projRateType,
        status: projStatus,
        industrySector: projIndustrySector !== 'custom' ? projIndustrySector : undefined,
        tasks: initialTasks,
        scopeSections: initialScope.length > 0 ? initialScope : undefined
      };

      onUpdateData({
        ...data,
        projects: [...projects, newProj]
      });

      setSelectedProjectId(newProjId);
    }
    setShowAddProjectModal(false);
  };

  // Duplicate a project to set up a similar one quickly: same client, scope, tasks and settings,
  // with tasks reset to to-do, no tracked time, and dates moved to start today.
  const handleDuplicateProject = (proj: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    const today = new Date().toISOString().split('T')[0];
    const dayMs = 24 * 60 * 60 * 1000;
    const shiftDays = proj.startDate ? Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${proj.startDate}T00:00:00Z`).getTime()) / dayMs) : 0;
    const shift = (d?: string) => {
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
      const x = new Date(`${d}T00:00:00Z`);
      x.setUTCDate(x.getUTCDate() + shiftDays);
      return x.toISOString().slice(0, 10);
    };
    const stamp = Date.now();
    const id = `proj-${stamp}`;
    const copy: Project = {
      ...proj,
      id,
      name: `${proj.name} (copy)`,
      status: 'not_started',
      startDate: today,
      endDate: shift(proj.endDate) || proj.endDate,
      tasks: (proj.tasks || []).map((t, i) => {
        const { timerStartedAt, ...rest } = t;
        return { ...rest, id: `task-${stamp}-${i}`, projectId: id, status: 'todo' as const, trackedHours: 0, dueDate: shift(t.dueDate) };
      }),
      scopeSections: (proj.scopeSections || []).map((sec, i) => ({ ...sec, id: `scope-${stamp}-${i}`, deliverables: [...(sec.deliverables || [])] })),
      customJobFields: proj.customJobFields ? proj.customJobFields.map(f => ({ ...f })) : undefined
    };
    (copy as any).updatedAt = new Date().toISOString();
    onUpdateData({ ...data, projects: [...projects, copy] });
    setSelectedProjectId(null);
    // Open the copy so the name, client and dates can be changed straight away.
    handleOpenEdit(copy, e);
  };

  // Handle Project Delete
  const handleDeleteProject = (projId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this project and all its tasks?')) return;
    
    const updatedProjects = projects.filter(p => p.id !== projId);
    onUpdateData({
      ...data,
      projects: updatedProjects
    });
    if (selectedProjectId === projId) {
      setSelectedProjectId(null);
    }
  };

  // ==========================================
  // SCOPE OF WORK (SOW) BUILDER HANDLERS
  // ==========================================

  const handleOpenAddScope = () => {
    setEditingScopeId(null);
    setScopeTitle('');
    setScopeDesc('');
    setScopeCost(0);
    setScopeDeliverables([]);
    setNewDeliverable('');
    setShowAddScopeModal(true);
  };

  const handleOpenEditScope = (scope: any) => {
    setEditingScopeId(scope.id);
    setScopeTitle(scope.title);
    setScopeDesc(scope.description);
    setScopeCost(scope.cost);
    setScopeDeliverables(scope.deliverables || []);
    setNewDeliverable('');
    setShowAddScopeModal(true);
  };

  const handleAddDeliverable = () => {
    if (!newDeliverable.trim()) return;
    setScopeDeliverables([...scopeDeliverables, newDeliverable.trim()]);
    setNewDeliverable('');
  };

  const handleRemoveDeliverable = (index: number) => {
    setScopeDeliverables(scopeDeliverables.filter((_, i) => i !== index));
  };

  const handleSaveScopeSection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !scopeTitle.trim()) return;

    const targetProj = projects.find(p => p.id === selectedProjectId);
    if (!targetProj) return;

    const currentSections = targetProj.scopeSections || [];

    let updatedSections = [];
    if (editingScopeId) {
      // Update existing
      updatedSections = currentSections.map(s => 
        s.id === editingScopeId 
          ? { 
              ...s, 
              title: scopeTitle, 
              description: scopeDesc, 
              cost: Number(scopeCost), 
              deliverables: scopeDeliverables 
            }
          : s
      );
    } else {
      // Create new
      const newSection = {
        id: `scope-${Date.now()}`,
        title: scopeTitle,
        description: scopeDesc,
        cost: Number(scopeCost),
        deliverables: scopeDeliverables
      };
      updatedSections = [...currentSections, newSection];
    }

    // Auto-align cost
    const sumCost = updatedSections.reduce((sum, s) => sum + s.cost, 0);

    const updatedProjects = projects.map(p => 
      p.id === selectedProjectId 
        ? { 
            ...p, 
            scopeSections: updatedSections,
            // Automatically update project budget/cost to match aggregate scope cost
            cost: sumCost > 0 ? sumCost : p.cost 
          }
        : p
    );

    onUpdateData({
      ...data,
      projects: updatedProjects
    });

    setShowAddScopeModal(false);
  };

  const handleDeleteScopeSection = (sectionId: string) => {
    if (!selectedProjectId) return;
    if (!window.confirm('Delete this scope section?')) return;

    const targetProj = projects.find(p => p.id === selectedProjectId);
    if (!targetProj) return;

    const currentSections = targetProj.scopeSections || [];
    const updatedSections = currentSections.filter(s => s.id !== sectionId);
    
    // Auto-calculate new sum
    const sumCost = updatedSections.reduce((sum, s) => sum + s.cost, 0);

    const updatedProjects = projects.map(p => 
      p.id === selectedProjectId 
        ? { 
            ...p, 
            scopeSections: updatedSections,
            cost: sumCost > 0 ? sumCost : p.cost 
          }
        : p
    );

    onUpdateData({
      ...data,
      projects: updatedProjects
    });
  };

  const handleAlignCostToScope = () => {
    if (!selectedProjectId || !selectedProject) return;
    const currentSections = selectedProject.scopeSections || [];
    const sumCost = currentSections.reduce((sum, s) => sum + s.cost, 0);

    if (sumCost === 0) {
      alert("Add scope sections with a cost first.");
      return;
    }

    const updatedProjects = projects.map(p => 
      p.id === selectedProjectId ? { ...p, cost: sumCost } : p
    );

    onUpdateData({
      ...data,
      projects: updatedProjects
    });
  };

  const handleAiGenerateScope = async () => {
    if (!selectedProject) return;
    setIsAiGeneratingScope(true);

    try {
      const activeBiz = data.businesses.find(b => b.id === selectedProject.businessId) || data.businesses[0];
      const res = await fetch('/api/projects/generate-scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedProject.name,
          description: selectedProject.description,
          prompt: aiScopePrompt,
          businessType: activeBiz?.type || 'studio'
        })
      });

      const parsed = await res.json();
      if (parsed.scopeSections && parsed.scopeSections.length > 0) {
        const withIds = parsed.scopeSections.map((s: any, i: number) => ({
          ...s,
          id: `scope-ai-${Date.now()}-${i}`
        }));

        const currentSections = selectedProject.scopeSections || [];
        const updatedSections = [...currentSections, ...withIds];
        const sumCost = updatedSections.reduce((sum, s) => sum + s.cost, 0);

        const updatedProjects = projects.map(p => 
          p.id === selectedProject.id 
            ? { 
                ...p, 
                scopeSections: updatedSections,
                cost: sumCost > 0 ? sumCost : p.cost 
              }
            : p
        );

        onUpdateData({
          ...data,
          projects: updatedProjects
        });
        setAiScopePrompt('');
      } else {
        alert("The AI couldn't suggest scope sections for this. Try a more specific description.");
      }
    } catch (e) {
      console.error("AI Scope Generation failed", e);
      alert("Couldn't reach the AI to draft a scope. Check your connection and try again.");
    } finally {
      setIsAiGeneratingScope(false);
    }
  };

  const handleExportScopeToQuoteOrInvoice = (docType: 'quote' | 'invoice') => {
    if (!selectedProject) return;
    const sections = selectedProject.scopeSections || [];
    if (sections.length === 0) {
      alert("Add at least one scope section first.");
      return;
    }

    const costOf = (s: { cost?: unknown }) => Number(s.cost) || 0;

    // Build items
    const documentItems = sections.map((s, i) => ({
      id: `item-${Date.now()}-${i}`,
      name: s.title,
      description: s.description + (s.deliverables?.length ? `\nDeliverables:\n` + s.deliverables.map(d => `• ${d}`).join('\n') : ''),
      quantity: 1,
      rate: costOf(s),
      total: costOf(s)
    }));

    const activeBiz = data.businesses.find(b => b.id === selectedProject.businessId) || data.businesses[0];
    const taxOff = data.userProfile.enableTax === false;
    const totals = recalcDocumentTotals({ items: [], vatRate: taxOff ? 0 : (data.userProfile.defaultVatRate ?? 12.5) }, documentItems, taxOff);
    const today = new Date().toISOString().split('T')[0];
    const defaults = documentDefaults(activeBiz, docType, today);
    const documentNumber = suggestDocumentNumber(data, docType, activeBiz?.id)
      || `${(docType === 'quote' ? activeBiz?.quotePrefix : activeBiz?.invoicePrefix) || (docType === 'quote' ? 'QT' : 'INV')}-DRAFT-${Date.now().toString(36).toUpperCase()}`;

    const projectCurrency = selectedProject.currency || 
      (selectedProject.clientId ? data.clients.find(c => c.id === selectedProject.clientId)?.currency : undefined) || 
      data.userProfile.defaultCurrency || 'FJD';

    const newDocument = {
      id: `doc-${Date.now()}`,
      type: docType,
      documentNumber,
      businessId: activeBiz?.id || selectedProject.businessId,
      clientId: selectedProject.clientId || data.clients[0]?.id || '',
      currency: projectCurrency,
      issueDate: today,
      dueDate: defaults.dueDate,
      ...totals,
      status: 'draft' as const,
      projectId: selectedProject.id,
      notes: `${defaults.notes}\nFrom the scope of work for ${selectedProject.name}.`,
      shareToken: generateShareToken(),
      updatedAt: new Date().toISOString()
    };

    onUpdateData({
      ...data,
      documents: [...(data.documents || []), newDocument]
    });

    if (onNavigateToTab) {
      // Navigate straight to the newly created billing document
      onNavigateToTab('billing', newDocument.id);
    }
  };

  // Handle Create Task Submit
  const handleAddTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !taskTitle.trim()) return;

    const newTask: Task = {
      id: `task-${Date.now()}`,
      projectId: selectedProjectId,
      title: taskTitle,
      description: taskDesc || undefined,
      status: 'todo',
      dueDate: taskDueDate || undefined,
      priority: taskPriority
    };

    const updatedProjects = projects.map(p => {
      if (p.id === selectedProjectId) {
        return {
          ...p,
          tasks: [...p.tasks, newTask]
        };
      }
      return p;
    });

    onUpdateData({
      ...data,
      projects: updatedProjects
    });

    // Clear form
    setTaskTitle('');
    setTaskDesc('');
    setTaskDueDate('');
    setTaskPriority('medium');
    setShowAddTaskForm(false);
  };

  // Toggle Task Status (cycle through todo -> in_progress -> done)
  const handleToggleTaskStatus = (taskId: string) => {
    if (!selectedProjectId) return;

    const updatedProjects = projects.map(p => {
      if (p.id === selectedProjectId) {
        const updatedTasks = p.tasks.map(t => {
          if (t.id === taskId) {
            let nextStatus: 'todo' | 'in_progress' | 'done' = 'todo';
            if (t.status === 'todo') nextStatus = 'in_progress';
            else if (t.status === 'in_progress') nextStatus = 'done';
            return { ...t, status: nextStatus };
          }
          return t;
        });
        return { ...p, tasks: updatedTasks };
      }
      return p;
    });

    onUpdateData({
      ...data,
      projects: updatedProjects
    });
  };

  // Direct set task status to done/todo
  const handleMarkTaskCompleted = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedProjectId) return;

    const updatedProjects = projects.map(p => {
      if (p.id === selectedProjectId) {
        const updatedTasks = p.tasks.map(t => {
          if (t.id === taskId) {
            return { 
              ...t, 
              status: (t.status === 'done' ? 'todo' : 'done') as 'todo' | 'done'
            };
          }
          return t;
        });
        return { ...p, tasks: updatedTasks };
      }
      return p;
    });

    onUpdateData({
      ...data,
      projects: updatedProjects
    });
  };

  // Delete Task
  const handleDeleteTask = (taskId: string) => {
    if (!selectedProjectId) return;
    
    const updatedProjects = projects.map(p => {
      if (p.id === selectedProjectId) {
        return {
          ...p,
          tasks: p.tasks.filter(t => t.id !== taskId)
        };
      }
      return p;
    });

    onUpdateData({
      ...data,
      projects: updatedProjects
    });
  };

  // Update task details (status, references, description, priority, etc)
  const handleUpdateTaskDetail = (updatedTask: Task) => {
    if (!selectedProjectId) return;
    
    const updatedProjects = projects.map(p => {
      if (p.id === selectedProjectId) {
        const updatedTasks = p.tasks.map(t => t.id === updatedTask.id ? updatedTask : t);
        return { ...p, tasks: updatedTasks };
      }
      return p;
    });

    onUpdateData({
      ...data,
      projects: updatedProjects
    });

    // Sync active detail view modal if open
    setDetailTask(updatedTask);
  };

  // Attach a new placeholder note or external link reference to a task
  const handleAddReference = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailTask || !refTitle.trim() || !refContent.trim()) return;

    const newRef = {
      id: `ref-${Date.now()}`,
      title: refTitle.trim(),
      type: refType,
      content: refContent.trim()
    };

    const updatedTask: Task = {
      ...detailTask,
      references: [...(detailTask.references || []), newRef]
    };

    handleUpdateTaskDetail(updatedTask);
    
    // Reset form fields
    setRefTitle('');
    setRefContent('');
  };

  // Remove reference from task
  const handleRemoveReference = (refId: string) => {
    if (!detailTask) return;

    const updatedTask: Task = {
      ...detailTask,
      references: (detailTask.references || []).filter(r => r.id !== refId)
    };

    handleUpdateTaskDetail(updatedTask);
  };

  // Link existing quote or invoice to this project
  const handleLinkExistingDocument = (docId: string) => {
    if (!docId || !selectedProjectId) return;
    const updatedDocs = (data.documents || []).map(d => {
      if (d.id === docId) {
        return { ...d, projectId: selectedProjectId };
      }
      return d;
    });
    onUpdateData({
      ...data,
      documents: updatedDocs
    });
  };

  // Unlink a document from this project
  const handleUnlinkDocument = (docId: string) => {
    if (!window.confirm('Unlink this document from the project?')) return;
    const updatedDocs = (data.documents || []).map(d => {
      if (d.id === docId) {
        // Remove projectId
        const { projectId, ...rest } = d;
        return rest;
      }
      return d;
    });
    onUpdateData({
      ...data,
      documents: updatedDocs
    });
  };

  // --- KANBAN DRAG & DROP HANDLERS ---
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    if (isDraggingOverColumn !== columnId) {
      setIsDraggingOverColumn(columnId);
    }
  };

  const handleDragLeave = () => {
    setIsDraggingOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, targetStatus: 'todo' | 'in_progress' | 'done') => {
    e.preventDefault();
    setIsDraggingOverColumn(null);
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId || !selectedProjectId) return;

    const updatedProjects = projects.map(p => {
      if (p.id === selectedProjectId) {
        const updatedTasks = p.tasks.map(t => {
          if (t.id === taskId) {
            // Handle automatic timer stop if task moves to 'done' while running
            const isTimerRunning = !!t.timerStartedAt;
            let timerStartedAt = t.timerStartedAt;
            let trackedHours = t.trackedHours || 0;
            if (targetStatus === 'done' && isTimerRunning) {
              const started = new Date(timerStartedAt!).getTime();
              const elapsedHours = (Date.now() - started) / (1000 * 60 * 60);
              trackedHours += elapsedHours;
              timerStartedAt = undefined;
            }
            return {
              ...t,
              status: targetStatus,
              timerStartedAt,
              trackedHours
            };
          }
          return t;
        });
        return { ...p, tasks: updatedTasks };
      }
      return p;
    });

    onUpdateData({
      ...data,
      projects: updatedProjects
    });
  };

  // --- TIMER & BILLING INTEGRATION HANDLERS ---

  // Start Timer for a task
  const handleStartTimer = (taskId: string) => {
    if (!selectedProjectId) return;
    
    const nowStr = new Date().toISOString();
    const updatedProjects = projects.map(p => {
      if (p.id === selectedProjectId) {
        const updatedTasks = p.tasks.map(t => {
          if (t.id === taskId) {
            // Automatically switch status to 'in_progress' when starting timer
            const nextStatus = t.status === 'todo' ? 'in_progress' : t.status;
            return {
              ...t,
              timerStartedAt: nowStr,
              status: nextStatus as 'todo' | 'in_progress' | 'done'
            };
          }
          return t;
        });
        return { ...p, tasks: updatedTasks };
      }
      return p;
    });

    onUpdateData({
      ...data,
      projects: updatedProjects
    });
  };

  // Stop Timer for a task and accumulate hours
  const handleStopTimer = (taskId: string) => {
    if (!selectedProjectId) return;

    const updatedProjects = projects.map(p => {
      if (p.id === selectedProjectId) {
        const updatedTasks = p.tasks.map(t => {
          if (t.id === taskId && t.timerStartedAt) {
            const started = new Date(t.timerStartedAt).getTime();
            const elapsedHours = (Date.now() - started) / (1000 * 60 * 60);
            const previousTracked = t.trackedHours || 0;
            return {
              ...t,
              trackedHours: previousTracked + elapsedHours,
              timerStartedAt: undefined
            };
          }
          return t;
        });
        return { ...p, tasks: updatedTasks };
      }
      return p;
    });

    onUpdateData({
      ...data,
      projects: updatedProjects
    });
  };

  // Reset/Clear tracked hours for a task
  const handleResetTimer = (taskId: string) => {
    if (!selectedProjectId) return;
    if (!window.confirm('Clear tracked hours for this task?')) return;

    const updatedProjects = projects.map(p => {
      if (p.id === selectedProjectId) {
        const updatedTasks = p.tasks.map(t => {
          if (t.id === taskId) {
            return {
              ...t,
              trackedHours: 0,
              timerStartedAt: undefined
            };
          }
          return t;
        });
        return { ...p, tasks: updatedTasks };
      }
      return p;
    });

    onUpdateData({
      ...data,
      projects: updatedProjects
    });
  };

  // Open billing popover for a task
  const handleOpenBillingModal = (task: Task) => {
    setBillingTask(task);
    // Pre-fill rate based on project settings or fallback to 50
    let initialRate = 50;
    if (selectedProject?.rateType === 'hourly' && selectedProject.cost > 0) {
      initialRate = selectedProject.cost;
    } else if (task.hourlyRate) {
      initialRate = task.hourlyRate;
    }
    setBillingRate(initialRate);

    // Find the first draft invoice for the client of this project, if any
    const existingDraft = (data.documents || []).find(d => 
      d.type === 'invoice' && 
      d.status === 'draft' && 
      d.clientId === selectedProject?.clientId &&
      d.businessId === data.activeBusinessId
    );

    setSelectedInvoiceId(existingDraft ? existingDraft.id : 'new');
  };

  // Handle adding tracked hours to the selected invoice
  const handleAddToInvoiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!billingTask || !selectedProject) return;

    const hours = billingTask.trackedHours || 0;
    if (hours <= 0) return;

    const rate = billingRate;
    const itemTotal = hours * rate;

    // Create a new invoice line item
    const newItem = {
      id: `item-${Date.now()}`,
      name: `Time spent on task: ${billingTask.title}`,
      description: `Tracked ${hours.toFixed(2)} hours @ ${data.userProfile.defaultCurrency} ${rate}/hr`,
      quantity: parseFloat(hours.toFixed(2)),
      rate: rate,
      total: parseFloat(itemTotal.toFixed(2))
    };

    let updatedDocs = [...(data.documents || [])];

    if (selectedInvoiceId === 'new') {
      const projCur = selectedProject.currency ||
        (selectedProject.clientId ? data.clients.find(c => c.id === selectedProject.clientId)?.currency : undefined) ||
        data.userProfile.defaultCurrency || 'FJD';
      const business = data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];
      const today = new Date().toISOString().split('T')[0];
      const defaults = documentDefaults(business, 'invoice', today);
      const taxOff = data.userProfile.enableTax === false;
      const totals = recalcDocumentTotals({ items: [], vatRate: taxOff ? 0 : (data.userProfile.defaultVatRate ?? 12.5) }, [newItem], taxOff);

      const newInvoice = {
        id: `doc-${Date.now()}`,
        type: 'invoice' as const,
        // The business's own series; manual numbering gets a placeholder to replace before sending.
        documentNumber: suggestDocumentNumber(data, 'invoice', business?.id) || `${business?.invoicePrefix || 'INV'}-DRAFT-${Date.now().toString(36).toUpperCase()}`,
        businessId: business?.id || data.activeBusinessId,
        clientId: selectedProject.clientId || '',
        currency: projCur,
        issueDate: today,
        dueDate: defaults.dueDate,
        ...totals,
        status: 'draft' as const,
        notes: defaults.notes,
        projectId: selectedProject.id,
        shareToken: generateShareToken(),
        updatedAt: new Date().toISOString()
      };

      updatedDocs = [newInvoice, ...updatedDocs];
    } else {
      // Append to existing draft invoice
      updatedDocs = updatedDocs.map(doc => {
        if (doc.id === selectedInvoiceId) {
          const updatedItems = [...doc.items, newItem];
          return { ...doc, ...recalcDocumentTotals(doc, updatedItems, data.userProfile.enableTax === false), updatedAt: new Date().toISOString() };
        }
        return doc;
      });
    }

    // Reset tracked hours on task
    const updatedProjects = projects.map(p => {
      if (p.id === selectedProject.id) {
        const updatedTasks = p.tasks.map(t => {
          if (t.id === billingTask.id) {
            return {
              ...t,
              trackedHours: 0
            };
          }
          return t;
        });
        return { ...p, tasks: updatedTasks };
      }
      return p;
    });

    onUpdateData({
      ...data,
      documents: updatedDocs,
      projects: updatedProjects
    });

    // Reset Modal
    setBillingTask(null);
  };

  // Format Duration string HH:MM:SS
  const formatDuration = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      seconds.toString().padStart(2, '0')
    ].join(':');
  };

  // Helpers
  const getStatusColor = (status: Project['status']) => {
    switch (status) {
      case 'lead': return 'bg-indigo-50 text-indigo-700 border-indigo-200/60';
      case 'in_progress': return 'bg-sky-50 text-sky-700 border-sky-100/60';
      case 'pending_review': return 'bg-amber-50 text-amber-800 border-amber-200/60';
      case 'completed': return 'bg-emerald-50 text-emerald-700 border-emerald-100/60';
      case 'on_hold': return 'bg-amber-50 text-amber-700 border-amber-100/60';
      case 'not_started': return 'bg-zinc-100 text-zinc-650 border-zinc-200/50';
      default: return 'bg-sky-50 text-sky-700 border-sky-100/60';
    }
  };

  const getStatusLabel = (status: Project['status']) => {
    switch (status) {
      case 'lead': return 'Lead';
      case 'in_progress': return 'In progress';
      case 'pending_review': return 'Pending review';
      case 'completed': return 'Completed';
      case 'on_hold': return 'On hold';
      case 'not_started': return 'Planning';
      default: return 'Active';
    }
  };

  const handleUpdateProjectStatus = (projectId: string, newStatus: 'lead' | 'in_progress' | 'pending_review' | 'completed') => {
    const updatedProjects = projects.map(p => 
      p.id === projectId ? { ...p, status: newStatus } : p
    );
    onUpdateData({
      ...data,
      projects: updatedProjects
    });
  };

  const handleOpenAddWithStatus = (defaultStatus?: 'lead' | 'in_progress' | 'pending_review' | 'completed') => {
    handleOpenAdd();
    if (defaultStatus) {
      setProjStatus(defaultStatus);
    }
  };

  const getTaskStatusBadge = (status: Task['status']) => {
    switch (status) {
      case 'done': return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
      case 'in_progress': return 'bg-sky-50 text-sky-700 border border-sky-100';
      case 'todo': return 'bg-zinc-50 text-zinc-500 border border-zinc-200';
    }
  };

  const activeBiz = data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];

  // The new/edit project form, shown over both the list and an open project.
  const projectModal = showAddProjectModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white w-full max-w-lg rounded-2xl border border-slate-100 shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
              <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-sky-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider">
                    {editingProject ? 'Edit project' : 'New project'}
                  </h3>
                </div>
                <button 
                  onClick={() => setShowAddProjectModal(false)}
                  className="text-white/60 hover:text-white transition-colors cursor-pointer text-xs"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleProjectSubmit} className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1 text-slate-700">
                
                {/* Industry Workflow Template Selector (Only when creating) */}
                {!editingProject && (
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2">
                    <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
                      <span>Start from a template</span>
                      <span className="text-[9px] text-sky-600 font-normal">Fills in scope and tasks</span>
                    </label>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setProjIndustrySector('custom');
                        }}
                        className={`p-2 rounded-lg text-left border text-xs font-semibold transition-all cursor-pointer ${
                          projIndustrySector === 'custom'
                            ? 'bg-white border-slate-900 text-slate-900 shadow-2xs ring-1 ring-slate-900'
                            : 'bg-white/70 border-slate-200 text-slate-600 hover:bg-white'
                        }`}
                      >
                        <div className="text-[10.5px] font-bold">Blank</div>
                        <div className="text-[9px] text-slate-400 font-normal">Start from scratch</div>
                      </button>

                      {INDUSTRY_PRESETS.slice(0, 5).map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setProjIndustrySector(preset.id);
                            setProjName(preset.sampleProject.name);
                            setProjDesc(preset.sampleProject.description);
                            setProjCost(preset.sampleProject.defaultCost);
                            setProjRateType(preset.sampleProject.rateType);
                          }}
                          className={`p-2 rounded-lg text-left border text-xs font-semibold transition-all cursor-pointer ${
                            projIndustrySector === preset.id
                              ? 'bg-sky-50 border-sky-500 text-sky-950 shadow-2xs ring-1 ring-sky-500'
                              : 'bg-white/70 border-slate-200 text-slate-600 hover:bg-white'
                          }`}
                        >
                          <div className="text-[10.5px] font-bold truncate">{preset.name.split(',')[0]}</div>
                          <div className="text-[9px] text-slate-400 font-normal truncate">{preset.badge}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Project name *</label>
                  <input
                    type="text"
                    required
                    value={projName}
                    onChange={(e) => setProjName(e.target.value)}
                    placeholder="e.g. Office fit-out"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 focus:outline-none focus:border-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Description</label>
                  <textarea
                    value={projDesc}
                    onChange={(e) => setProjDesc(e.target.value)}
                    placeholder="What the job covers and what you'll deliver"
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 focus:outline-none focus:border-slate-500 resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <DateInput
                    label="Start date"
                    required
                    value={projStartDate}
                    onChange={setProjStartDate}
                    placeholder="Select start date"
                    align="left"
                    customPresets={[
                      { label: 'Today', special: 'today' },
                      { label: '+1 week', daysOffset: 7 },
                      { label: '+1 month', monthsOffset: 1 },
                    ]}
                  />
                  <DateInput
                    label="End date"
                    required
                    min={projStartDate}
                    value={projEndDate}
                    onChange={setProjEndDate}
                    placeholder="Select end date"
                    align="right"
                    customPresets={[
                      { label: '+2 weeks', daysOffset: 14 },
                      { label: '+1 month', monthsOffset: 1 },
                      { label: '+3 months', monthsOffset: 3 },
                      { label: 'End of month', special: 'end_of_month' },
                    ]}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Currency</label>
                    <select
                      value={projCurrency}
                      onChange={(e) => setProjCurrency(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2 text-xs mt-1 focus:outline-none focus:border-slate-500 font-bold"
                    >
                      {SUPPORTED_CURRENCIES.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Budget *</label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={projCost || ''}
                      onChange={(e) => setProjCost(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs mt-1 focus:outline-none focus:border-slate-500 font-mono font-bold"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Rate type *</label>
                    <select
                      value={projRateType}
                      onChange={(e) => setProjRateType(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2 text-xs mt-1 focus:outline-none focus:border-slate-500"
                    >
                      <option value="flat">Fixed price</option>
                      <option value="hourly">Hourly</option>
                      <option value="monthly">Retainer</option>
                    </select>
                  </div>
                </div>

                {/* Real-time Multi-Currency Conversion Hint */}
                {projCurrency !== data.userProfile.defaultCurrency && (
                  <div className="bg-sky-50 border border-sky-200/80 rounded-xl p-2.5 flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5 text-sky-800">
                      <span className="text-sm">{getCurrencyConfig(projCurrency).flag}</span>
                      <span>
                        In {data.userProfile.defaultCurrency}: <strong>{data.userProfile.defaultCurrency} ${(convertCurrency(projCost, projCurrency, data.userProfile.defaultCurrency).convertedAmount).toLocaleString()}</strong>
                      </span>
                    </div>
                    <span className="text-[9px] text-sky-600 font-mono">
                      (Rate: ~{convertCurrency(1, projCurrency, data.userProfile.defaultCurrency).rate} {data.userProfile.defaultCurrency}/{projCurrency})
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Client</label>
                    <select
                      value={projClientId}
                      onChange={(e) => {
                        const newClientId = e.target.value;
                        setProjClientId(newClientId);
                        if (newClientId) {
                          const clientObj = data.clients.find(c => c.id === newClientId);
                          if (clientObj?.currency) {
                            setProjCurrency(clientObj.currency);
                          }
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 focus:outline-none focus:border-slate-500"
                    >
                      <option value="">No client</option>
                      {data.clients.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.currency ? `(${c.currency})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</label>
                    <select
                      value={projStatus}
                      onChange={(e) => setProjStatus(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 focus:outline-none focus:border-slate-500 font-semibold"
                    >
                      <option value="lead">Lead</option>
                      <option value="in_progress">In progress</option>
                      <option value="pending_review">Pending review</option>
                      <option value="completed">Completed</option>
                      <option value="on_hold">On hold</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Business</label>
                  <select
                    value={projBizId}
                    onChange={(e) => setProjBizId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 focus:outline-none focus:border-slate-500"
                  >
                    {data.businesses.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-2 border-t border-slate-100 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddProjectModal(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 rounded-xl text-xs transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-xl text-xs transition-all shadow-sm cursor-pointer"
                  >
                    {editingProject ? 'Save changes' : 'Create project'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );

  // Render drill down view if a project is selected
  if (selectedProject) {
    const associatedClient = data.clients.find(c => c.id === selectedProject.clientId);
    const associatedBiz = data.businesses.find(b => b.id === selectedProject.businessId);
    
    // Calculate progress
    const totalTasks = selectedProject.tasks?.length || 0;
    const completedTasks = selectedProject.tasks?.filter(t => t.status === 'done').length || 0;
    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const linkedDocuments = (data.documents || []).filter(d => d.projectId === selectedProject.id);

    return (
      <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto pb-24 font-sans select-none animate-fade-in">
        {/* Navigation & Actions Header */}
        <div className="flex justify-between items-center">
          <button
            onClick={() => setSelectedProjectId(null)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200/80 rounded-xl py-2 px-3.5 shadow-2xs transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to projects
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={(e) => handleDuplicateProject(selectedProject, e)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 bg-white border border-slate-200 rounded-xl py-2 px-3.5 shadow-2xs transition-all cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" /> Duplicate
            </button>
            <button
              onClick={(e) => handleOpenEdit(selectedProject, e)}
              className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 bg-white border border-sky-200 rounded-xl py-2 px-3.5 shadow-2xs transition-all cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" /> Edit project
            </button>
          </div>
        </div>

        {/* Project Detailed Header Card */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-3.5">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${getStatusColor(selectedProject.status)}`}>
                {getStatusLabel(selectedProject.status)}
              </span>
              {associatedBiz && (
                <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-100 italic">
                  {associatedBiz.name}
                </span>
              )}
            </div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight leading-snug">{selectedProject.name}</h2>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{selectedProject.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-50">
            <div className="space-y-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Dates</span>
              <div className="flex items-center gap-1 text-[10px] text-slate-700 font-medium">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{selectedProject.startDate} to {selectedProject.endDate}</span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Value</span>
              <ProjectCurrencyDisplay 
                amount={selectedProject.cost}
                currency={resolveProjectCurrency(selectedProject, associatedClient, data.userProfile.defaultCurrency)}
                baseCurrency={data.userProfile.defaultCurrency}
                variant="card-header"
                rateType={selectedProject.rateType}
              />
            </div>

            {associatedClient && (
              <div className="space-y-1 col-span-2">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Client</span>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-700 font-medium">
                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{associatedClient.name} ({associatedClient.email})</span>
                </div>
              </div>
            )}
          </div>

          {/* Progress Indicator */}
          <div className="pt-3 border-t border-slate-50 space-y-1.5">
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
              <span className="uppercase tracking-wider">Progress</span>
              <span className="text-sky-600 font-mono">{progressPercent}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-sky-400 to-sky-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-[9px] text-slate-400 italic mt-1.5">
              {completedTasks} of {totalTasks} tasks completed
            </p>
          </div>
        </div>

        {/* Project Module Tabs Switcher */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/50">
          <button
            type="button"
            onClick={() => setProjectDetailTab('scope')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              projectDetailTab === 'scope'
                ? 'bg-zinc-950 text-white shadow-md font-extrabold'
                : 'text-slate-500 hover:text-slate-800 font-bold'
            }`}
          >
            <LayoutGrid className="w-4 h-4" /> Scope
          </button>
          <button
            type="button"
            onClick={() => setProjectDetailTab('tasks')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              projectDetailTab === 'tasks'
                ? 'bg-zinc-950 text-white shadow-md font-extrabold'
                : 'text-slate-500 hover:text-slate-800 font-bold'
            }`}
          >
            <ListTodo className="w-4 h-4" /> Tasks ({totalTasks})
          </button>
          <button
            type="button"
            onClick={() => setProjectDetailTab('documents')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              projectDetailTab === 'documents'
                ? 'bg-zinc-950 text-white shadow-md font-extrabold'
                : 'text-slate-500 hover:text-slate-800 font-bold'
            }`}
          >
            <FileText className="w-4 h-4" /> Billing ({linkedDocuments.length})
          </button>
        </div>

        {/* 1. Scope Builder (SOW) Module */}
        {projectDetailTab === 'scope' && (
          <div className="space-y-4 animate-fade-in">
            {/* SOW Controls Header */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2.5">
                <div className="text-left">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Columns className="w-4 h-4 text-sky-600" /> Scope of work
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Break the project into sections, each with a cost and deliverables.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleOpenAddScope}
                    className="bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-800 font-bold py-1.5 px-3 rounded-xl text-[10px] transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add section</span>
                  </button>
                </div>
              </div>

              {/* Bula AI Scope Proposal Assistant */}
              <div className="bg-gradient-to-br from-zinc-900 to-slate-800 text-white rounded-2xl p-4 shadow-md border border-slate-700/50 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="bg-sky-500/20 text-sky-400 p-1.5 rounded-lg border border-sky-500/30">
                    <Briefcase className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <h4 className="text-xs font-black uppercase tracking-wider">Draft a scope with AI</h4>
                    <p className="text-[10px] text-slate-300">Describe the work and AI suggests sections, costs and deliverables</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 3 phases for a hotel website with M-PAiSA payments"
                    value={aiScopePrompt}
                    onChange={(e) => setAiScopePrompt(e.target.value)}
                    disabled={isAiGeneratingScope}
                    className="flex-1 bg-white/10 border border-white/10 hover:border-white/25 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <button
                    onClick={handleAiGenerateScope}
                    disabled={isAiGeneratingScope}
                    className="bg-sky-500 hover:bg-sky-400 disabled:bg-slate-700 font-bold px-4 py-1.5 rounded-xl text-xs flex items-center gap-1 cursor-pointer transition-all shrink-0 shadow-sm active:scale-95"
                  >
                    {isAiGeneratingScope ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Drafting…</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Draft scope</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Alignment status alert */}
              {(() => {
                const scopeSections = selectedProject.scopeSections || [];
                const totalScopeCost = scopeSections.reduce((sum, s) => sum + s.cost, 0);
                const costDifference = totalScopeCost - selectedProject.cost;
                const projCurrency = resolveProjectCurrency(selectedProject, associatedClient, data.userProfile.defaultCurrency);
                const projCfg = getCurrencyConfig(projCurrency);

                if (scopeSections.length === 0) return null;

                return (
                  <div className={`p-3 rounded-xl border flex items-center justify-between flex-wrap gap-2.5 ${
                    costDifference === 0 
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-100' 
                      : 'bg-amber-50 text-amber-800 border-amber-100'
                  }`}>
                    <div className="flex items-center gap-2 text-left">
                      <AlertCircle className={`w-4 h-4 shrink-0 ${costDifference === 0 ? 'text-emerald-500' : 'text-amber-500'}`} />
                      <div>
                        <p className="text-[10.5px] font-bold">
                          {costDifference === 0 
                            ? '✓ Scope total matches the project budget' 
                            : `⚠ Scope total is ${projCurrency} ${projCfg.symbol}${totalScopeCost.toLocaleString()}, but the project budget is ${projCurrency} ${projCfg.symbol}${selectedProject.cost.toLocaleString()}`
                          }
                        </p>
                        <p className="text-[9px] opacity-80 leading-normal">
                          {costDifference === 0 
                            ? 'Section costs add up to the budget.' 
                            : `Difference: ${projCurrency} ${projCfg.symbol}${Math.abs(costDifference).toLocaleString()}.`
                          }
                        </p>
                      </div>
                    </div>
                    
                    {costDifference !== 0 && (
                      <button
                        type="button"
                        onClick={handleAlignCostToScope}
                        className="bg-zinc-950 hover:bg-zinc-900 text-white font-extrabold text-[9px] uppercase px-2.5 py-1.5 rounded-lg tracking-wider transition-all cursor-pointer shadow-xs active:scale-95 shrink-0 animate-pulse"
                      >
                        Match budget to scope
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* SOW Billing Export Card */}
            {selectedProject.scopeSections && selectedProject.scopeSections.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex justify-between items-center flex-wrap gap-3.5">
                <div className="text-left">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1">
                    <Percent className="w-3.5 h-3.5 text-amber-500" /> Bill this scope
                  </h4>
                  <p className="text-[9.5px] text-slate-500 mt-0.5">
                    Create a draft quote or invoice from these sections{data.userProfile.enableTax === false ? '.' : `, with ${data.userProfile.defaultVatRate ?? 12.5}% VAT added.`}
                  </p>
                </div>
                <div className="flex gap-2.5">
                  <button
                    onClick={() => handleExportScopeToQuoteOrInvoice('quote')}
                    className="bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-bold py-1.5 px-3 rounded-xl text-[10px] transition-all flex items-center gap-1 cursor-pointer active:scale-95 font-semibold"
                  >
                    <FileText className="w-3.5 h-3.5" /> Create quote
                  </button>
                  <button
                    onClick={() => handleExportScopeToQuoteOrInvoice('invoice')}
                    className="bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-800 font-bold py-1.5 px-3 rounded-xl text-[10px] transition-all flex items-center gap-1 cursor-pointer active:scale-95 font-semibold"
                  >
                    <DollarSign className="w-3.5 h-3.5" /> Create invoice
                  </button>
                </div>
              </div>
            )}

            {/* List of Scope Sections */}
            {(!selectedProject.scopeSections || selectedProject.scopeSections.length === 0) ? (
              <div className="text-center py-12 px-4 bg-white rounded-2xl border border-slate-100 text-slate-500 space-y-3">
                <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mx-auto">
                  <Columns className="w-6 h-6 text-slate-400" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase">No scope sections yet</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5 max-w-[280px] mx-auto leading-normal">
                    Add a section yourself, or describe the work above and let AI draft one.
                  </p>
                </div>
                <button
                  onClick={handleOpenAddScope}
                  className="bg-sky-500 hover:bg-sky-400 text-white font-bold py-2 px-4 rounded-xl text-xs transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  + Add section
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedProject.scopeSections.map((section, idx) => {
                  const currentVatRate = data.userProfile.defaultVatRate ?? 12.5;
                  // Section costs exclude VAT; it's added on the quote or invoice.
                  const vatAmount = Number((section.cost * currentVatRate / 100).toFixed(2));
                  return (
                    <div 
                      key={section.id} 
                      className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm hover:border-slate-200 transition-all text-left space-y-3"
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex items-start gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 font-mono">
                            {idx + 1}
                          </span>
                          <div>
                            <h4 className="text-xs font-bold text-slate-800 leading-snug">{section.title}</h4>
                            <p className="text-[10px] text-slate-500 mt-1 leading-normal">{section.description}</p>
                          </div>
                        </div>

                        <div className="flex flex-col items-end text-right shrink-0">
                          {(() => {
                            const projCurrency = resolveProjectCurrency(selectedProject, associatedClient, data.userProfile.defaultCurrency);
                            const projCfg = getCurrencyConfig(projCurrency);
                            return (
                              <>
                                <span className="text-xs font-black text-slate-900 font-mono">
                                  {projCurrency} {projCfg.symbol}{section.cost.toLocaleString()}
                                </span>
                                {data.userProfile.enableTax !== false && (
                                  <span className="text-[8px] font-semibold text-slate-400 font-mono mt-0.5">
                                    + {projCfg.symbol}{vatAmount.toLocaleString()} VAT
                                  </span>
                                )}
                              </>
                            );
                          })()}
                          <div className="flex gap-1.5 mt-2.5">
                            <button
                              onClick={() => handleOpenEditScope(section)}
                              className="p-1 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteScopeSection(section.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Deliverables Checklist */}
                      {section.deliverables && section.deliverables.length > 0 && (
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-1.5">
                          <span className="text-[8px] font-extrabold uppercase text-slate-400 tracking-wider block">Deliverables</span>
                          <div className="space-y-1">
                            {section.deliverables.map((item, bidx) => (
                              <div key={bidx} className="flex items-start gap-2 text-[9.5px] text-slate-600 leading-tight">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                <span>{item}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 2. Tasks & Kanban Module */}
        {projectDetailTab === 'tasks' && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-4 animate-fade-in">
          <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-3 border-b border-slate-50 pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 mr-1">
                <ListTodo className="w-4 h-4 text-sky-600" /> Tasks
              </h3>
              
              <div className="flex items-center gap-2 flex-wrap">
                {/* Segmented Control Switcher */}
                <div className="flex items-center gap-0.5 bg-slate-100 p-1 rounded-xl border border-slate-200/50">
                  <button
                    type="button"
                    onClick={() => setTaskViewMode('kanban')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-extrabold tracking-wider uppercase transition-all ${
                      taskViewMode === 'kanban' 
                        ? 'bg-white text-sky-700 shadow-xs' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Kanban className="w-3 h-3" /> Kanban
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskViewMode('list')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-extrabold tracking-wider uppercase transition-all ${
                      taskViewMode === 'list' 
                        ? 'bg-white text-sky-700 shadow-xs' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <ListTodo className="w-3 h-3" /> List
                  </button>
                </div>

                {/* Sort Control Selector */}
                <div className="flex items-center gap-0.5 bg-slate-100 p-1 rounded-xl border border-slate-200/50">
                  <button
                    type="button"
                    onClick={() => setTaskSortOrder('default')}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-extrabold tracking-wider uppercase transition-all ${
                      taskSortOrder === 'default'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Default
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskSortOrder('priority')}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-extrabold tracking-wider uppercase transition-all ${
                      taskSortOrder === 'priority'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <ArrowUpDown className="w-2.5 h-2.5" /> Priority
                  </button>
                </div>
              </div>
            </div>
            
            <button
              onClick={() => setShowAddTaskForm(!showAddTaskForm)}
              className="text-[10px] font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg py-1 px-2.5 transition-all flex items-center gap-1 shadow-sm self-end lg:self-auto"
            >
              {showAddTaskForm ? 'Cancel' : 'Add task'} <Plus className="w-3 h-3" />
            </button>
          </div>

          {showAddTaskForm && (
            <form onSubmit={handleAddTaskSubmit} className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-3 animate-fade-in">
              <h4 className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">New task</h4>
              
              <div>
                <label className="block text-[8px] font-bold text-slate-400 uppercase">Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Design Fiji VAT calculation UI"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-xs mt-1 focus:outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block text-[8px] font-bold text-slate-400 uppercase">Description</label>
                <textarea
                  placeholder="Details or deliverables for this task"
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  rows={2}
                  className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-xs mt-1 focus:outline-none focus:border-slate-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DateInput
                  label="Due date"
                  value={taskDueDate}
                  onChange={setTaskDueDate}
                  placeholder="Set due date"
                />

                <div>
                  <label className="block text-[8px] font-bold text-slate-400 uppercase mb-1">Priority</label>
                  <div className="flex items-center gap-1.5 mt-1">
                    {(['low', 'medium', 'high'] as const).map((prio) => {
                      let btnStyle = 'border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700';
                      if (taskPriority === prio) {
                        if (prio === 'low') btnStyle = 'bg-emerald-50/70 border-emerald-400 text-emerald-800 font-bold shadow-xs';
                        else if (prio === 'medium') btnStyle = 'bg-amber-50/70 border-amber-400 text-amber-800 font-bold shadow-xs';
                        else if (prio === 'high') btnStyle = 'bg-rose-50 border-rose-400 text-rose-800 font-bold shadow-xs';
                      }
                      const label = prio.charAt(0).toUpperCase() + prio.slice(1);
                      return (
                        <button
                          key={prio}
                          type="button"
                          onClick={() => setTaskPriority(prio)}
                          className={`flex-1 py-1.5 rounded-lg border text-[9px] font-extrabold tracking-wider uppercase transition-all ${btnStyle}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-1.5 rounded-lg transition-colors shadow-sm"
              >
                Add task
              </button>
            </form>
          )}

          {(!selectedProject.tasks || selectedProject.tasks.length === 0) ? (
            <div className="text-center py-6 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <CheckSquare className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
              <p className="text-[11px] text-slate-500 font-medium">No tasks yet.</p>
              <p className="text-[9px] text-slate-400 mt-0.5">Use Add task to create the first one.</p>
            </div>
          ) : taskViewMode === 'kanban' ? (
            /* Kanban Board View */
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(['todo', 'in_progress', 'done'] as const).map((status) => {
                let columnTasks = selectedProject.tasks?.filter(t => t.status === status) || [];
                
                if (taskSortOrder === 'priority') {
                  const priorityWeight = { high: 3, medium: 2, low: 1 };
                  columnTasks = [...columnTasks].sort((a, b) => {
                    const weightA = priorityWeight[a.priority || 'low'] || 1;
                    const weightB = priorityWeight[b.priority || 'low'] || 1;
                    return weightB - weightA;
                  });
                }

                let colTitle = 'To do';
                let headerBg = 'bg-slate-100 text-slate-700';
                let dotColor = 'bg-slate-400';

                if (status === 'in_progress') {
                  colTitle = 'In progress';
                  headerBg = 'bg-sky-50 text-sky-700';
                  dotColor = 'bg-sky-500';
                } else if (status === 'done') {
                  colTitle = 'Completed';
                  headerBg = 'bg-emerald-50 text-emerald-700';
                  dotColor = 'bg-emerald-500';
                }

                const isOver = isDraggingOverColumn === status;

                return (
                  <div 
                    key={status}
                    onDragOver={(e) => handleDragOver(e, status)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, status)}
                    className={`rounded-2xl p-3 border-2 transition-all min-h-[250px] flex flex-col space-y-3 ${
                      isOver 
                        ? 'bg-sky-50/50 border-sky-400 border-dashed ring-2 ring-sky-100' 
                        : 'bg-slate-50/30 border-slate-100/70'
                    }`}
                  >
                    {/* Column Header */}
                    <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                        <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                          {colTitle}
                        </h4>
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-extrabold ${headerBg}`}>
                          {columnTasks.length}
                        </span>
                      </div>
                    </div>

                    {/* Column Content */}
                    <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[450px] pr-0.5">
                      {columnTasks.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center py-10 text-center border border-dashed border-slate-150 rounded-xl bg-white/40">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">No tasks</p>
                          <p className="text-[8px] text-slate-400 mt-0.5 max-w-[120px] mx-auto leading-normal">Drag a task here.</p>
                        </div>
                      ) : (
                        columnTasks.map((task) => (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, task.id)}
                            onClick={() => setDetailTask(task)}
                            className={`p-3 bg-white rounded-xl border border-slate-150/80 shadow-xs hover:shadow-md hover:border-slate-300 transition-all cursor-pointer space-y-2 group border-l-4 ${
                              task.status === 'todo' ? 'border-l-slate-400' : task.status === 'in_progress' ? 'border-l-sky-500' : 'border-l-emerald-500'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                  <h5 className={`text-xs font-bold text-slate-800 truncate ${task.status === 'done' ? 'line-through text-slate-400' : ''}`}>
                                    {task.title}
                                  </h5>
                                  {task.priority && (
                                    <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                                      task.priority === 'high' 
                                        ? 'bg-rose-50 text-rose-700 border border-rose-100' 
                                        : task.priority === 'medium'
                                        ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                        : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                    }`}>
                                      {task.priority}
                                    </span>
                                  )}
                                </div>
                                {task.description && (
                                  <p className={`text-[10px] text-slate-400 line-clamp-2 mt-0.5 leading-normal ${task.status === 'done' ? 'text-slate-350' : ''}`}>
                                    {task.description}
                                  </p>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>

                            {task.dueDate && (
                              <div className="flex items-center gap-1 text-[8.5px] text-slate-400 font-bold">
                                <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>Due {task.dueDate}</span>
                              </div>
                            )}

                            {/* Time & Billing Section on Kanban Card */}
                            <div className="pt-2 border-t border-slate-50 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                {task.timerStartedAt ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleStopTimer(task.id); }}
                                    className="w-5 h-5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 rounded flex items-center justify-center transition-all animate-pulse"
                                    title="Stop timer"
                                  >
                                    <div className="w-1.5 h-1.5 bg-rose-600 rounded-xs" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleStartTimer(task.id); }}
                                    className="w-5 h-5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-100 rounded flex items-center justify-center transition-all active:scale-95"
                                    title="Start timer"
                                  >
                                    <Play className="w-1.5 h-1.5 fill-emerald-600" />
                                  </button>
                                )}

                                <div className="flex flex-col">
                                  {task.timerStartedAt ? (
                                    <span className="text-[8.5px] font-black font-mono text-emerald-600">
                                      {formatDuration(Date.now() - new Date(task.timerStartedAt).getTime())}
                                    </span>
                                  ) : (
                                    <span className="text-[8.5px] font-bold text-slate-650 font-mono">
                                      {(task.trackedHours || 0) > 0 ? `${(task.trackedHours || 0).toFixed(2)}h` : '0h'}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1">
                                {/* Add to Invoice button for Kanban card if has tracked hours */}
                                {(task.trackedHours && task.trackedHours > 0) ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleOpenBillingModal(task); }}
                                    className="bg-sky-50 hover:bg-sky-100 text-sky-800 font-extrabold text-[7.5px] uppercase tracking-wider px-2 py-0.5 rounded transition-colors"
                                    title="Bill hours spent"
                                  >
                                    Bill
                                  </button>
                                ) : null}

                                {/* Quick manual column switch selectors */}
                                <div className="flex items-center gap-0.5 border border-slate-100 rounded bg-slate-50 p-0.5">
                                  <button
                                    type="button"
                                    disabled={status === 'todo'}
                                    onClick={() => {
                                      const prevStatus = status === 'done' ? 'in_progress' : 'todo';
                                      // Create synthetic event
                                      const mockEvent = {
                                        preventDefault: () => {},
                                        dataTransfer: { getData: () => task.id }
                                      } as any;
                                      handleDrop(mockEvent, prevStatus);
                                    }}
                                    className={`px-1.5 py-0.5 rounded text-[8px] font-black leading-none ${
                                      status === 'todo' ? 'text-slate-300 cursor-not-allowed' : 'text-slate-650 hover:bg-white hover:text-slate-900 shadow-xs'
                                    }`}
                                    title="Move back"
                                  >
                                    ‹
                                  </button>
                                  <button
                                    type="button"
                                    disabled={status === 'done'}
                                    onClick={() => {
                                      const nextStatus = status === 'todo' ? 'in_progress' : 'done';
                                      // Create synthetic event
                                      const mockEvent = {
                                        preventDefault: () => {},
                                        dataTransfer: { getData: () => task.id }
                                      } as any;
                                      handleDrop(mockEvent, nextStatus);
                                    }}
                                    className={`px-1.5 py-0.5 rounded text-[8px] font-black leading-none ${
                                      status === 'done' ? 'text-slate-300 cursor-not-allowed' : 'text-slate-650 hover:bg-white hover:text-slate-900 shadow-xs'
                                    }`}
                                    title="Move forward"
                                  >
                                    ›
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Standard List View */
            <div className="space-y-2">
              {(() => {
                let listTasks = selectedProject.tasks || [];
                if (taskSortOrder === 'priority') {
                  const priorityWeight = { high: 3, medium: 2, low: 1 };
                  listTasks = [...listTasks].sort((a, b) => {
                    const weightA = priorityWeight[a.priority || 'low'] || 1;
                    const weightB = priorityWeight[b.priority || 'low'] || 1;
                    return weightB - weightA;
                  });
                }
                
                return listTasks.map((task) => (
                  <div 
                    key={task.id}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition-all group space-y-2.5"
                  >
                    {/* Main Task Header Info */}
                    <div className="flex items-start gap-2.5">
                      {/* Mark Completed Switcher */}
                      <button
                        type="button"
                        onClick={(e) => handleMarkTaskCompleted(task.id, e)}
                        className="mt-0.5 text-slate-400 hover:text-emerald-600 transition-colors shrink-0"
                      >
                        {task.status === 'done' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-50" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-400 hover:border-emerald-500" />
                        )}
                      </button>

                      {/* Task details (Clicking opens details modal) */}
                      <div 
                        onClick={() => setDetailTask(task)}
                        className="flex-1 min-w-0 cursor-pointer hover:bg-slate-200/50 p-1.5 rounded-lg transition-all"
                        title="View task details"
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-xs font-bold text-slate-800 font-sans ${task.status === 'done' ? 'line-through text-slate-400' : ''}`}>
                            {task.title}
                          </span>
                          <span className={`text-[8px] font-bold uppercase px-1 rounded ${getTaskStatusBadge(task.status)}`}>
                            {task.status === 'todo' ? 'To do' : task.status === 'in_progress' ? 'In progress' : 'Done'}
                          </span>
                          {task.priority && (
                            <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                              task.priority === 'high' 
                                ? 'bg-rose-50 text-rose-700 border border-rose-100' 
                                : task.priority === 'medium'
                                ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            }`}>
                              {task.priority}
                            </span>
                          )}
                        </div>

                      {task.description && (
                        <p className={`text-[10px] text-slate-400 mt-0.5 leading-normal ${task.status === 'done' ? 'text-slate-350' : ''}`}>
                          {task.description}
                        </p>
                      )}

                      {task.dueDate && (
                        <div className="flex items-center gap-1 mt-1 text-[8px] text-slate-400 font-medium">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>Due {task.dueDate}</span>
                        </div>
                      )}
                    </div>

                    {/* Delete Button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Compact Time Tracking & Billing Row */}
                  <div className="pt-2 border-t border-slate-100/80 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      {task.timerStartedAt ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleStopTimer(task.id); }}
                          className="w-6 h-6 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 rounded-lg flex items-center justify-center transition-all animate-pulse animate-duration-1000"
                          title="Stop timer"
                        >
                          <div className="w-2 h-2 bg-rose-600 rounded-xs" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleStartTimer(task.id); }}
                          className="w-6 h-6 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-100 rounded-lg flex items-center justify-center transition-all active:scale-95"
                          title="Start timer"
                        >
                          <Play className="w-2 h-2 fill-emerald-600" />
                        </button>
                      )}

                      <div className="flex flex-col">
                        {task.timerStartedAt ? (
                          <span className="text-[10px] font-black font-mono text-emerald-600 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                            {formatDuration(Date.now() - new Date(task.timerStartedAt).getTime())}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-650 font-mono">
                            {(task.trackedHours || 0) > 0 ? `${(task.trackedHours || 0).toFixed(2)} hrs` : '0.00 hrs'}
                          </span>
                        )}
                        <span className="text-[7.5px] font-extrabold uppercase text-slate-400 leading-none">Tracked</span>
                      </div>

                      {/* Reset button if there are tracked hours */}
                      {(task.trackedHours && task.trackedHours > 0) ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleResetTimer(task.id); }}
                          className="text-[8px] font-bold text-slate-400 hover:text-slate-600 hover:underline transition-colors ml-1.5"
                          title="Clear time"
                        >
                          Reset
                        </button>
                      ) : null}
                    </div>

                    {/* Action to bill hours */}
                    {(task.trackedHours && task.trackedHours > 0) ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleOpenBillingModal(task); }}
                        className="bg-sky-50 hover:bg-sky-100 border border-sky-100/60 text-sky-800 font-extrabold text-[8.5px] uppercase tracking-wider py-1 px-2.5 rounded-xl flex items-center gap-1 transition-all active:scale-95 shadow-sm"
                      >
                        <DollarSign className="w-3 h-3 animate-pulse" /> Add to invoice
                      </button>
                    ) : null}
                  </div>
                </div>
                ));
              })()}
            </div>
          )}
        </div>
        )}

        {/* 3. Financial Documents Module */}
        {projectDetailTab === 'documents' && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-4 animate-fade-in">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-sky-600" /> Quotes and invoices
            </h3>
          </div>

          {/* List of Linked Docs */}
          {linkedDocuments.length === 0 ? (
            <div className="text-center py-6 px-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-slate-500">
              <p className="text-[11px] font-semibold text-slate-600">No quotes or invoices linked yet.</p>
              <p className="text-[9px] text-slate-400 mt-0.5 max-w-[250px] mx-auto leading-normal">
                Create one below, or link one you already have.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {linkedDocuments.map((doc) => {
                let colorClasses = "bg-sky-50 text-sky-700 border-sky-100";
                if (doc.type === 'quote') {
                  colorClasses = "bg-amber-50 text-amber-700 border-amber-100";
                } else if (doc.type === 'receipt') {
                  colorClasses = "bg-emerald-50 text-emerald-700 border-emerald-100";
                }

                return (
                  <div 
                    key={doc.id}
                    className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between gap-2.5 hover:border-slate-200 transition-all"
                  >
                    <div 
                      onClick={() => onNavigateToTab?.('billing', doc.id)}
                      className="flex items-center space-x-2.5 min-w-0 cursor-pointer flex-1"
                    >
                      <div className={`w-8.5 h-8.5 rounded-lg border flex flex-col items-center justify-center ${colorClasses} shrink-0`}>
                        <span className="text-[7.5px] font-extrabold uppercase tracking-tight leading-none">
                          {doc.type.slice(0, 3)}
                        </span>
                        <span className="text-[8px] font-semibold mt-0.5">
                          #{doc.documentNumber.split('-').pop()}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-bold text-slate-800 font-mono">#{doc.documentNumber}</span>
                          <span className={`px-1 py-0.5 rounded text-[7px] font-extrabold uppercase ${
                            doc.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                            doc.status === 'sent' ? 'bg-sky-100 text-sky-700' :
                            doc.status === 'draft' ? 'bg-slate-200 text-slate-600' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {doc.status}
                          </span>
                        </div>
                        <p className="text-[9px] text-slate-400 mt-0.5">
                          {data.userProfile.defaultCurrency} {doc.total.toLocaleString(undefined, { minimumFractionDigits: 2 })} • {doc.issueDate}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleUnlinkDocument(doc.id)}
                      title="Unlink document"
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick Creator / Linking Controls */}
          <div className="pt-3 border-t border-slate-100 space-y-3">
            {/* Quick Actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onNavigateToTab?.('billing', `NEW_QUOTE_FOR_PROJECT_${selectedProject.id}`)}
                className="flex-1 bg-amber-50 hover:bg-amber-100 border border-amber-100/60 text-amber-800 font-bold py-1.5 px-2.5 rounded-xl text-[10px] text-center transition-all flex items-center justify-center gap-1 active:scale-95"
              >
                + New quote
              </button>
              <button
                type="button"
                onClick={() => onNavigateToTab?.('billing', `NEW_INVOICE_FOR_PROJECT_${selectedProject.id}`)}
                className="flex-1 bg-sky-50 hover:bg-sky-100 border border-sky-100/60 text-sky-800 font-bold py-1.5 px-2.5 rounded-xl text-[10px] text-center transition-all flex items-center justify-center gap-1 active:scale-95"
              >
                + New invoice
              </button>
            </div>

            {/* Selector to Link Existing */}
            {(() => {
              const linkableDocs = (data.documents || []).filter(d => 
                d.businessId === data.activeBusinessId &&
                (!selectedProject.clientId || d.clientId === selectedProject.clientId) &&
                d.projectId !== selectedProject.id
              );

              if (linkableDocs.length === 0) return null;

              return (
                <div className="space-y-1">
                  <label className="block text-[8px] font-extrabold text-slate-400 uppercase tracking-wide">
                    Link a quote or invoice
                  </label>
                  <select
                    value=""
                    onChange={(e) => handleLinkExistingDocument(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-150 rounded-xl py-1.5 px-2.5 text-[10px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="" disabled>Choose a document</option>
                    {linkableDocs.map(doc => {
                      const clientName = data.clients.find(c => c.id === doc.clientId)?.name || 'Client';
                      return (
                        <option key={doc.id} value={doc.id}>
                          {doc.type.toUpperCase()} #{doc.documentNumber} - {clientName} ({data.userProfile.defaultCurrency} {doc.total.toLocaleString()})
                        </option>
                      );
                    })}
                  </select>
                </div>
              );
            })()}
          </div>
        </div>
        )}

        {/* SOW Builder: Add / Edit Section Modal */}
        {showAddScopeModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in text-slate-700">
            <div className="bg-white w-full max-w-md rounded-2xl border border-slate-100 shadow-2xl overflow-hidden">
              <div className="bg-zinc-950 text-white p-4 flex justify-between items-center">
                <h3 className="text-xs font-black uppercase tracking-wider">
                  {editingScopeId ? 'Edit section' : 'Add section'}
                </h3>
                <button 
                  onClick={() => setShowAddScopeModal(false)}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer font-bold text-xs"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveScopeSection} className="p-5 space-y-4 text-left">
                {/* Scope Title */}
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-400 tracking-wider block">Section title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Phase 1: Website design"
                    value={scopeTitle}
                    onChange={(e) => setScopeTitle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-xl py-2 px-3 text-xs text-slate-800 transition-all font-semibold focus:outline-none"
                  />
                </div>

                {/* Scope Description */}
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-400 tracking-wider block">Description</label>
                  <textarea
                    rows={3}
                    placeholder="Describe the work in terms the client will understand"
                    value={scopeDesc}
                    onChange={(e) => setScopeDesc(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-xl py-2 px-3 text-xs text-slate-800 transition-all focus:outline-none"
                  />
                </div>

                {/* Section Cost (FJD) */}
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-400 tracking-wider block">Cost (FJD)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2 text-xs text-slate-400 font-bold">$</span>
                    <input
                      type="number"
                      min="0"
                      required
                      placeholder="2500"
                      value={scopeCost || ''}
                      onChange={(e) => setScopeCost(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-xl py-2 pl-7 pr-3 text-xs text-slate-800 transition-all font-semibold font-mono focus:outline-none"
                    />
                  </div>
                </div>

                {/* Scope Deliverables Bullet Items */}
                <div className="space-y-2 pt-1">
                  <label className="text-[8px] font-black uppercase text-slate-400 tracking-wider block">Deliverables</label>
                  
                  {/* Input with Plus */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Homepage and contact page"
                      value={newDeliverable}
                      onChange={(e) => setNewDeliverable(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddDeliverable();
                        }
                      }}
                      className="flex-1 bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-xl px-3 py-1.5 text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddDeliverable}
                      className="bg-zinc-900 hover:bg-zinc-800 text-white font-black px-3.5 rounded-xl text-xs cursor-pointer active:scale-95"
                    >
                      + Add
                    </button>
                  </div>

                  {/* List of deliverables added */}
                  {scopeDeliverables.length > 0 && (
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 max-h-32 overflow-y-auto space-y-1">
                      {scopeDeliverables.map((bullet, idx) => (
                        <div key={idx} className="flex justify-between items-center gap-2 text-[10px] text-slate-600">
                          <span className="flex items-center gap-1.5 truncate">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span className="truncate">{bullet}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveDeliverable(idx)}
                            className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer font-bold text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Submit / Cancel Buttons */}
                <div className="pt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddScopeModal(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2 rounded-xl text-xs text-center transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-sky-500 hover:bg-sky-400 text-white font-bold py-2 rounded-xl text-xs text-center transition-all cursor-pointer active:scale-95"
                  >
                    {editingScopeId ? 'Save changes' : 'Save section'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Billing Modal / Popover overlay */}
        {billingTask && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-sm w-full p-4 space-y-4 animate-fade-in text-slate-700">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest block">Bill tracked hours</span>
                  <h4 className="text-xs font-bold text-slate-800 mt-1 leading-tight">{billingTask.title}</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setBillingTask(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all font-bold text-xs"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleAddToInvoiceSubmit} className="space-y-3.5">
                {/* Statistics panel */}
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-wide">Hours tracked</span>
                    <p className="text-sm font-black text-slate-800 font-mono mt-0.5">{(billingTask.trackedHours || 0).toFixed(2)} hrs</p>
                  </div>
                  <div>
                    <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-wide font-sans">Subtotal</span>
                    <p className="text-sm font-black text-emerald-600 font-mono mt-0.5">
                      {data.userProfile.defaultCurrency} {((billingTask.trackedHours || 0) * billingRate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* Billing Rate */}
                <div className="space-y-1">
                  <label className="block text-[8px] font-extrabold text-slate-400 uppercase tracking-wider">
                    Hourly rate ({data.userProfile.defaultCurrency})
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 75"
                    value={billingRate}
                    onChange={(e) => setBillingRate(Math.max(1, parseFloat(e.target.value) || 0))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-slate-400 focus:bg-white transition-all font-mono"
                  />
                </div>

                {/* Target Invoice */}
                <div className="space-y-1">
                  <label className="block text-[8px] font-extrabold text-slate-400 uppercase tracking-wider">
                    Invoice
                  </label>
                  <select
                    value={selectedInvoiceId}
                    onChange={(e) => setSelectedInvoiceId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-slate-400 focus:bg-white transition-all text-slate-700 font-medium"
                  >
                    <option value="new">+ New draft invoice</option>
                    {(data.documents || [])
                      .filter(d => 
                        d.type === 'invoice' && 
                        d.status === 'draft' && 
                        d.clientId === selectedProject.clientId &&
                        d.businessId === data.activeBusinessId
                      )
                      .map(invoice => (
                        <option key={invoice.id} value={invoice.id}>
                          Add to draft #{invoice.documentNumber} ({data.userProfile.defaultCurrency} {invoice.total.toLocaleString()})
                        </option>
                      ))
                    }
                  </select>
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBillingTask(null)}
                    className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold py-2 rounded-xl text-xs text-center transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 rounded-xl text-xs text-center transition-all shadow-md active:scale-95"
                  >
                    Add to invoice
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {projectModal}
      </div>
    );
  }

  // Projects Dashboard View List
  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto pb-24 font-sans select-none animate-fade-in text-left">
      {/* Header section with Active Venture context & View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
        <div>
          <span className="text-[10px] font-bold text-sky-600 uppercase tracking-widest block">Projects</span>
          <h2 className="text-sm md:text-base font-bold text-slate-800 mt-0.5">{activeBiz ? activeBiz.name : 'All businesses'}</h2>
        </div>

        <div className="flex items-center gap-2">
          {/* View Switcher: Kanban vs Grid */}
          <div className="bg-slate-100 p-0.5 rounded-xl flex gap-0.5">
            <button
              type="button"
              onClick={() => setProjectsViewMode('kanban')}
              className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                projectsViewMode === 'kanban'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Kanban className="w-3.5 h-3.5 text-sky-600" />
              <span>Board</span>
            </button>
            <button
              type="button"
              onClick={() => setProjectsViewMode('grid')}
              className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                projectsViewMode === 'grid'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-slate-600" />
              <span>Grid</span>
            </button>
          </div>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white py-2 px-3.5 rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> New project
          </button>
        </div>
      </div>

      {/* Recharts Profitability and Cost Analytics */}
      <ProjectProfitabilityChart
        projects={filteredProjects}
        expenses={data.expenses || []}
        documents={data.documents || []}
        defaultCurrency={data.userProfile.defaultCurrency || 'FJD'}
      />

      {/* Conditional View: Kanban Board vs Grid/List View */}
      {projectsViewMode === 'kanban' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                Stages
              </h3>
              <span className="text-[10px] text-slate-400">
                (Drag a card to move it to another stage)
              </span>
            </div>
            <span className="text-[10px] font-bold text-slate-400 font-mono">
              {filteredProjects.length} projects
            </span>
          </div>

          <ProjectKanbanBoard
            projects={filteredProjects}
            clients={data.clients || []}
            baseCurrency={data.userProfile.defaultCurrency}
            activeTimerTaskId={selectedProject?.tasks?.find(t => !!t.timerStartedAt)?.id || null}
            runningProjectId={projects.find(p => p.tasks?.some(t => !!t.timerStartedAt))?.id || null}
            onSelectProject={(p) => setSelectedProjectId(p.id)}
            onUpdateProjectStatus={handleUpdateProjectStatus}
            onNewProject={(status) => handleOpenAddWithStatus(status)}
            onEditProject={(p) => handleOpenEdit(p, {} as any)}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Stats Quick-Banner */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-indigo-50/50 border border-indigo-100 p-2.5 rounded-2xl shadow-2xs">
              <span className="text-[8.5px] font-bold text-indigo-600 uppercase block tracking-wider">Leads</span>
              <span className="text-xs font-bold text-indigo-800 font-mono mt-0.5 block">
                {filteredProjects.filter(p => p.status === 'lead' || p.status === 'not_started').length}
              </span>
            </div>
            <div className="bg-sky-50/50 border border-sky-100 p-2.5 rounded-2xl shadow-2xs">
              <span className="text-[8.5px] font-bold text-sky-600 uppercase block tracking-wider">In progress</span>
              <span className="text-xs font-bold text-sky-800 font-mono mt-0.5 block">
                {filteredProjects.filter(p => p.status === 'in_progress').length}
              </span>
            </div>
            <div className="bg-amber-50/50 border border-amber-100 p-2.5 rounded-2xl shadow-2xs">
              <span className="text-[8.5px] font-bold text-amber-700 uppercase block tracking-wider">Review</span>
              <span className="text-xs font-bold text-amber-800 font-mono mt-0.5 block">
                {filteredProjects.filter(p => p.status === 'pending_review' || p.status === 'on_hold').length}
              </span>
            </div>
            <div className="bg-emerald-50/50 border border-emerald-100 p-2.5 rounded-2xl shadow-2xs">
              <span className="text-[8.5px] font-bold text-emerald-600 uppercase block tracking-wider">Completed</span>
              <span className="text-xs font-bold text-emerald-800 font-mono mt-0.5 block">
                {filteredProjects.filter(p => p.status === 'completed').length}
              </span>
            </div>
          </div>

          {/* Filters and search */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search projects"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200/80 rounded-xl py-2.5 pl-10 pr-4 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 shadow-2xs text-slate-800 placeholder-slate-400 font-sans"
              />
            </div>

            {/* Status Filters */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {['all', 'lead', 'in_progress', 'pending_review', 'completed', 'on_hold'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`py-1.5 px-3 text-[9px] font-bold uppercase rounded-xl border tracking-wider shrink-0 transition-all cursor-pointer ${
                    statusFilter === status
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-slate-500 border-slate-200/60 hover:bg-slate-50'
                  }`}
                >
                  {status === 'all' ? 'All' : status === 'lead' ? 'Leads' : status === 'in_progress' ? 'Active' : status === 'pending_review' ? 'Review' : status === 'completed' ? 'Done' : 'On hold'}
                </button>
              ))}
            </div>
          </div>

          {/* Projects List */}
          {filteredProjects.length === 0 ? (
            <div className="text-center py-12 px-4 bg-white rounded-2xl border border-slate-100 shadow-xs">
              <Briefcase className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-600">No projects found</p>
              <p className="text-[10px] text-slate-400 mt-0.5 max-w-[240px] mx-auto leading-relaxed">
                Create a project to track its tasks, deadlines and billing.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProjects.map((proj) => {
                const client = data.clients.find(c => c.id === proj.clientId);
                const totalTasks = proj.tasks?.length || 0;
                const completedTasks = proj.tasks?.filter(t => t.status === 'done').length || 0;
                const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

                return (
                  <div
                    key={proj.id}
                    onClick={() => setSelectedProjectId(proj.id)}
                    className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex flex-col hover:border-sky-300 cursor-pointer transition-colors space-y-3"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded tracking-wider border ${getStatusColor(proj.status)}`}>
                            {getStatusLabel(proj.status)}
                          </span>
                          {client && (
                            <span className="bg-slate-50 text-slate-500 text-[8px] font-medium px-1.5 py-0.5 rounded border border-slate-100 italic max-w-[120px] truncate">
                              {client.name}
                            </span>
                          )}
                        </div>
                        
                        <h3 className="text-xs font-bold text-slate-900 font-sans mt-1.5 tracking-tight truncate">
                          {proj.name}
                        </h3>
                      </div>

                      {/* Actions buttons */}
                      <div className="flex space-x-1 shrink-0">
                        <button
                          onClick={(e) => handleOpenEdit(proj, e)}
                          className="p-1.5 text-slate-400 hover:text-sky-700 hover:bg-sky-50 rounded-md transition-all"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDuplicateProject(proj, e)}
                          className="p-1.5 text-slate-400 hover:text-sky-700 hover:bg-sky-50 rounded-md transition-all"
                          title="Duplicate project"
                          aria-label={`Duplicate ${proj.name}`}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteProject(proj.id, e)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-2">
                      {proj.description || 'No description'}
                    </p>

                    {/* Progress bar and date/cost */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-50">
                      <div className="flex justify-between items-center text-[9px] font-medium text-slate-400">
                        <span className="font-mono">
                          {proj.startDate} ➔ {proj.endDate}
                        </span>
                        <ProjectCurrencyDisplay 
                          amount={proj.cost}
                          currency={resolveProjectCurrency(proj, client, data.userProfile.defaultCurrency)}
                          baseCurrency={data.userProfile.defaultCurrency}
                          variant="compact"
                          rateType={proj.rateType}
                        />
                      </div>

                      {/* Visual Progress */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-sky-500 h-full rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-[9px] font-bold text-slate-500 font-mono shrink-0">
                          {progress}% ({completedTasks}/{totalTasks})
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

        {projectModal}

      {/* Task Detail & Reference Management Modal */}
      {detailTask && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white w-full max-w-xl rounded-2xl border border-slate-100 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col text-slate-700">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
              <div className="min-w-0 flex-1 pr-4">
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-sky-400">Task details</span>
                <h3 className="text-sm font-bold truncate mt-0.5">
                  {detailTask.title}
                </h3>
              </div>
              <button 
                onClick={() => setDetailTask(null)}
                className="text-white/60 hover:text-white transition-colors text-lg font-bold bg-slate-800 hover:bg-slate-700 w-8 h-8 rounded-full flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              
              {/* Grid Layout: Left is properties, right is references */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Task Properties Box */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-3">
                  <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-slate-400" /> Details
                  </h4>

                  {/* Edit Title */}
                  <div className="space-y-1">
                    <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider">Title</label>
                    <input
                      type="text"
                      value={detailTask.title}
                      onChange={(e) => handleUpdateTaskDetail({ ...detailTask, title: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs focus:outline-none focus:border-slate-400 font-medium"
                    />
                  </div>

                  {/* Edit Description */}
                  <div className="space-y-1">
                    <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider">Description</label>
                    <textarea
                      value={detailTask.description || ''}
                      onChange={(e) => handleUpdateTaskDetail({ ...detailTask, description: e.target.value })}
                      placeholder="Add a description"
                      rows={2}
                      className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs focus:outline-none focus:border-slate-400 resize-none font-sans"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {/* Status Select */}
                    <div className="space-y-1">
                      <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider">Status</label>
                      <select
                        value={detailTask.status}
                        onChange={(e) => handleUpdateTaskDetail({ ...detailTask, status: e.target.value as any })}
                        className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs focus:outline-none focus:border-slate-400"
                      >
                        <option value="todo">To do</option>
                        <option value="in_progress">In progress</option>
                        <option value="done">Completed</option>
                      </select>
                    </div>

                    {/* Priority Select */}
                    <div className="space-y-1">
                      <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider">Priority</label>
                      <select
                        value={detailTask.priority || 'medium'}
                        onChange={(e) => handleUpdateTaskDetail({ ...detailTask, priority: e.target.value as any })}
                        className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs focus:outline-none focus:border-slate-400"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>

                  {/* Due Date */}
                  <DateInput
                    label="Due date"
                    value={detailTask.dueDate || ''}
                    onChange={(newDate) => handleUpdateTaskDetail({ ...detailTask, dueDate: newDate })}
                    placeholder="Set due date"
                  />

                  {/* Time tracking summary */}
                  <div className="bg-white p-2.5 rounded-lg border border-slate-150">
                    <span className="text-[7.5px] font-extrabold uppercase text-slate-400 tracking-wider">Time tracked</span>
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center gap-1.5">
                        <Clock className={`w-3.5 h-3.5 ${detailTask.timerStartedAt ? 'text-emerald-500 animate-pulse' : 'text-slate-400'}`} />
                        <span className="text-xs font-bold font-mono text-slate-800">
                          {detailTask.timerStartedAt ? 'Timer running…' : `${(detailTask.trackedHours || 0).toFixed(2)} hrs`}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* References Box */}
                <div className="space-y-3 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center justify-between">
                      <span>Notes and links</span>
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[8px] text-slate-500 font-mono">
                        {(detailTask.references || []).length} items
                      </span>
                    </h4>

                    {/* Reference List */}
                    <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                      {(!detailTask.references || detailTask.references.length === 0) ? (
                        <div className="text-center py-6 px-4 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                          <Link2 className="w-5 h-5 text-slate-300 mx-auto mb-1" />
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-relaxed">No notes or links yet</p>
                          <p className="text-[8px] text-slate-400 max-w-[160px] mx-auto leading-normal mt-0.5">Add a note or link below.</p>
                        </div>
                      ) : (
                        detailTask.references.map((ref) => (
                          <div 
                            key={ref.id}
                            className="p-2 bg-slate-50/70 border border-slate-150/70 hover:border-slate-300 rounded-xl flex items-start gap-2 transition-all group"
                          >
                            <span className="p-1 bg-white border border-slate-200 rounded-lg text-slate-500 mt-0.5">
                              {ref.type === 'link' ? <Link2 className="w-3.5 h-3.5 text-sky-600" /> : <FileText className="w-3.5 h-3.5 text-amber-500" />}
                            </span>
                            
                            <div className="flex-1 min-w-0">
                              <h5 className="text-[10px] font-bold text-slate-800 truncate leading-snug">{ref.title}</h5>
                              
                              {ref.type === 'link' ? (
                                <a 
                                  href={ref.content.startsWith('http') ? ref.content : `https://${ref.content}`}
                                  target="_blank" 
                                  referrerPolicy="no-referrer"
                                  rel="noopener noreferrer"
                                  className="text-[9px] text-sky-600 font-medium hover:underline flex items-center gap-0.5 truncate mt-0.5"
                                >
                                  {ref.content}
                                </a>
                              ) : (
                                <p className="text-[9.5px] text-slate-500 mt-0.5 leading-relaxed whitespace-pre-wrap font-sans break-words bg-white/60 p-1 rounded border border-slate-100/50">
                                  {ref.content}
                                </p>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveReference(ref.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all shrink-0"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Add New Reference Form */}
                  <form onSubmit={handleAddReference} className="border-t border-slate-100 pt-3 space-y-2 shrink-0">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Add a note or link</span>
                    
                    {/* Segmented type tab selector */}
                    <div className="grid grid-cols-2 gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-150/50">
                      <button
                        type="button"
                        onClick={() => setRefType('note')}
                        className={`py-1 text-[9px] font-extrabold uppercase tracking-wide rounded transition-all ${
                          refType === 'note' 
                            ? 'bg-white text-slate-800 shadow-xs' 
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Note
                      </button>
                      <button
                        type="button"
                        onClick={() => setRefType('link')}
                        className={`py-1 text-[9px] font-extrabold uppercase tracking-wide rounded transition-all ${
                          refType === 'link' 
                            ? 'bg-white text-slate-800 shadow-xs' 
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Link
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-1.5">
                      <input
                        type="text"
                        required
                        placeholder="Title (e.g. Client feedback)"
                        value={refTitle}
                        onChange={(e) => setRefTitle(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1 px-2.5 text-xs focus:outline-none focus:border-slate-400"
                      />

                      {refType === 'link' ? (
                        <input
                          type="text"
                          required
                          placeholder="URL (e.g. figma.com/file/…)"
                          value={refContent}
                          onChange={(e) => setRefContent(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1 px-2.5 text-xs focus:outline-none focus:border-slate-400 font-mono"
                        />
                      ) : (
                        <textarea
                          required
                          placeholder="Write your note"
                          value={refContent}
                          onChange={(e) => setRefContent(e.target.value)}
                          rows={2}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1 px-2.5 text-xs focus:outline-none focus:border-slate-400 resize-none font-sans"
                        />
                      )}
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-1.5 rounded-lg text-xs transition-all tracking-wide flex items-center justify-center gap-1 active:scale-[0.98]"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  </form>
                </div>

              </div>

            </div>

            {/* Modal Footer Controls */}
            <div className="bg-slate-50 p-3.5 border-t border-slate-100 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setDetailTask(null)}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

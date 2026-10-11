import MarkdownText from './MarkdownText';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, Send, Bot, User, Trash2, HelpCircle, 
  ChevronRight, ArrowRight, ShieldCheck, Scale, FileText, Smartphone,
  Paperclip, Image as ImageIcon, File, X, Mail, CheckCircle2, Brain,
  History, Plus, Search, Download, ExternalLink, Copy, Check,
  Calendar, DollarSign, AlertCircle, Eye, RefreshCw, ChevronLeft,
  CheckCheck, MessageSquare, ChevronDown
} from 'lucide-react';
import { 
  CRMData, 
  AiConversationSession, 
  AiChatMessage, 
  AiAttachment, 
  AiMemoryItem,
  AiProposal
} from '../types';

interface AiAssistantViewProps {
  data: CRMData;
  onUpdateData?: (newData: CRMData) => void;
}

export default function AiAssistantView({ data, onUpdateData }: AiAssistantViewProps) {
  // Latest workspace, for updates made after an await (the server's writes arrive through the live listener).
  const dataRef = useRef(data);
  dataRef.current = data;
  // Active business context
  const activeBusiness = useMemo(() => {
    return data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];
  }, [data.businesses, data.activeBusinessId]);

  // Business summary context
  const summaryContext = useMemo(() => {
    const filteredDocs = data.documents.filter(doc => doc.businessId === data.activeBusinessId);
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalPending = 0;

    filteredDocs.forEach(doc => {
      if (doc.type === 'invoice') {
        totalInvoiced += doc.total;
        if (doc.status === 'paid') {
          totalPaid += doc.total;
        } else {
          totalPending += doc.total;
        }
      } else if (doc.type === 'receipt') {
        totalPaid += doc.total;
      }
    });

    let mrr = 0;
    const bizServices = data.services.filter(s => s.businessId === data.activeBusinessId);
    const bizServiceIds = bizServices.map(s => s.id);
    
    data.clients.forEach(client => {
      if (client.subscriptions) {
        client.subscriptions.forEach(sub => {
          if (sub.status === 'active' && bizServiceIds.includes(sub.serviceId)) {
            mrr += sub.price || 0;
          }
        });
      }
    });

    return {
      clientsCount: data.clients.length,
      totalInvoiced,
      totalPaid,
      totalPending,
      mrr
    };
  }, [data.documents, data.services, data.clients, data.activeBusinessId]);

  // Current session & history management
  const sessions = useMemo(() => {
    return (data.aiConversations || []).filter(
      s => !s.businessId || s.businessId === data.activeBusinessId
    );
  }, [data.aiConversations, data.activeBusinessId]);

  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [showHistorySidebar, setShowHistorySidebar] = useState<boolean>(false);
  const [historySearch, setHistorySearch] = useState<string>('');

  // Memory bank state & modals
  const memories = useMemo(() => {
    return (data.aiMemories || []).filter(
      m => !m.businessId || m.businessId === data.activeBusinessId
    );
  }, [data.aiMemories, data.activeBusinessId]);

  const [showMemoryModal, setShowMemoryModal] = useState<boolean>(false);
  const [memoryFilter, setMemoryFilter] = useState<string>('all');
  const [newMemoryInput, setNewMemoryInput] = useState<string>('');

  // Email transcript modal & state
  const [showEmailModal, setShowEmailModal] = useState<boolean>(false);
  const [recipientEmail, setRecipientEmail] = useState<string>('');
  const [emailNote, setEmailNote] = useState<string>('');
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);
  const [emailSuccessMessage, setEmailSuccessMessage] = useState<string | null>(null);
  const [lastEmailPreviewHtml, setLastEmailPreviewHtml] = useState<string | null>(null);

  // Chat interaction & attachments state
  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<AiAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Ensure default welcome session exists
  const getInitialWelcomeMessage = (bizName?: string): AiChatMessage => ({
    id: `msg-welcome-${Date.now()}`,
    sender: 'ai',
    text: `### Assistant

Ask me anything about running **${bizName || activeBusiness?.name || 'your business'}** or using Frilensa.

* **How-to questions**: "How do I send a rate card?" I answer from Frilensa's help articles.
* **Your figures**: "Who owes me money?", "What did I spend on fuel last quarter?" I look them up in your records.
* **Getting things done**: "Add a task to follow up with Coral Coast on Friday", "Draft an invoice for 10 hours of design". I set it up and you press **Confirm** before anything is saved.
* **Files**: attach a receipt, invoice or bank statement (photo, PDF or CSV) and I'll read it.

I never send anything to clients or record payments. You do that in Frilensa.`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });

  // Initialize or load active session
  useEffect(() => {
    if (sessions.length > 0) {
      if (!activeSessionId || !sessions.some(s => s.id === activeSessionId)) {
        setActiveSessionId(sessions[0].id);
      }
    } else {
      // Create initial session
      const newSession: AiConversationSession = {
        id: `session-${Date.now()}`,
        title: `New consultation`,
        businessId: data.activeBusinessId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'active',
        messages: [getInitialWelcomeMessage()]
      };

      if (onUpdateData) {
        onUpdateData({
          ...data,
          aiConversations: [newSession, ...(data.aiConversations || [])]
        });
      }
      setActiveSessionId(newSession.id);
    }
  }, [data.activeBusinessId, sessions.length]);

  // Set recipient email default to user profile email
  useEffect(() => {
    setRecipientEmail(data.userProfile?.email || '');
  }, [data.userProfile?.email]);

  const currentSession = useMemo(() => {
    return sessions.find(s => s.id === activeSessionId) || sessions[0] || null;
  }, [sessions, activeSessionId]);

  const messages = useMemo(() => {
    return currentSession?.messages || [];
  }, [currentSession]);

  // Auto Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading]);

  // Create new consultation session
  const handleCreateNewSession = () => {
    const newSession: AiConversationSession = {
      id: `session-${Date.now()}`,
      title: `Consultation - ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      businessId: data.activeBusinessId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      messages: [getInitialWelcomeMessage(activeBusiness?.name)]
    };

    const updated = [newSession, ...(data.aiConversations || [])];
    if (onUpdateData) {
      onUpdateData({
        ...data,
        aiConversations: updated
      });
    }
    setActiveSessionId(newSession.id);
    setShowHistorySidebar(false);
  };

  // Delete session
  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this consultation?")) return;

    const updated = (data.aiConversations || []).filter(s => s.id !== sessionId);
    if (onUpdateData) {
      onUpdateData({
        ...data,
        aiConversations: updated
      });
    }

    if (activeSessionId === sessionId) {
      const remaining = updated.filter(s => !s.businessId || s.businessId === data.activeBusinessId);
      if (remaining.length > 0) {
        setActiveSessionId(remaining[0].id);
      } else {
        handleCreateNewSession();
      }
    }
  };

  // Mark session completed
  const handleToggleSessionStatus = (sessionId: string) => {
    const updated = (data.aiConversations || []).map(s => {
      if (s.id === sessionId) {
        const nextStatus = s.status === 'completed' ? 'active' : 'completed';
        return {
          ...s,
          status: nextStatus as any,
          completedAt: nextStatus === 'completed' ? new Date().toISOString() : undefined,
          updatedAt: new Date().toISOString()
        };
      }
      return s;
    });

    if (onUpdateData) {
      onUpdateData({
        ...data,
        aiConversations: updated
      });
    }
  };

  // Add extracted memories into CRMData
  const recordNewMemories = (facts: string[], sourceId?: string) => {
    if (!facts || facts.length === 0) return;
    const existing = data.aiMemories || [];
    const newItems: AiMemoryItem[] = facts
      .map(f => f.trim())
      .filter(f => f.length > 8 && !existing.some(m => m.fact.toLowerCase() === f.toLowerCase()))
      .map(fact => {
        let cat: AiMemoryItem['category'] = 'general';
        const lower = fact.toLowerCase();
        if (lower.includes('tax') || lower.includes('vat') || lower.includes('tin') || lower.includes('frcs')) cat = 'tax';
        else if (lower.includes('bank') || lower.includes('bsp') || lower.includes('anz') || lower.includes('m-paisa') || lower.includes('mycash') || lower.includes('fee')) cat = 'financial';
        else if (lower.includes('client') || lower.includes('invoice') || lower.includes('rate') || lower.includes('quote')) cat = 'client';
        else if (lower.includes('prefer') || lower.includes('always') || lower.includes('never') || lower.includes('like')) cat = 'preference';

        return {
          id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          businessId: data.activeBusinessId,
          fact,
          category: cat,
          confidence: 90,
          sourceSessionId: sourceId,
          createdAt: new Date().toISOString()
        };
      });

    if (newItems.length > 0 && onUpdateData) {
      onUpdateData({
        ...data,
        aiMemories: [...newItems, ...existing]
      });
    }
  };

  // Add manual memory
  const handleAddManualMemory = () => {
    if (!newMemoryInput.trim()) return;
    recordNewMemories([newMemoryInput.trim()], activeSessionId);
    setNewMemoryInput('');
  };

  // Delete memory
  const handleDeleteMemory = (memId: string) => {
    const updated = (data.aiMemories || []).filter(m => m.id !== memId);
    if (onUpdateData) {
      onUpdateData({
        ...data,
        aiMemories: updated
      });
    }
  };

  // File Upload Handlers
  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newAtts: AiAttachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 15 * 1024 * 1024) {
        alert(`"${file.name}" is larger than 15MB. Choose a smaller file.`);
        continue;
      }

      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        newAtts.push({
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl
        });
      } catch (err) {
        console.error('Error reading file attachment:', err);
      }
    }

    setPendingAttachments(prev => [...prev, ...newAtts]);
  };

  const handleRemovePendingAttachment = (index: number) => {
    setPendingAttachments(prev => prev.filter((_, idx) => idx !== index));
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  // Send message
  const handleSendMessage = async (textToSend: string, attachmentsToSend: AiAttachment[] = pendingAttachments) => {
    if ((!textToSend.trim() && attachmentsToSend.length === 0) || isLoading || !currentSession) return;

    const userMessageText = textToSend.trim();
    const userMsg: AiChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: userMessageText || (attachmentsToSend.length > 0 ? "Attached a document." : ""),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachments: attachmentsToSend.length > 0 ? [...attachmentsToSend] : undefined
    };

    const updatedSessionMessages = [...(currentSession.messages || []), userMsg];

    // Auto-update session title if it was initial
    let newTitle = currentSession.title;
    if (currentSession.messages.length <= 1 && userMessageText) {
      newTitle = userMessageText.length > 35 
        ? `${userMessageText.substring(0, 32)}…` 
        : userMessageText;
    }

    const updatedSession: AiConversationSession = {
      ...currentSession,
      title: newTitle,
      updatedAt: new Date().toISOString(),
      messages: updatedSessionMessages
    };

    // Save user message immediately
    const updatedConversations = (data.aiConversations || []).map(s => 
      s.id === currentSession.id ? updatedSession : s
    );

    if (onUpdateData) {
      onUpdateData({
        ...data,
        aiConversations: updatedConversations
      });
    }

    setInput('');
    setPendingAttachments([]);
    setIsLoading(true);

    try {
      const activeMemoriesList = memories.map(m => m.fact);

      const payload = {
        message: userMessageText,
        history: updatedSessionMessages.slice(0, -1),
        memories: activeMemoriesList,
        attachments: attachmentsToSend.map(a => ({
          name: a.name,
          type: a.type,
          dataUrl: a.dataUrl
        })),
        businessContext: {
          name: activeBusiness?.name,
          type: activeBusiness?.type,
          tin: activeBusiness?.tin,
          address: activeBusiness?.address,
          defaultVatRate: data.userProfile.defaultVatRate ?? 12.5
        },
        summaryContext
      };

      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const replyData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw Object.assign(new Error(replyData?.error || 'The assistant did not respond'), { unavailable: Boolean(replyData?.unavailable), status: res.status });
      }

      const aiMsg: AiChatMessage = {
        id: `msg-ai-${Date.now()}`,
        sender: 'ai',
        text: replyData.reply,
        isFallback: replyData.isFallback,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        memoryExtracted: replyData.newMemories && replyData.newMemories.length > 0 ? replyData.newMemories : undefined,
        proposals: Array.isArray(replyData.proposals) && replyData.proposals.length > 0
          ? replyData.proposals.map((p: AiProposal) => ({ ...p, status: 'pending' as const }))
          : undefined
      };

      // Save AI reply and new memories
      const finalMessages = [...updatedSessionMessages, aiMsg];
      const finalSession: AiConversationSession = {
        ...updatedSession,
        updatedAt: new Date().toISOString(),
        messages: finalMessages
      };

      const finalConversations = (dataRef.current.aiConversations || []).map(s => 
        s.id === currentSession.id ? finalSession : s
      );

      // Extract new memories if present
      let updatedMemories = dataRef.current.aiMemories || [];
      if (replyData.newMemories && replyData.newMemories.length > 0) {
        const newAdditions: AiMemoryItem[] = replyData.newMemories
          .map((f: string) => f.trim())
          .filter((f: string) => f.length > 8 && !updatedMemories.some(m => m.fact.toLowerCase() === f.toLowerCase()))
          .map((fact: string) => ({
            id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            businessId: dataRef.current.activeBusinessId,
            fact,
            category: 'workflow' as const,
            confidence: 90,
            sourceSessionId: currentSession.id,
            createdAt: new Date().toISOString()
          }));

        updatedMemories = [...newAdditions, ...updatedMemories];
      }

      if (onUpdateData) {
        onUpdateData({
          ...dataRef.current,
          aiConversations: finalConversations,
          aiMemories: updatedMemories
        });
      }

    } catch (err: any) {
      console.error(err);
      const fallbackAiMsg: AiChatMessage = {
        id: `msg-err-${Date.now()}`,
        sender: 'ai',
        text: err?.unavailable
          ? `### The assistant isn't set up yet\n\nIt needs an Anthropic API key on the server. If you run this Frilensa, add the key and deploy again (the deploy script asks for it).`
          : `### The assistant didn't respond\n\n${err?.status === 429 ? 'You have reached the limit of questions for this hour. Try again later.' : err?.status === 503 ? 'It is busy right now. Send your message again in a minute.' : 'This is usually a connection problem. Send your message again to retry.'}`,
        isFallback: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      const finalMessages = [...updatedSessionMessages, fallbackAiMsg];
      const finalSession: AiConversationSession = {
        ...updatedSession,
        updatedAt: new Date().toISOString(),
        messages: finalMessages
      };

      const finalConversations = (dataRef.current.aiConversations || []).map(s => 
        s.id === currentSession.id ? finalSession : s
      );

      if (onUpdateData) {
        onUpdateData({
          ...dataRef.current,
          aiConversations: finalConversations
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Confirm or dismiss something the assistant proposed. The server saves it; the workspace
  // listener brings the new record into the app.
  const setProposal = (messageId: string, proposalId: string, patch: Partial<AiProposal>) => {
    if (!onUpdateData || !currentSession) return;
    const latest = dataRef.current;
    onUpdateData({
      ...latest,
      aiConversations: (latest.aiConversations || []).map(sess => sess.id !== currentSession.id ? sess : {
        ...sess,
        updatedAt: new Date().toISOString(),
        messages: sess.messages.map(msg => msg.id !== messageId ? msg : {
          ...msg,
          proposals: (msg.proposals || []).map(p => p.id === proposalId ? { ...p, ...patch } : p)
        })
      })
    });
  };

  const DONE_NOTE: Record<AiProposal['kind'], string> = {
    task: 'Task added. You can find it in Projects.',
    client: 'Client added. You can find it in Clients.',
    draft_document: 'Draft saved. Review and send it from Billing.',
    expense: 'Expense saved. You can find it in Finance → P&L.'
  };

  const handleConfirmProposal = async (messageId: string, proposal: AiProposal) => {
    setProposal(messageId, proposal.id, { status: 'saving', note: undefined });
    try {
      const res = await fetch('/api/ai/assistant/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: proposal.kind, input: proposal.input })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'It could not be saved.');
      const number = body?.document?.documentNumber ? ` (${body.document.documentNumber})` : '';
      setProposal(messageId, proposal.id, { status: 'done', note: DONE_NOTE[proposal.kind].replace('Draft saved.', `Draft saved${number}.`) });
    } catch (err: any) {
      setProposal(messageId, proposal.id, { status: 'failed', note: err?.message || 'It could not be saved. Try again.' });
    }
  };

  // Send Email Transcript
  const handleSendEmailTranscript = async () => {
    if (!recipientEmail || !currentSession) return;
    setIsSendingEmail(true);
    setEmailSuccessMessage(null);

    try {
      const res = await fetch('/api/ai/email-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail,
          sessionTitle: currentSession.title,
          businessName: activeBusiness?.name || "Frilensa Client Business",
          messages: currentSession.messages,
          memories: memories.slice(0, 5),
          notes: emailNote,
          customSubject: `Frilensa AI transcript: ${currentSession.title}`
        })
      });

      if (!res.ok) {
        throw new Error('the email service returned an error');
      }

      const result = await res.json();
      setEmailSuccessMessage(result.message || `Transcript sent to ${recipientEmail}`);
      setLastEmailPreviewHtml(result.previewHtml);

      // Mark session as completed with email audit
      const updatedSession: AiConversationSession = {
        ...currentSession,
        status: 'completed',
        completedAt: new Date().toISOString(),
        emailedTo: recipientEmail,
        emailedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const updatedSessions = (data.aiConversations || []).map(s => 
        s.id === currentSession.id ? updatedSession : s
      );

      if (onUpdateData) {
        onUpdateData({
          ...data,
          aiConversations: updatedSessions
        });
      }

    } catch (err: any) {
      console.error('Email dispatch error:', err);
      alert('Could not send the transcript: ' + (err.message || 'check your connection and try again.'));
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Copy message text
  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered session list
  const filteredSessions = useMemo(() => {
    if (!historySearch.trim()) return sessions;
    const query = historySearch.toLowerCase();
    return sessions.filter(s => 
      s.title.toLowerCase().includes(query) ||
      s.messages.some(m => m.text.toLowerCase().includes(query))
    );
  }, [sessions, historySearch]);

  const renderMarkdown = (text: string) => <MarkdownText text={text} />;

  const suggestions = [
    { label: "Who owes me", icon: Scale, prompt: "Which invoices are overdue, and who owes me the most?" },
    { label: "Tasks due", icon: FileText, prompt: "What tasks are due this week across my projects?" },
    { label: "Add a task", icon: Bot, prompt: "Add a task to my newest project to send the client a progress update by Friday." },
    { label: "How-to", icon: Smartphone, prompt: "How do I let clients pay my invoices with M-PAiSA, and confirm their payment?" }
  ];

  return (
    <div 
      ref={dropZoneRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex flex-col md:flex-row h-[calc(100dvh-140px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] md:h-[calc(100vh-120px)] max-w-6xl w-full mx-auto bg-slate-50 font-sans md:rounded-2xl md:border md:border-slate-200/80 md:shadow-xs md:my-4 overflow-hidden"
    >
      {/* Drag & drop overlay indicator */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-sky-600/90 backdrop-blur-xs flex flex-col items-center justify-center text-white p-6 transition-all">
          <Paperclip className="w-12 h-12 mb-3 animate-bounce" />
          <h3 className="text-lg font-black tracking-tight">Drop files here to attach</h3>
          <p className="text-xs text-sky-100 max-w-sm text-center mt-1">
            Bank statements (PDF, CSV), receipt photos or invoices.
          </p>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,application/pdf,.csv,.txt,.xlsx,.xls"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {/* LEFT SIDEBAR: Conversation Records & Sessions */}
      <div className={`
        fixed inset-y-0 left-0 z-40 w-72 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 ease-in-out md:relative md:translate-x-0 md:z-auto
        ${showHistorySidebar ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Sidebar Header */}
        <div className="p-3.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-sky-50 text-sky-600 rounded-lg">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-900 tracking-tight">Consultations</h3>
              <p className="text-[9px] text-slate-400 font-medium">{sessions.length} saved</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCreateNewSession}
              className="p-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
              title="New consultation"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold pr-1">New</span>
            </button>
            <button
              onClick={() => setShowHistorySidebar(false)}
              className="md:hidden p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Conversations */}
        <div className="p-2.5 border-b border-slate-100">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search consultations"
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        {/* Memory Bank Button in Sidebar */}
        <div className="p-2.5 bg-slate-50/70 border-b border-slate-100">
          <button
            onClick={() => setShowMemoryModal(true)}
            className="w-full flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200/80 hover:border-sky-300 hover:shadow-xs transition-all text-left group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg group-hover:bg-amber-100">
                <Brain className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-800 block">AI memory</span>
                <span className="text-[9px] text-slate-400">{memories.length} facts saved</span>
              </div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600" />
          </button>
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredSessions.length === 0 ? (
            <div className="p-4 text-center text-[10px] text-slate-400">
              No consultations match your search.
            </div>
          ) : (
            filteredSessions.map((s) => {
              const isSelected = s.id === activeSessionId;
              const isCompleted = s.status === 'completed';

              return (
                <div
                  key={s.id}
                  onClick={() => {
                    setActiveSessionId(s.id);
                    setShowHistorySidebar(false);
                  }}
                  className={`group relative p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-sky-50/80 border-sky-200 text-sky-950 shadow-xs'
                      : 'bg-white hover:bg-slate-50/80 border-slate-100 text-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <span className="text-[11px] font-bold truncate flex-1 leading-snug">
                      {s.title}
                    </span>
                    <button
                      onClick={(e) => handleDeleteSession(s.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-600 text-slate-400 rounded transition-opacity"
                      title="Delete consultation"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between mt-1 text-[9px] text-slate-400">
                    <span className="font-mono">
                      {new Date(s.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {isCompleted ? (
                        <span className="flex items-center gap-0.5 text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded text-[8.5px]">
                          <CheckCheck className="w-2.5 h-2.5" /> Completed
                        </span>
                      ) : (
                        <span className="text-sky-600 font-semibold text-[8.5px]">
                          {s.messages.length} msgs
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Backdrop for mobile drawer */}
      {showHistorySidebar && (
        <div 
          onClick={() => setShowHistorySidebar(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-xs md:hidden"
        />
      )}

      {/* RIGHT/MAIN: Active Consultation Workspace */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
        
        {/* Workspace Top Action Bar */}
        <div className="bg-white px-3.5 py-2.5 border-b border-slate-200/80 shadow-xs flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {/* Toggle History on Mobile / Desktop */}
            <button
              onClick={() => setShowHistorySidebar(prev => !prev)}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg md:hidden"
              title="Consultations"
            >
              <History className="w-4 h-4" />
            </button>

            <div className="p-1.5 bg-sky-500/10 text-sky-600 rounded-xl border border-sky-500/20 shrink-0">
              <Bot className="w-5 h-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs font-black text-slate-900 tracking-tight truncate">
                  {currentSession?.title || 'Assistant'}
                </h2>
                {currentSession?.status === 'completed' ? (
                  <span className="text-[8px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.5 rounded tracking-wider uppercase shrink-0">
                    Completed
                  </span>
                ) : (
                  <span className="text-[8px] bg-sky-100 text-sky-800 font-extrabold px-1.5 py-0.5 rounded tracking-wider uppercase shrink-0">
                    Active
                  </span>
                )}
              </div>
              <p className="text-[9px] text-slate-400 font-medium truncate">
                Context: <strong className="text-slate-600">{activeBusiness?.name}</strong> &bull; {memories.length} saved facts
              </p>
            </div>
          </div>

          {/* Action Buttons: Memory Bank & Email Transcript */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setShowMemoryModal(true)}
              className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:border-amber-400 hover:bg-amber-50/50 text-[11px] font-bold transition-all cursor-pointer"
              title="Open AI memory"
            >
              <Brain className="w-3.5 h-3.5 text-amber-500" />
              <span>Memory</span>
              <span className="bg-amber-100 text-amber-800 text-[9px] px-1 rounded-full font-mono">
                {memories.length}
              </span>
            </button>

            <button
              onClick={() => setShowEmailModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 text-[11px] font-extrabold transition-all cursor-pointer"
              title="Email a transcript of this consultation"
            >
              <Mail className="w-3.5 h-3.5 text-sky-600" />
              <span>Email transcript</span>
            </button>

            {currentSession && (
              <button
                onClick={() => handleToggleSessionStatus(currentSession.id)}
                className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                  currentSession.status === 'completed'
                    ? 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-100'
                }`}
                title={currentSession.status === 'completed' ? "Reopen" : "Mark as completed"}
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Financial Banner */}
        <div className="bg-sky-50/60 px-4 py-1.5 border-b border-slate-100 flex items-center justify-between text-[8.5px] font-mono text-sky-900 shrink-0">
          <span className="truncate">TIN: <strong>{activeBusiness?.tin || 'Not recorded'}</strong></span>
          <span className="shrink-0 font-bold">Outstanding: FJD ${summaryContext.totalPending}</span>
        </div>

        {/* Email Dispatched Alert Banner if recently sent */}
        {emailSuccessMessage && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-[10px] text-emerald-800 flex items-center justify-between animate-fade-in shrink-0">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{emailSuccessMessage}</span>
            </div>
            <button
              onClick={() => setEmailSuccessMessage(null)}
              className="text-emerald-700 hover:text-emerald-900 font-bold ml-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[88%] sm:max-w-[82%] rounded-2xl p-3.5 shadow-xs border ${
                m.sender === 'user' 
                  ? 'bg-sky-600 text-white rounded-br-none border-sky-600/10' 
                  : 'bg-white text-slate-800 rounded-bl-none border-slate-200/80'
              }`}>
                
                {/* Render Attachments in Bubble */}
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mb-2.5 space-y-1.5">
                    {m.attachments.map((att, attIdx) => {
                      const isImg = att.type.startsWith('image/') || att.name.match(/\.(jpg|jpeg|png|webp)$/i);
                      const isPdf = att.type.includes('pdf') || att.name.endsWith('.pdf');

                      return (
                        <div 
                          key={attIdx}
                          className={`flex items-center gap-2 p-2 rounded-xl border ${
                            m.sender === 'user'
                              ? 'bg-sky-700/60 border-sky-500/40 text-white'
                              : 'bg-slate-50 border-slate-200 text-slate-800'
                          }`}
                        >
                          {isImg && att.dataUrl ? (
                            <img 
                              src={att.dataUrl} 
                              alt={att.name} 
                              onClick={() => setPreviewImage({ url: att.dataUrl!, title: att.name })}
                              className="w-10 h-10 object-cover rounded-lg border border-black/10 cursor-pointer hover:opacity-90 shrink-0"
                            />
                          ) : (
                            <div className="p-2 bg-sky-100 text-sky-700 rounded-lg shrink-0">
                              {isPdf ? <FileText className="w-4 h-4" /> : <File className="w-4 h-4" />}
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <span className="text-[11px] font-bold block truncate">{att.name}</span>
                            <span className="text-[9px] opacity-75 font-mono block">
                              {att.size ? `${(att.size / 1024).toFixed(1)} KB` : isPdf ? 'PDF' : 'Attachment'}
                            </span>
                          </div>

                          {att.dataUrl && (
                            <button
                              onClick={() => setPreviewImage({ url: att.dataUrl!, title: att.name })}
                              className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
                              title="Preview"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Message Text Content */}
                <div className="space-y-1">
                  {m.sender === 'user' ? (
                    <p className="text-xs text-slate-50 font-medium whitespace-pre-wrap">{m.text}</p>
                  ) : (
                    <div className="prose prose-sm max-w-none text-slate-800">
                      {renderMarkdown(m.text)}
                    </div>
                  )}
                </div>

                {/* Memory Extracted Badge */}
                {m.memoryExtracted && m.memoryExtracted.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-col gap-1">
                    <span className="text-[8px] font-extrabold uppercase tracking-wider text-amber-600 flex items-center gap-1">
                      <Brain className="w-2.5 h-2.5" /> Saved to memory
                    </span>
                    {m.memoryExtracted.map((f, fIdx) => (
                      <span key={fIdx} className="text-[9.5px] bg-amber-50/80 border border-amber-200/60 text-amber-900 px-2 py-0.5 rounded-md">
                        {f}
                      </span>
                    ))}
                  </div>
                )}

                {/* Proposals waiting for confirmation */}
                {m.proposals && m.proposals.length > 0 && (
                  <div className="mt-2.5 space-y-2">
                    {m.proposals.map(p => (
                      <div key={p.id} className="border border-sky-200 bg-sky-50/60 rounded-xl p-2.5 text-xs">
                        <p className="font-bold text-slate-900">{p.title}</p>
                        {p.details.length > 0 && (
                          <ul className="mt-1 text-[11px] text-slate-600 space-y-0.5">
                            {p.details.map((d, i) => <li key={i}>{d}</li>)}
                          </ul>
                        )}
                        {p.status === 'done' ? (
                          <p className="mt-2 text-[11px] font-semibold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {p.note}</p>
                        ) : p.status === 'dismissed' ? (
                          <p className="mt-2 text-[11px] text-slate-400">Dismissed</p>
                        ) : (
                          <>
                            {p.status === 'failed' && <p className="mt-2 text-[11px] text-rose-600">{p.note}</p>}
                            <div className="mt-2 flex gap-2">
                              <button type="button" disabled={p.status === 'saving'} onClick={() => handleConfirmProposal(m.id, p)} className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold cursor-pointer disabled:opacity-60">
                                {p.status === 'saving' ? 'Saving…' : p.status === 'failed' ? 'Try again' : 'Confirm'}
                              </button>
                              <button type="button" disabled={p.status === 'saving'} onClick={() => setProposal(m.id, p.id, { status: 'dismissed' })} className="px-3 py-1.5 rounded-lg text-slate-500 text-[11px] font-bold cursor-pointer">
                                Dismiss
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Message footer & actions */}
                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100/20 text-[8px] text-slate-400">
                  <span className="font-mono">{m.timestamp}</span>
                  <div className="flex items-center gap-2">
                    {m.sender === 'ai' && m.isFallback && (
                      <span className="bg-amber-100 text-amber-800 px-1 py-0.5 rounded font-bold">Offline reply</span>
                    )}
                    <button
                      onClick={() => handleCopyMessage(m.id, m.text)}
                      className="hover:text-slate-600 transition-colors p-0.5"
                      title="Copy response"
                    >
                      {copiedId === m.id ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : <Copy className="w-2.5 h-2.5" />}
                    </button>
                  </div>
                </div>

              </div>
            </div>
          ))}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200/80 rounded-2xl rounded-bl-none p-3.5 shadow-xs max-w-[80%] flex items-center gap-2.5">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500"></span>
                </span>
                <span className="text-[10.5px] text-slate-600 font-bold font-mono animate-pulse">
                  Thinking…
                </span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Starters Panel (if few messages) */}
        {messages.length <= 1 && !isLoading && (
          <div className="px-3.5 py-2 border-t border-slate-100 bg-white shrink-0">
            <div className="flex items-center gap-1 mb-1.5 text-slate-400">
              <Sparkles className="w-3.5 h-3.5 text-sky-500" />
              <span className="text-[8.5px] font-bold uppercase tracking-wider">Try asking</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {suggestions.map((s, idx) => {
                const IconComp = s.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(s.prompt)}
                    className="p-2 bg-slate-50 hover:bg-sky-50/70 border border-slate-200/70 rounded-xl text-left transition-all hover:border-sky-200 active:scale-97 group cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <IconComp className="w-3 h-3 text-sky-600 shrink-0" />
                      <span className="text-[9.5px] font-extrabold text-slate-700 truncate group-hover:text-sky-700">{s.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Pending File Attachments Preview Bar */}
        {pendingAttachments.length > 0 && (
          <div className="p-2.5 bg-sky-50/80 border-t border-sky-100 flex flex-wrap gap-2 shrink-0">
            {pendingAttachments.map((att, idx) => (
              <div 
                key={idx}
                className="flex items-center gap-1.5 bg-white border border-sky-200 px-2.5 py-1 rounded-lg text-xs shadow-2xs"
              >
                <Paperclip className="w-3 h-3 text-sky-600" />
                <span className="text-[10.5px] font-bold text-slate-800 max-w-[140px] truncate">{att.name}</span>
                <span className="text-[9px] text-slate-400 font-mono">({(att.size! / 1024).toFixed(0)}KB)</span>
                <button
                  type="button"
                  onClick={() => handleRemovePendingAttachment(idx)}
                  className="text-slate-400 hover:text-red-500 p-0.5 rounded cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Message Input Panel */}
        <div className="p-3 bg-white border-t border-slate-200 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(input);
            }}
            className="flex items-center gap-2"
          >
            {/* Attachment Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-xl border border-slate-200 transition-colors shrink-0 cursor-pointer"
              title="Attach a file"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              placeholder={pendingAttachments.length > 0 ? "Add a message about these files" : "Ask about VAT, statements, receipts or growth"}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 disabled:opacity-50"
            />

            <button
              type="submit"
              disabled={(!input.trim() && pendingAttachments.length === 0) || isLoading}
              className="bg-sky-600 hover:bg-sky-500 text-white p-2.5 rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:scale-100 shadow-xs shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4 stroke-[2.25]" />
            </button>
          </form>
          <div className="flex items-center justify-between mt-1.5 px-1 text-[8px] text-slate-400">
            <span>Attach bank statements (PDF/CSV), receipts or invoices</span>
            <span className="font-mono">Frilensa AI</span>
          </div>
        </div>

      </div>

      {/* MODAL: Email Transcript */}
      <AnimatePresence>
        {showEmailModal && currentSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden"
            >
              <div className="p-4 border-b border-slate-100 bg-sky-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-sky-200" />
                  <div>
                    <h3 className="text-xs font-black tracking-tight">Email transcript</h3>
                    <p className="text-[9.5px] text-sky-100">Send this consultation and its action items by email</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowEmailModal(false)}
                  className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3.5">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                    Send to
                  </label>
                  <input
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-sky-500"
                  />
                  <span className="text-[8.5px] text-slate-400 mt-1 block">
                    Defaults to your Frilensa account email.
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                    Note (optional)
                  </label>
                  <textarea
                    value={emailNote}
                    onChange={(e) => setEmailNote(e.target.value)}
                    rows={2}
                    placeholder="e.g. Notes from the Suva client meeting, tax deadlines"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-sky-500 resize-none"
                  />
                </div>

                {/* Session Breakdown Preview */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] space-y-1 text-slate-600">
                  <div className="flex justify-between">
                    <span className="font-medium">Session:</span>
                    <strong className="text-slate-800">{currentSession.title}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Messages:</span>
                    <strong className="text-slate-800">{currentSession.messages.length} messages</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Business:</span>
                    <strong className="text-slate-800">{activeBusiness?.name}</strong>
                  </div>
                </div>

                {/* Native mailto backup helper */}
                <div className="text-center">
                  <a
                    href={`mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(`Frilensa AI transcript: ${currentSession.title}`)}&body=${encodeURIComponent(currentSession.messages.map(m => `${m.sender.toUpperCase()}: ${m.text}\n`).join('\n'))}`}
                    className="text-[9px] text-sky-600 hover:underline font-bold inline-flex items-center gap-1"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                    Or open in your email app
                  </a>
                </div>
              </div>

              <div className="p-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEmailModal(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendEmailTranscript}
                  disabled={isSendingEmail || !recipientEmail}
                  className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isSendingEmail ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending…</span>
                    </>
                  ) : (
                    <>
                      <Mail className="w-3.5 h-3.5" />
                      <span>Send transcript</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: AI Memory Bank Inspector */}
      <AnimatePresence>
        {showMemoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl max-w-lg w-full border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-4 border-b border-slate-100 bg-amber-500 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-amber-100" />
                  <div>
                    <h3 className="text-xs font-black tracking-tight">AI memory</h3>
                    <p className="text-[9.5px] text-amber-100">What the assistant remembers about {activeBusiness?.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowMemoryModal(false)}
                  className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Add manual memory input */}
              <div className="p-3 border-b border-slate-100 bg-amber-50/50 flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  value={newMemoryInput}
                  onChange={(e) => setNewMemoryInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddManualMemory(); }}
                  placeholder="Add a fact or preference for the assistant"
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500"
                />
                <button
                  onClick={handleAddManualMemory}
                  disabled={!newMemoryInput.trim()}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-extrabold disabled:opacity-40 shrink-0 cursor-pointer"
                >
                  Remember
                </button>
              </div>

              {/* Memories List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {memories.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    <Brain className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    Nothing saved yet. The assistant saves facts from your chats, or you can add one above.
                  </div>
                ) : (
                  memories.map((m) => (
                    <div
                      key={m.id}
                      className="p-2.5 rounded-xl border border-slate-200/80 bg-slate-50 flex items-start justify-between gap-2 group hover:border-amber-300 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded tracking-wider ${
                            m.category === 'tax' ? 'bg-rose-100 text-rose-700' :
                            m.category === 'financial' ? 'bg-emerald-100 text-emerald-700' :
                            m.category === 'client' ? 'bg-sky-100 text-sky-700' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {m.category}
                          </span>
                          <span className="text-[8.5px] text-slate-400 font-mono">
                            {new Date(m.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-800 font-medium leading-relaxed">
                          {m.fact}
                        </p>
                      </div>

                      <button
                        onClick={() => handleDeleteMemory(m.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded transition-opacity cursor-pointer"
                        title="Delete memory"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[9px] text-slate-500 shrink-0">
                <span>The assistant uses these facts in every answer</span>
                <button
                  onClick={() => setShowMemoryModal(false)}
                  className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Image Zoom Preview */}
      <AnimatePresence>
        {previewImage && (
          <div 
            onClick={() => setPreviewImage(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs cursor-zoom-out"
          >
            <div className="max-w-3xl max-h-[90vh] flex flex-col items-center">
              <img 
                src={previewImage.url} 
                alt={previewImage.title}
                className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl border border-white/20"
              />
              <span className="text-white text-xs font-bold mt-2 bg-black/50 px-3 py-1 rounded-full">
                {previewImage.title} (click anywhere to close)
              </span>
            </div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}


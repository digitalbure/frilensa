import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Wallet, ShieldCheck, ArrowDownLeft, ArrowUpRight, Plus, 
  CheckCircle2, Clock, AlertTriangle, RefreshCw, Send, DollarSign,
  Smartphone, Building2, ChevronRight, X, Copy, ExternalLink,
  Lock, Unlock, FileText, Check, Sparkles, HelpCircle, ShieldAlert,
  Percent, ArrowRight, Layers, MessageSquare, AlertCircle
} from 'lucide-react';
import { CRMData, EscrowContract, WalletTransaction, Client } from '../types';
import { DEFAULT_PLATFORM_SETTINGS } from '../data/mockData';

interface WalletEscrowViewProps {
  data: CRMData;
  onUpdateData: (newData: CRMData) => void;
  onOpenAdminPanel?: () => void;
  onNavigateToTab?: (tab: string, entityId?: string) => void;
}

export default function WalletEscrowView({
  data,
  onUpdateData,
  onOpenAdminPanel,
  onNavigateToTab
}: WalletEscrowViewProps) {
  const platformSettings = data.platformSettings || DEFAULT_PLATFORM_SETTINGS;
  const isEscrowEnabled = platformSettings.escrowEnabled ?? true;
  const commissionPercent = platformSettings.escrowCommissionPercent ?? 3.5;
  const flatFee = platformSettings.escrowFlatFee ?? 5.0;
  const feeType = platformSettings.escrowFeeType ?? 'both';
  const minEscrowAmount = platformSettings.escrowMinAmount ?? 20.0;
  const payoutFee = platformSettings.escrowPayoutFee ?? 1.0;
  const currency = data.userProfile?.defaultCurrency || 'FJD';

  // Initialize wallet if empty
  const wallet = data.wallet || {
    id: 'wal-1',
    ownerType: 'freelancer' as const,
    ownerId: data.userProfile?.email || '',
    availableBalance: 0,
    escrowHoldBalance: 0,
    lifetimeEarned: 0,
    lifetimeWithdrawn: 0,
    lifetimeFeesPaid: 0,
    transactions: []
  };

  const contracts = data.escrowContracts || [];

  // Tab & Filter States
  const [activeTab, setActiveTab] = useState<'contracts' | 'ledger'>('contracts');
  const [contractFilter, setContractFilter] = useState<'all' | 'held_in_escrow' | 'milestone_submitted' | 'released' | 'disputed'>('all');

  // Modals
  const [showNewContractModal, setShowNewContractModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [selectedContract, setSelectedContract] = useState<EscrowContract | null>(null);
  const [showSubmitProofModal, setShowSubmitProofModal] = useState<EscrowContract | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New Contract Form
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newClientId, setNewClientId] = useState(data.clients[0]?.id || '');
  const [newAmount, setNewAmount] = useState<number>(500);
  const [newDocId, setNewDocId] = useState('');

  // Submit Milestone Proof Form
  const [proofDeliverables, setProofDeliverables] = useState('');
  const [proofNotes, setProofNotes] = useState('');

  // Withdrawal Form
  const [withdrawAmount, setWithdrawAmount] = useState<number>(wallet.availableBalance > 0 ? wallet.availableBalance : 100);
  const [withdrawChannel, setWithdrawChannel] = useState<'mpaisa' | 'mycash' | 'bsp' | 'westpac' | 'anz'>('mpaisa');
  const [withdrawPhoneOrAccount, setWithdrawPhoneOrAccount] = useState(data.businesses[0]?.mPaisaId || data.userProfile?.phone || '');
  const [withdrawAccountName, setWithdrawAccountName] = useState(data.businesses[0]?.name || data.userProfile?.name || '');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState<WalletTransaction | null>(null);

  // Filtered Contracts
  const filteredContracts = contracts.filter(c => {
    if (contractFilter === 'all') return true;
    return c.status === contractFilter;
  });

  // Calculate totals
  const totalInEscrow = contracts
    .filter(c => c.status === 'held_in_escrow' || c.status === 'milestone_submitted')
    .reduce((sum, c) => sum + c.netFreelancerAmount, 0);

  const totalReleased = contracts
    .filter(c => c.status === 'released')
    .reduce((sum, c) => sum + c.netFreelancerAmount, 0);

  // Helper fee calculation
  const calculateFees = (amount: number) => {
    let comm = 0;
    let flat = 0;
    if (feeType === 'percentage' || feeType === 'both') {
      comm = (amount * commissionPercent) / 100;
    }
    if (feeType === 'flat' || feeType === 'both') {
      flat = flatFee;
    }
    const totalFee = comm + flat;
    const net = Math.max(0, amount - totalFee);
    return { comm, flat, totalFee, net };
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleCopyLink = (contract: EscrowContract) => {
    const client = data.clients.find(c => c.id === contract.clientId);
    const tokenParam = client?.accessToken ? `&token=${encodeURIComponent(client.accessToken)}` : '';
    const url = `${window.location.origin}${window.location.pathname}?escrow=${contract.id}${tokenParam}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url);
    }
    setCopiedId(contract.id);
    showToast(`Escrow Deposit link copied for ${contract.clientName}!`);
    setTimeout(() => setCopiedId(null), 3000);
  };

  const handleCreateContract = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newClientId || newAmount < minEscrowAmount) {
      alert(`Please fill all fields. Minimum escrow contract amount is ${currency} ${minEscrowAmount}.`);
      return;
    }

    const client = data.clients.find(c => c.id === newClientId);
    if (!client) return;

    const { comm, flat, totalFee, net } = calculateFees(newAmount);
    const contractNum = `ESC-${Math.floor(1000 + Math.random() * 9000)}`;

    const newContract: EscrowContract = {
      id: `esc-${Date.now()}`,
      contractNumber: contractNum,
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      clientId: client.id,
      clientName: client.name,
      clientEmail: client.email,
      businessId: data.activeBusinessId || data.businesses[0]?.id || 'biz-1',
      consultantId: data.userProfile?.email || '',
      documentId: newDocId || undefined,
      totalAmount: newAmount,
      commissionRate: commissionPercent,
      commissionAmount: comm,
      flatFeeAmount: flat,
      totalPlatformFee: totalFee,
      netFreelancerAmount: net,
      status: 'pending_deposit',
      createdAt: new Date().toISOString()
    };

    const updatedContracts = [newContract, ...contracts];

    onUpdateData({
      ...data,
      escrowContracts: updatedContracts
    });

    setShowNewContractModal(false);
    setNewTitle('');
    setNewDesc('');
    setNewAmount(500);
    setNewDocId('');
    showToast(`Escrow Contract ${contractNum} created! Share payment link with ${client.name}.`);
  };

  const handleSubmitMilestoneProof = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showSubmitProofModal || !proofDeliverables.trim()) return;

    const contractId = showSubmitProofModal.id;
    const now = new Date().toISOString();

    const updatedContracts = contracts.map(c => {
      if (c.id === contractId) {
        return {
          ...c,
          status: 'milestone_submitted' as const,
          milestoneProof: `${proofDeliverables.trim()}${proofNotes ? `\n\nNotes: ${proofNotes.trim()}` : ''}`,
          milestoneSubmittedAt: now
        };
      }
      return c;
    });

    onUpdateData({
      ...data,
      escrowContracts: updatedContracts
    });

    setShowSubmitProofModal(null);
    setProofDeliverables('');
    setProofNotes('');
    showToast(`Milestone submitted for ${showSubmitProofModal.clientName}! Client has been notified to review and release funds.`);
  };

  const handleSimulateClientDeposit = (contract: EscrowContract) => {
    const now = new Date().toISOString();
    const refCode = `MPAISA-FJ-${Math.floor(100000 + Math.random() * 900000)}`;

    const updatedContract: EscrowContract = {
      ...contract,
      status: 'held_in_escrow',
      paymentMethod: 'mpaisa',
      depositReference: refCode,
      fundedAt: now
    };

    const updatedContracts = contracts.map(c => c.id === contract.id ? updatedContract : c);

    // Update wallet ledger
    const newTx: WalletTransaction = {
      id: `wtx-${Date.now()}`,
      type: 'escrow_hold',
      amount: contract.totalAmount,
      fee: contract.totalPlatformFee,
      netAmount: contract.netFreelancerAmount,
      currency,
      status: 'pending',
      date: now.split('T')[0],
      title: `Escrow Protected: ${contract.clientName}`,
      description: `Client funded ${currency} ${contract.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} for ${contract.contractNumber} (${contract.title}). Safely locked in escrow.`,
      referenceId: contract.contractNumber
    };

    const updatedWallet = {
      ...wallet,
      escrowHoldBalance: wallet.escrowHoldBalance + contract.netFreelancerAmount,
      transactions: [newTx, ...(wallet.transactions || [])]
    };

    onUpdateData({
      ...data,
      escrowContracts: updatedContracts,
      wallet: updatedWallet
    });

    showToast(`Client Deposit Confirmed! ${currency} ${contract.totalAmount} is now safely locked in Escrow.`);
  };

  const handleSimulateClientRelease = (contract: EscrowContract) => {
    const now = new Date().toISOString();

    const updatedContract: EscrowContract = {
      ...contract,
      status: 'released',
      releasedAt: now,
      rating: 5,
      clientFeedback: "Milestone verified and accepted. Funds released to consultant."
    };

    const updatedContracts = contracts.map(c => c.id === contract.id ? updatedContract : c);

    // Update wallet ledger & balance
    const newTx: WalletTransaction = {
      id: `wtx-${Date.now()}`,
      type: 'escrow_release',
      amount: contract.totalAmount,
      fee: contract.totalPlatformFee,
      netAmount: contract.netFreelancerAmount,
      currency,
      status: 'completed',
      date: now.split('T')[0],
      title: `Escrow Release: ${contract.clientName}`,
      description: `Milestone ${contract.contractNumber} approved by client! Net payout ${currency} ${contract.netFreelancerAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} settled to available balance.`,
      referenceId: contract.contractNumber
    };

    const updatedWallet = {
      ...wallet,
      availableBalance: wallet.availableBalance + contract.netFreelancerAmount,
      escrowHoldBalance: Math.max(0, wallet.escrowHoldBalance - contract.netFreelancerAmount),
      lifetimeEarned: wallet.lifetimeEarned + contract.netFreelancerAmount,
      lifetimeFeesPaid: wallet.lifetimeFeesPaid + contract.totalPlatformFee,
      transactions: [newTx, ...(wallet.transactions || [])]
    };

    onUpdateData({
      ...data,
      escrowContracts: updatedContracts,
      wallet: updatedWallet
    });

    showToast(`Escrow Released! ${currency} ${contract.netFreelancerAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} added to your Available Balance.`);
  };

  const handleWithdrawal = (e: React.FormEvent) => {
    e.preventDefault();
    if (withdrawAmount <= 0 || withdrawAmount > wallet.availableBalance) {
      alert(`Please enter an amount up to your available balance of ${currency} ${wallet.availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      return;
    }
    if (!withdrawPhoneOrAccount.trim()) {
      alert('Please enter your payout destination account or mobile number.');
      return;
    }

    setWithdrawing(true);

    setTimeout(() => {
      const now = new Date().toISOString();
      const netPayout = Math.max(0, withdrawAmount - payoutFee);
      const refCode = `PO-${Math.floor(100000 + Math.random() * 900000)}`;

      const newTx: WalletTransaction = {
        id: `wtx-${Date.now()}`,
        type: 'withdrawal_payout',
        amount: withdrawAmount,
        fee: payoutFee,
        netAmount: netPayout,
        currency,
        status: 'completed',
        date: now.split('T')[0],
        title: `Payout Withdrawal (${withdrawChannel.toUpperCase()})`,
        description: `Disbursed ${currency} ${netPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} to ${withdrawAccountName} (${withdrawPhoneOrAccount}). Ref: ${refCode}`,
        referenceId: refCode,
        payoutChannel: withdrawChannel,
        payoutRecipient: withdrawPhoneOrAccount
      };

      const updatedWallet = {
        ...wallet,
        availableBalance: wallet.availableBalance - withdrawAmount,
        lifetimeWithdrawn: wallet.lifetimeWithdrawn + netPayout,
        transactions: [newTx, ...(wallet.transactions || [])]
      };

      onUpdateData({
        ...data,
        wallet: updatedWallet
      });

      setWithdrawing(false);
      setWithdrawSuccess(newTx);
    }, 900);
  };

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto min-w-0 w-full overflow-x-hidden">
      
      {/* Top Banner / Escrow Guarantee */}
      <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 text-white p-4 rounded-3xl shadow-lg border border-sky-900/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
          <ShieldCheck className="w-32 h-32" />
        </div>

        <div className="relative z-10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-extrabold uppercase tracking-widest text-sky-400 bg-sky-950/80 px-2.5 py-0.5 rounded-full border border-sky-800/60 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-sky-400" /> Guaranteed Escrow Custody
            </span>
            {onOpenAdminPanel && (
              <button
                type="button"
                onClick={onOpenAdminPanel}
                className="text-[9px] text-slate-400 hover:text-white flex items-center gap-1 font-semibold transition-colors"
                title="Adjust platform escrow fee rates in Admin Panel"
              >
                <span>Admin Fee Settings</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>

          <div>
            <h2 className="text-lg font-display font-extrabold tracking-tight text-white flex items-center gap-2">
              <Wallet className="w-5 h-5 text-sky-400" />
              <span>Multi-Channel Escrow Wallet</span>
            </h2>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
              Safeguard project milestones between you and clients. Funds are locked securely in escrow until deliverables are approved.
            </p>
          </div>

          {/* Platform fee badge */}
          <div className="pt-1 flex items-center gap-2 text-[10px] text-slate-300 font-medium">
            <span className="bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700 font-mono">
              Commission: {feeType === 'flat' ? `${currency} ${flatFee}` : feeType === 'percentage' ? `${commissionPercent}%` : `${commissionPercent}% + ${currency} ${flatFee}`}
            </span>
            <span className="text-slate-400">•</span>
            <span className="text-emerald-400 font-semibold">100% Protection</span>
          </div>
        </div>
      </div>

      {/* Main Balances Card */}
      <div className="bg-white rounded-3xl p-4 border border-zinc-200/80 shadow-xs space-y-3">
        <div className="grid grid-cols-2 gap-3">
          
          {/* Available Settled Balance */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50/40 border border-emerald-200/70 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Available
              </span>
              <span className="text-[9px] bg-emerald-100/80 px-1.5 py-0.2 rounded text-emerald-700">Ready</span>
            </div>
            <div className="text-lg font-display font-black text-emerald-950 font-mono">
              {currency} {wallet.availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[9px] text-emerald-700/80">Available for instant M-Paisa / Bank payout</p>
          </div>

          {/* Funds in Escrow Hold */}
          <div className="bg-gradient-to-br from-sky-50 to-indigo-50/40 border border-sky-200/70 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-sky-800 text-[10px] font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-sky-600" /> In Escrow
              </span>
              <span className="text-[9px] bg-sky-100/80 px-1.5 py-0.2 rounded text-sky-700">Protected</span>
            </div>
            <div className="text-lg font-display font-black text-sky-950 font-mono">
              {currency} {totalInEscrow.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[9px] text-sky-700/80">Locked in milestones awaiting sign-off</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => setShowNewContractModal(true)}
            className="bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-bold py-2.5 px-3 rounded-2xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs"
          >
            <Plus className="w-4 h-4 text-sky-400" />
            <span>New Escrow Milestone</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setWithdrawAmount(wallet.availableBalance > 0 ? wallet.availableBalance : 100);
              setWithdrawSuccess(null);
              setShowWithdrawModal(true);
            }}
            disabled={wallet.availableBalance <= 0}
            className={`font-bold py-2.5 px-3 rounded-2xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs ${
              wallet.availableBalance > 0
                ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white'
                : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>Request Payout</span>
          </button>
        </div>
      </div>

      {/* Tabs: Escrow Contracts vs Wallet Ledger */}
      <div className="flex bg-zinc-100 p-1 rounded-2xl border border-zinc-200">
        <button
          type="button"
          onClick={() => setActiveTab('contracts')}
          className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'contracts'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
          <span>Active Escrows ({contracts.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ledger')}
          className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'ledger'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-emerald-600" />
          <span>Wallet Ledger</span>
        </button>
      </div>

      {/* CONTRACTS VIEW */}
      {activeTab === 'contracts' && (
        <div className="space-y-3">
          {/* Status Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'all', label: 'All' },
              { id: 'held_in_escrow', label: 'Funded & In Escrow' },
              { id: 'milestone_submitted', label: 'Work Submitted' },
              { id: 'released', label: 'Released' }
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setContractFilter(f.id as any)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold shrink-0 transition-all ${
                  contractFilter === f.id
                    ? 'bg-sky-600 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredContracts.length === 0 ? (
            <div className="bg-white rounded-3xl p-6 text-center border border-zinc-200 space-y-2">
              <ShieldCheck className="w-8 h-8 text-zinc-300 mx-auto" />
              <h4 className="text-xs font-bold text-zinc-800">No Escrow Contracts Found</h4>
              <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
                Create a protected escrow milestone for your clients to deposit funds safely before starting project work.
              </p>
              <button
                type="button"
                onClick={() => setShowNewContractModal(true)}
                className="mt-2 bg-sky-600 text-white text-xs font-bold py-1.5 px-3 rounded-xl inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Create Escrow Request
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredContracts.map(contract => {
                const isFunded = contract.status === 'held_in_escrow' || contract.status === 'milestone_submitted';
                const isSubmitted = contract.status === 'milestone_submitted';
                const isReleased = contract.status === 'released';
                const isPending = contract.status === 'pending_deposit';

                return (
                  <div
                    key={contract.id}
                    className="bg-white rounded-2xl p-3.5 border border-zinc-200 hover:border-sky-300 transition-all shadow-2xs space-y-2.5"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-mono font-bold text-zinc-500 bg-zinc-100 px-1.5 py-0.2 rounded">
                            {contract.contractNumber}
                          </span>
                          <span className="text-xs font-bold text-zinc-900 truncate">
                            {contract.title}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500 font-medium block truncate mt-0.5">
                          Client: <strong className="text-zinc-800">{contract.clientName}</strong>
                        </span>
                      </div>

                      {/* Status badge */}
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider shrink-0 flex items-center gap-1 ${
                        isReleased
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : isSubmitted
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : isFunded
                              ? 'bg-sky-50 text-sky-700 border border-sky-200'
                              : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                      }`}>
                        {isReleased ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Released
                          </>
                        ) : isSubmitted ? (
                          <>
                            <Clock className="w-3 h-3 text-amber-600 animate-spin" /> In Review
                          </>
                        ) : isFunded ? (
                          <>
                            <Lock className="w-3 h-3 text-sky-600" /> In Escrow
                          </>
                        ) : (
                          <>
                            <Clock className="w-3 h-3 text-zinc-500" /> Awaiting Deposit
                          </>
                        )}
                      </span>
                    </div>

                    {/* Financial Breakdown */}
                    <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100 grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <span className="text-[8.5px] text-zinc-400 block uppercase font-semibold">Gross Client Deposit</span>
                        <span className="font-mono font-bold text-zinc-800 text-[11px]">
                          {currency} {contract.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div>
                        <span className="text-[8.5px] text-zinc-400 block uppercase font-semibold">Platform Fee</span>
                        <span className="font-mono font-medium text-slate-500 text-[10px]">
                          - {currency} {contract.totalPlatformFee.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[8.5px] text-emerald-700 block uppercase font-bold">Your Net Payout</span>
                        <span className="font-mono font-black text-emerald-700 text-[11px]">
                          {currency} {contract.netFreelancerAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {/* Milestone Deliverables info */}
                    {contract.milestoneProof && (
                      <div className="bg-amber-50/60 border border-amber-100 rounded-lg p-2 text-[10px] text-amber-900 space-y-1">
                        <span className="font-bold flex items-center gap-1">
                          <Check className="w-3 h-3 text-amber-600" /> Submitted Deliverables:
                        </span>
                        <p className="text-zinc-700 whitespace-pre-line truncate">{contract.milestoneProof}</p>
                      </div>
                    )}

                    {/* Interactive Action Bar */}
                    <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-zinc-100">
                      
                      {/* Copy Client Deposit Link */}
                      <button
                        type="button"
                        onClick={() => handleCopyLink(contract)}
                        className="text-[10px] text-sky-700 hover:text-sky-800 font-semibold flex items-center gap-1 bg-sky-50 hover:bg-sky-100 px-2 py-1 rounded-md transition-all"
                      >
                        {copiedId === contract.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" /> Copied Deposit Link!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" /> Copy Client Link
                          </>
                        )}
                      </button>

                      {/* Workflow Actions */}
                      <div className="flex items-center gap-1.5">
                        {isPending && (
                          <button
                            type="button"
                            onClick={() => handleSimulateClientDeposit(contract)}
                            className="bg-sky-600 hover:bg-sky-700 active:scale-95 text-white font-semibold text-[10px] px-2.5 py-1 rounded-lg transition-all flex items-center gap-1"
                            title="Simulate client depositing funds into escrow"
                          >
                            <Lock className="w-3 h-3" /> Simulate Deposit
                          </button>
                        )}

                        {contract.status === 'held_in_escrow' && (
                          <button
                            type="button"
                            onClick={() => setShowSubmitProofModal(contract)}
                            className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-semibold text-[10px] px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 shadow-2xs"
                          >
                            <Send className="w-3 h-3" /> Submit Deliverables
                          </button>
                        )}

                        {isSubmitted && (
                          <button
                            type="button"
                            onClick={() => handleSimulateClientRelease(contract)}
                            className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold text-[10px] px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 shadow-2xs"
                            title="Simulate client releasing funds to you"
                          >
                            <Unlock className="w-3 h-3" /> Approve & Release
                          </button>
                        )}

                        {isReleased && (
                          <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Settled to Wallet
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* WALLET LEDGER VIEW */}
      {activeTab === 'ledger' && (
        <div className="space-y-2.5">
          <div className="bg-white rounded-2xl p-3 border border-zinc-200 space-y-1 text-xs">
            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Lifetime Financial Ledger</span>
            <div className="grid grid-cols-2 gap-2 text-center pt-1">
              <div className="bg-zinc-50 p-2 rounded-xl border border-zinc-100">
                <span className="text-[9px] text-zinc-400 block">Total Settled Earnings</span>
                <span className="font-mono font-bold text-zinc-900 text-xs">
                  {currency} {wallet.lifetimeEarned.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="bg-zinc-50 p-2 rounded-xl border border-zinc-100">
                <span className="text-[9px] text-zinc-400 block">Total Withdrawn Payouts</span>
                <span className="font-mono font-bold text-zinc-900 text-xs">
                  {currency} {wallet.lifetimeWithdrawn.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {(!wallet.transactions || wallet.transactions.length === 0) ? (
            <div className="bg-white rounded-3xl p-6 text-center border border-zinc-200 text-xs text-zinc-500">
              No transactions recorded in wallet ledger yet.
            </div>
          ) : (
            <div className="space-y-2">
              {wallet.transactions.map(tx => {
                const isPayout = tx.type === 'withdrawal_payout';
                const isRelease = tx.type === 'escrow_release';
                const isHold = tx.type === 'escrow_hold';

                return (
                  <div
                    key={tx.id}
                    className="bg-white p-3 rounded-2xl border border-zinc-200 flex items-start justify-between gap-3 text-xs shadow-2xs"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                        isPayout
                          ? 'bg-rose-50 text-rose-600'
                          : isRelease
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-sky-50 text-sky-600'
                      }`}>
                        {isPayout ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : isRelease ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : (
                          <Lock className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-zinc-900 block truncate">{tx.title}</span>
                        <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-2 leading-relaxed">{tx.description}</p>
                        <div className="flex items-center gap-2 mt-1 text-[9px] text-zinc-400 font-mono">
                          <span>{tx.date}</span>
                          {tx.referenceId && <span>Ref: {tx.referenceId}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`font-mono font-bold block ${
                        isPayout ? 'text-rose-600' : 'text-emerald-700'
                      }`}>
                        {isPayout ? '-' : '+'}{currency} {tx.netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                      {tx.fee && tx.fee > 0 ? (
                        <span className="text-[9px] text-zinc-400 font-mono block mt-0.5">
                          Fee: {currency} {tx.fee.toFixed(2)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CREATE ESCROW MODAL */}
      <AnimatePresence>
        {showNewContractModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-x-hidden">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] shadow-2xl flex flex-col overflow-hidden border border-zinc-200"
            >
              <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-sky-600" />
                  <h3 className="text-sm font-bold text-zinc-900">New Escrow Milestone Contract</h3>
                </div>
                <button
                  onClick={() => setShowNewContractModal(false)}
                  className="p-1 text-zinc-400 hover:text-zinc-900 rounded-full bg-zinc-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateContract} className="p-4 overflow-y-auto space-y-3.5 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Contract Title / Milestone Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Website Wireframes & Design System"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-xs text-zinc-900 mt-1 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Select Client</label>
                  <select
                    value={newClientId}
                    onChange={(e) => setNewClientId(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-xs text-zinc-900 mt-1 focus:outline-none focus:border-sky-500"
                  >
                    {data.clients.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.email ? `(${c.email})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Milestone Amount ({currency})</label>
                  <div className="relative mt-1">
                    <DollarSign className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      required
                      min={minEscrowAmount}
                      value={newAmount}
                      onChange={(e) => setNewAmount(Number(e.target.value))}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 pl-9 pr-3 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <span className="text-[9px] text-zinc-400 block mt-1">Min amount: {currency} {minEscrowAmount}</span>
                </div>

                {/* Real-time fee preview */}
                {newAmount > 0 && (
                  <div className="bg-sky-50/70 border border-sky-200/80 rounded-xl p-3 space-y-1.5 text-xs text-sky-950">
                    <span className="text-[9.5px] font-bold uppercase tracking-wider text-sky-900 block">Fee & Settlement Preview</span>
                    <div className="flex justify-between text-[11px]">
                      <span>Client Deposit (Gross):</span>
                      <span className="font-mono font-bold">{currency} {newAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-[10.5px] text-slate-600">
                      <span>Platform Commission ({commissionPercent}%):</span>
                      <span className="font-mono">- {currency} {calculateFees(newAmount).comm.toFixed(2)}</span>
                    </div>
                    {flatFee > 0 && (
                      <div className="flex justify-between text-[10.5px] text-slate-600">
                        <span>Platform Flat Fee:</span>
                        <span className="font-mono">- {currency} {calculateFees(newAmount).flat.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="pt-1 border-t border-sky-200 flex justify-between font-bold text-emerald-700">
                      <span>Your Net Payout (On Release):</span>
                      <span className="font-mono text-xs">{currency} {calculateFees(newAmount).net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Milestone Scope & Deliverables (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="Describe what deliverables will trigger milestone sign-off..."
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-xs text-zinc-900 mt-1 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewContractModal(false)}
                    className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold py-2.5 rounded-xl text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-xs"
                  >
                    Create Contract
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SUBMIT DELIVERABLES PROOF MODAL */}
      <AnimatePresence>
        {showSubmitProofModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-x-hidden">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden border border-zinc-200"
            >
              <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-amber-600" />
                  <h3 className="text-sm font-bold text-zinc-900">Submit Milestone Proof</h3>
                </div>
                <button
                  onClick={() => setShowSubmitProofModal(null)}
                  className="p-1 text-zinc-400 hover:text-zinc-900 rounded-full bg-zinc-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmitMilestoneProof} className="p-4 space-y-3 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase">Contract</span>
                  <p className="font-bold text-zinc-900">{showSubmitProofModal.title} ({showSubmitProofModal.contractNumber})</p>
                  <p className="text-[10px] text-zinc-500">Client: {showSubmitProofModal.clientName}</p>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                    Deliverable Links / Google Drive / Figma / GitHub
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. https://drive.google.com/folder/deliverables-v1"
                    value={proofDeliverables}
                    onChange={(e) => setProofDeliverables(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-xs text-zinc-900 mt-1 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                    Notes for Client Verification
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Summary of completed items for the client to review..."
                    value={proofNotes}
                    onChange={(e) => setProofNotes(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-xs text-zinc-900 mt-1 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSubmitProofModal(null)}
                    className="flex-1 bg-zinc-100 text-zinc-700 font-semibold py-2 rounded-xl text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 rounded-xl text-xs"
                  >
                    Submit for Client Release
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* WITHDRAWAL PAYOUT MODAL */}
      <AnimatePresence>
        {showWithdrawModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-x-hidden">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] shadow-2xl flex flex-col overflow-hidden border border-zinc-200"
            >
              <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                <div className="flex items-center gap-2">
                  <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-zinc-900">Request Wallet Payout</h3>
                </div>
                <button
                  onClick={() => setShowWithdrawModal(false)}
                  className="p-1 text-zinc-400 hover:text-zinc-900 rounded-full bg-zinc-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {withdrawSuccess ? (
                <div className="p-6 text-center space-y-3">
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                    <Check className="w-6 h-6" />
                  </div>
                  <h4 className="text-base font-bold text-zinc-900">Payout Initiated Successfully!</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed max-w-xs mx-auto">
                    {currency} {withdrawSuccess.netAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been queued for instant settlement to your {withdrawSuccess.payoutChannel?.toUpperCase()} ({withdrawSuccess.payoutRecipient}).
                  </p>
                  <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-200 font-mono text-[10px] text-zinc-600">
                    Disbursement Ref: {withdrawSuccess.referenceId}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowWithdrawModal(false)}
                    className="w-full bg-slate-900 text-white font-bold py-2.5 rounded-xl text-xs"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleWithdrawal} className="p-4 overflow-y-auto space-y-3 text-xs">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex justify-between items-center">
                    <div>
                      <span className="text-[9px] font-bold text-emerald-800 uppercase">Available for Payout</span>
                      <span className="text-base font-mono font-black text-emerald-950 block">
                        {currency} {wallet.availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWithdrawAmount(wallet.availableBalance)}
                      className="bg-emerald-600 text-white font-bold text-[10px] px-2.5 py-1 rounded-lg"
                    >
                      Max
                    </button>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                      Payout Amount ({currency})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      required
                      min={5}
                      max={wallet.availableBalance}
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-xs font-mono font-bold text-zinc-900 mt-1 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                      Select Settlement Method
                    </label>
                    <div className="grid grid-cols-3 gap-1.5 mt-1">
                      {[
                        { id: 'mpaisa', label: 'M-Paisa' },
                        { id: 'mycash', label: 'MyCash' },
                        { id: 'bsp', label: 'BSP Fiji' },
                        { id: 'westpac', label: 'Westpac' },
                        { id: 'anz', label: 'ANZ Fiji' }
                      ].map(m => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setWithdrawChannel(m.id as any)}
                          className={`py-1.5 px-2 rounded-xl text-[10.5px] font-bold border transition-all ${
                            withdrawChannel === m.id
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-zinc-50 text-zinc-600 border-zinc-200'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                      Account / Mobile Number
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 9912345 or Bank Account Number"
                      value={withdrawPhoneOrAccount}
                      onChange={(e) => setWithdrawPhoneOrAccount(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-xs text-zinc-900 mt-1 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Viti Creative Studio"
                      value={withdrawAccountName}
                      onChange={(e) => setWithdrawAccountName(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-xs text-zinc-900 mt-1 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="bg-zinc-50 p-2 rounded-xl border border-zinc-200 text-[10px] text-zinc-500 space-y-0.5">
                    <div className="flex justify-between">
                      <span>Payout Fee:</span>
                      <span>{currency} {payoutFee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-zinc-900">
                      <span>You Receive:</span>
                      <span>{currency} {Math.max(0, withdrawAmount - payoutFee).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  <div className="pt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowWithdrawModal(false)}
                      className="flex-1 bg-zinc-100 text-zinc-700 font-semibold py-2.5 rounded-xl text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={withdrawing}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1 shadow-xs"
                    >
                      {withdrawing ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <span>Confirm Disbursement</span>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-20 left-4 right-4 max-w-sm mx-auto z-50 bg-slate-900 text-white p-3 rounded-2xl shadow-xl border border-slate-700 flex items-center gap-2.5 text-xs"
          >
            <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="flex-1 text-[11px] font-medium">{toastMessage}</span>
            <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white p-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

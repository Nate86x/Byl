import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  History, 
  LayoutDashboard, 
  Settings, 
  TrendingUp, 
  Users, 
  Trash2, 
  CheckCircle2, 
  XCircle,
  Edit3,
  ChevronRight,
  TrendingDown,
  CreditCard,
  Building2,
  UserPlus,
  UserCheck,
  ChevronDown,
  UserCircle,
  Check,
  Printer,
  Calendar,
  Download,
  ArrowUpDown,
  RotateCcw,
  Info,
  HelpCircle,
  AlertCircle,
  Eye,
  X
} from 'lucide-react';
import { format, startOfMonth, parseISO, isSameMonth, subMonths, startOfYear, isSameYear, getYear, set, addMonths, isBefore, startOfDay } from 'date-fns';
import { cn, formatCurrency } from './lib/utils';
import { Person, BillEntry, AppState, BillAccount, PersonRole } from './types';

const STORAGE_KEY = 'bill_splitter_pro_v2_data';

export default function App() {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.accounts) {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse saved data", e);
      }
    }
    return {
      accounts: [],
      activeAccountId: null
    };
  });

  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'settings'>('dashboard');
  const [showPaymentHelp, setShowPaymentHelp] = useState(false);
  const [showHistorySortHelp, setShowHistorySortHelp] = useState(false);
  const [view, setView] = useState<'landing' | 'app'>('landing');
  const [selectedHistoryYear, setSelectedHistoryYear] = useState(new Date().getFullYear());
  const [isAddingBill, setIsAddingBill] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPreviewingPDF, setIsPreviewingPDF] = useState(false);
  const [selectedMemberFilter, setSelectedMemberFilter] = useState<string | null>(null);
  const [settingsResetKey, setSettingsResetKey] = useState(0);
  const [editingPayment, setEditingPayment] = useState<{ billId: string, personId: string, date: string } | null>(null);
  const [isSelectingHistoryEdit, setIsSelectingHistoryEdit] = useState(false);
  const [selectedHistoryBillId, setSelectedHistoryBillId] = useState<string | null>(null);
  const [historyEditSnapshot, setHistoryEditSnapshot] = useState<AppState | null>(null);

  const exportData = () => {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const exportFileDefaultName = `byl-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', url);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const importData = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        // Basic validation
        if (json && Array.isArray(json.accounts)) {
          setState(json);
        } else {
          alert('Invalid backup file format');
        }
      } catch (err) {
        alert('Failed to parse backup file');
      }
    };
    reader.readAsText(file);
  };

  // Persistence
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    setSelectedMemberFilter(null);
  }, [state.activeAccountId, selectedHistoryYear]);

  const activeAccount = useMemo(() => {
    return state.accounts.find(a => a.id === state.activeAccountId) || null;
  }, [state.accounts, state.activeAccountId]);

  // Derived Stats based on active account
  const stats = useMemo(() => {
    if (!activeAccount) return { monthlyTotal: 0, yearlyTotal: 0, personStats: [], currentMonthBill: null };
    
    const now = new Date();
    const currentMonthBills = activeAccount.bills.filter(b => isSameMonth(parseISO(b.date), now));
    const currentYearBills = activeAccount.bills.filter(b => isSameYear(parseISO(b.date), now));

    const activeBill = activeAccount.bills.find(b => !b.settled) || null;
    const hasPendingBill = !!activeBill;
    
    // For calculation and header purposes, prioritize the active bill
    const billToDisplay = activeBill;
    const monthlyTotal = billToDisplay ? billToDisplay.totalAmount : 0;
    const yearlyTotal = currentYearBills.reduce((acc, b) => acc + b.totalAmount, 0);

    const personStats = activeAccount.people
      .filter(p => !p.status || p.status === 'active')
      .map(person => {
        const personYearly = currentYearBills.reduce((acc, b) => acc + (b.splitDetails[person.id] || 0), 0);
        const personMonthly = billToDisplay ? (billToDisplay.splitDetails[person.id] || 0) : 0;
        return { ...person, yearlyTotal: personYearly, monthlyTotal: personMonthly };
      });

    return { 
      monthlyTotal, 
      yearlyTotal, 
      personStats, 
      currentMonthBill: billToDisplay, 
      hasPendingBill 
    };
  }, [activeAccount]);

  // Financial history summary
  const historyStats = useMemo(() => {
    if (!activeAccount) return { yearlyTotal: 0, filteredTotal: 0, memberSummary: [] };
    
    const yearBills = activeAccount.bills
      .filter(b => b.settled)
      .filter(b => getYear(parseISO(b.date)) === selectedHistoryYear);
    const yearlyTotal = yearBills.reduce((acc, b) => acc + b.totalAmount, 0);

    // Get all unique person IDs that contributed this year or are current members
    const contributorIds = new Set<string>();
    yearBills.forEach(bill => {
      Object.keys(bill.splitDetails).forEach(id => contributorIds.add(id));
    });
    activeAccount.people.forEach(p => contributorIds.add(p.id));

    let memberSummary = Array.from(contributorIds).map(id => {
      let person = activeAccount.people.find(p => p.id === id);
      
      // If not a current member, search through snapshots in this year's bills
      if (!person) {
        for (const bill of yearBills) {
          const snapshotPerson = bill.peopleSnapshot?.find(p => p.id === id);
          if (snapshotPerson) {
            person = snapshotPerson;
            break;
          }
        }
      }

      const totalPaid = yearBills.reduce((acc, b) => acc + (b.splitDetails[id] || 0), 0);
      const personObj = activeAccount.people.find(p => p.id === id);
      return { 
        id, 
        name: person?.name || "Former Member", 
        totalPaid,
        isRemoved: personObj ? personObj.status === 'left' : true
      };
    });

    // Only show removed members if they actually paid something this year
    memberSummary = memberSummary.filter(m => !m.isRemoved || m.totalPaid > 0);

    // Sorting: Active members first (!isRemoved), then by totalPaid descending
    memberSummary.sort((a, b) => {
      // 1. Filter by status (Active first, Removed last)
      if (a.isRemoved !== b.isRemoved) {
        return a.isRemoved ? 1 : -1;
      }
      // 2. Filter by amount descending
      return b.totalPaid - a.totalPaid;
    });

    const filteredTotal = selectedMemberFilter 
      ? memberSummary.find(m => m.id === selectedMemberFilter)?.totalPaid || 0
      : yearlyTotal;

    return { yearlyTotal, filteredTotal, memberSummary };
  }, [activeAccount, selectedHistoryYear, selectedMemberFilter]);

  // Cleanup old "left" members at the start of a new year
  useEffect(() => {
    if (!activeAccount) return;
    const currentYear = new Date().getFullYear();
    const hasLeftMembersToPurge = activeAccount.people.some(p => p.status === 'left' && p.leaveYear && p.leaveYear < currentYear);
    
    if (hasLeftMembersToPurge) {
      setState(prev => ({
        ...prev,
        accounts: prev.accounts.map(a => a.id === activeAccount.id ? {
          ...a,
          people: a.people.filter(p => !(p.status === 'left' && p.leaveYear && p.leaveYear < currentYear))
        } : a)
      }));
    }
  }, [activeAccount?.id]);

  const addAccount = (payeeName: string, accountNumber: string, people: Person[]) => {
    const newAccount: BillAccount = {
      id: crypto.randomUUID(),
      payeeName,
      accountNumber,
      people,
      bills: []
    };
    setState(prev => ({
      ...prev,
      accounts: [...prev.accounts, newAccount],
      activeAccountId: newAccount.id
    }));
    setIsAddingAccount(false);
    setView('app');
    setActiveTab('dashboard');
  };

  const saveBill = (total: number, date: string, dueDate: string, splitDetails: Record<string, number>) => {
    if (!activeAccount) return;
    
    setState(prev => ({
      ...prev,
      accounts: prev.accounts.map(a => {
        if (a.id !== activeAccount.id) return a;
        
        let nextBills;
        if (editingBillId) {
          nextBills = a.bills.map(b => b.id === editingBillId 
            ? { 
                ...b, 
                totalAmount: total, 
                date: new Date(date + 'T12:00:00').toISOString(), 
                dueDate: new Date(dueDate + 'T12:00:00').toISOString(),
                splitDetails, 
                peopleSnapshot: a.people 
              } 
            : b
          );
        } else {
          const isPaidRecord: Record<string, boolean> = {};
          a.people
            .filter(p => !p.status || p.status === 'active' || (splitDetails[p.id] && splitDetails[p.id] > 0))
            .forEach(p => {
              isPaidRecord[p.id] = false;
            });

          const newBill: BillEntry = {
            id: crypto.randomUUID(),
            date: new Date(date + 'T12:00:00').toISOString(),
            dueDate: new Date(dueDate + 'T12:00:00').toISOString(),
            totalAmount: total,
            splitDetails,
            isPaid: isPaidRecord,
            peopleSnapshot: a.people
          };
          nextBills = [...a.bills, newBill];
        }
        
        return { 
          ...a, 
          bills: nextBills.sort((a, b) => b.date.localeCompare(a.date))
        };
      })
    }));
    
    setIsAddingBill(false);
    setEditingBillId(null);
  };

  const togglePaid = (billId: string, personId: string) => {
    if (!activeAccount) return;

    setState(prev => ({
      ...prev,
      accounts: prev.accounts.map(a => a.id === activeAccount.id
        ? {
            ...a,
            bills: a.bills.map(b => b.id === billId 
              ? { 
                  ...b, 
                  isPaid: { ...b.isPaid, [personId]: !b.isPaid[personId] },
                  paidAt: { 
                    ...(b.paidAt || {}), 
                    [personId]: !b.isPaid[personId] ? new Date().toISOString() : "" 
                  }
                }
              : b
            )
          }
        : a
      )
    }));
  };

  const updatePaidDate = (billId: string, personId: string, date: string) => {
    if (!activeAccount) return;
    // ensure date is YYYY-MM-DD before appending time for consistency
    const dateOnly = date.split('T')[0];
    if (!dateOnly) return;
    
    setState(prev => ({
      ...prev,
      accounts: prev.accounts.map(a => a.id === activeAccount.id
        ? {
            ...a,
            bills: a.bills.map(b => b.id === billId
              ? {
                  ...b,
                  paidAt: { ...(b.paidAt || {}), [personId]: new Date(dateOnly + 'T12:00:00').toISOString() }
                }
              : b
            )
          }
        : a
      )
    }));
    setEditingPayment(null);
  };

  const updateBillSettledDate = (billId: string, date: string) => {
    if (!activeAccount) return;
    const dateOnly = date.split('T')[0];
    if (!dateOnly) return;

    setState(prev => ({
      ...prev,
      accounts: prev.accounts.map(a => a.id === activeAccount.id
        ? {
            ...a,
            bills: a.bills.map(b => b.id === billId
              ? { ...b, settledAt: new Date(dateOnly + 'T12:00:00').toISOString() }
              : b
            )
          }
        : a
      )
    }));
  };

  const settleCurrentBill = () => {
    if (!stats.currentMonthBill || !activeAccount) return;
    setState(prev => ({
      ...prev,
      accounts: prev.accounts.map(a => a.id === activeAccount.id
        ? {
            ...a,
            bills: a.bills.map(b => b.id === stats.currentMonthBill!.id 
              ? { 
                  ...b, 
                  settled: true, 
                  settledAt: new Date().toISOString(),
                  // Mark everyone as paid when settling
                  isPaid: Object.keys(b.isPaid).reduce((acc, id) => ({ ...acc, [id]: true }), {})
                } 
              : b)
          }
        : a
      )
    }));
  };

  const deleteBill = (id: string) => {
    if (!activeAccount) return;
    setState(prev => ({
      ...prev,
      accounts: prev.accounts.map(a => a.id === activeAccount.id
        ? { ...a, bills: a.bills.filter(b => b.id !== id) }
        : a
      )
    }));
    if (editingBillId === id) setEditingBillId(null);
  };

  const deleteAccount = (id: string) => {
    setState(prev => {
      const nextAccounts = prev.accounts.filter(a => a.id !== id);
      const isDeletingActive = prev.activeAccountId === id;
      
      if (isDeletingActive) {
        setView('landing');
      }

      return {
        ...prev,
        accounts: nextAccounts,
        activeAccountId: isDeletingActive
          ? (nextAccounts.length > 0 ? nextAccounts[0].id : null)
          : prev.activeAccountId
      };
    });
  };

  const handlePrint = async () => {
    const wasPreviewing = isPreviewingPDF;
    if (!wasPreviewing) {
      setIsPreviewingPDF(true);
      // Wait for React to render the preview state
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    
    window.print();
    
    if (!wasPreviewing) {
      setIsPreviewingPDF(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!historyRef.current || !activeAccount) return;
    setIsDownloading(true);
    const wasPreviewing = isPreviewingPDF;
    if (!wasPreviewing) setIsPreviewingPDF(true);
    
    // Brief delay to allow React to render the preview state before capturing
    await new Promise(resolve => setTimeout(resolve, 250));

    try {
      const html2pdf = (await import('html2pdf.js' as any)).default;
      const element = historyRef.current;
      const opt = {
        margin: 10,
        filename: selectedMemberFilter 
          ? `${activeAccount.payeeName.replace(/\s+/g, '_')}_${historyStats.memberSummary.find(m => m.id === selectedMemberFilter)?.name.replace(/\s+/g, '_')}_Report_${selectedHistoryYear}.pdf`
          : `${activeAccount.payeeName.replace(/\s+/g, '_')}_Report_${selectedHistoryYear}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true, windowWidth: 1200 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      await html2pdf().from(element).set(opt).save();
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      if (!wasPreviewing) setIsPreviewingPDF(false);
      setIsDownloading(false);
    }
  };

  const availableYears = useMemo(() => {
    if (!activeAccount) return [new Date().getFullYear()];
    const years = new Set(activeAccount.bills.map(b => getYear(parseISO(b.date))));
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a: number, b: number) => b - a);
  }, [activeAccount]);

  if (view === 'landing' || state.accounts.length === 0) {
    return (
      <LandingPage 
        accounts={state.accounts}
        onSelectAccount={(id) => {
          setState(prev => ({ ...prev, activeAccountId: id }));
          setActiveTab('dashboard');
          setView('app');
        }}
        hasAccounts={state.accounts.length > 0} 
        onCompleteOnboarding={addAccount}
        onExportData={exportData}
        onImportData={importData}
        onFactoryReset={() => {
          localStorage.removeItem(STORAGE_KEY);
          window.location.reload();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen pb-20 md:pb-0 md:pl-64 bg-slate-50">
      {/* Sidebar - Desktop */}
      <nav className="fixed left-0 top-0 hidden h-full w-64 border-r border-slate-200 bg-white p-6 md:block no-print">
        <div className="flex items-center gap-3 px-2 mb-10">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-lg shadow-indigo-100">
            <CreditCard size={20} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">Byl</h1>
        </div>
        
        {/* Account Selector */}
        <div className="mb-10 px-2">
          <div className="flex items-center justify-between mb-4">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Active Account</label>
            <button 
              onClick={() => setView('landing')}
              className="text-[10px] font-bold text-indigo-600 hover:underline"
            >
              Home
            </button>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 shadow-sm">
             <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-100">
               <Building2 size={16} />
             </div>
             <span className="text-sm font-bold text-slate-800 truncate">{activeAccount?.payeeName}</span>
          </div>
        </div>

        <div className="space-y-1">
          <NavItem 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
            icon={<LayoutDashboard size={18} />} 
            label="Dashboard" 
          />
          <NavItem 
            active={activeTab === 'history'} 
            onClick={() => setActiveTab('history')} 
            icon={<History size={18} />} 
            label="History" 
          />
          <NavItem 
            active={activeTab === 'settings'} 
            onClick={() => {
              if (activeTab === 'settings') {
                setSettingsResetKey(prev => prev + 1);
              }
              setActiveTab('settings');
            }} 
            icon={<Settings size={18} />} 
            label="Settings" 
          />
        </div>

        <div className="mt-8 px-2">
          <button 
            disabled={stats.hasPendingBill}
            onClick={() => {
              setEditingBillId(null);
              setIsAddingBill(true);
            }}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold shadow-lg transition-all active:scale-95",
              stats.hasPendingBill 
                ? "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none" 
                : "bg-indigo-600 text-white shadow-indigo-100 hover:bg-indigo-700"
            )}
          >
            <Plus size={18} />
            <span>{stats.hasPendingBill ? 'Bill Already Active' : 'Add New Bill'}</span>
          </button>
        </div>
      </nav>

      {/* Mobile Bottom Bar */}
      <nav className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-slate-200 bg-white/90 p-2 pb-6 backdrop-blur-md md:hidden no-print">
        <MobileNavItem 
          active={activeTab === 'dashboard'} 
          onClick={() => setActiveTab('dashboard')} 
          icon={<LayoutDashboard size={22} />} 
        />
        <MobileNavItem 
          active={activeTab === 'history'} 
          onClick={() => setActiveTab('history')} 
          icon={<History size={22} />} 
        />
        
        {/* Centered FAB */}
        <div className="relative flex-shrink-0 w-12 h-10 flex justify-center">
            <button 
              disabled={stats.hasPendingBill}
              onClick={() => {
                setEditingBillId(null);
                setIsAddingBill(true);
              }}
              className={cn(
                "absolute -top-7 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl ring-4 ring-white active:scale-90 transition-all",
                stats.hasPendingBill 
                  ? "bg-slate-300 text-slate-100 shadow-none" 
                  : "bg-indigo-600 shadow-indigo-200"
              )}
            >
              <Plus size={28} />
            </button>
        </div>

        <MobileNavItem 
          active={activeTab === 'settings'} 
          onClick={() => {
            if (activeTab === 'settings') {
              setSettingsResetKey(prev => prev + 1);
            }
            setActiveTab('settings');
          }} 
          icon={<Settings size={22} />} 
        />
        <MobileNavItem 
          active={false} 
          onClick={() => setView('landing')} 
          icon={<Building2 size={22} />} 
        />
      </nav>

      {/* Mobile Header (Account Indicator) */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white/80 p-4 backdrop-blur-md md:hidden fixed top-0 w-full z-40">
        <div className="flex items-center gap-2">
          <Logo className="h-8 w-8" />
          <span className="text-sm font-bold text-slate-800 truncate max-w-[150px]">{activeAccount?.payeeName}</span>
        </div>
        <button 
          onClick={() => setView('landing')}
          className="text-indigo-600 text-[10px] font-bold uppercase tracking-wider px-3 py-1 bg-indigo-50 rounded-full"
        >
          Home
        </button>
      </div>

      {/* Main Content Area */}
      <main className="max-w-5xl px-6 py-10 pt-20 md:pt-10 print-container">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8 no-print"
            >
              <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 pb-6 mb-8 gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-2xl font-bold tracking-tight text-slate-800">{activeAccount?.payeeName} Overview</h2>
                  </div>
                  <p className="text-sm text-slate-500">{activeAccount?.people.filter(p => !p.status || p.status === 'active').length} Members active</p>
                  {activeAccount?.accountNumber && <p className="text-[10px] text-slate-400 font-mono tracking-wider mt-1 uppercase">A/C: {activeAccount.accountNumber}</p>}
                </div>
                <button 
                  onClick={() => setView('landing')}
                  className="hidden md:flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50 transition-all active:scale-95"
                >
                  <Building2 size={14} className="text-indigo-600" />
                  <span>Home</span>
                </button>
              </header>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard 
                  label="Currently Active Bill" 
                  value={formatCurrency(stats.monthlyTotal)} 
                  subLabel={stats.currentMonthBill 
                    ? `Current bill for ${format(parseISO(stats.currentMonthBill.date), 'MMMM')}` 
                    : "No active bill to collect"
                  }
                  icon={<TrendingUp className="text-indigo-600" size={18} />}
                />
              </div>

              {/* People Section */}
              <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-700">Member Status</h3>
                      <button 
                        onClick={() => setShowPaymentHelp(!showPaymentHelp)}
                        className="text-slate-400 hover:text-indigo-600 transition-colors p-0.5 rounded-full hover:bg-slate-100"
                        title="How payment confirmation works"
                      >
                        <HelpCircle size={14} />
                      </button>
                    </div>
                    {stats.currentMonthBill && (
                      <span className={cn(
                        "text-[10px] font-bold flex items-center gap-1",
                        stats.currentMonthBill.dueDate && isBefore(parseISO(stats.currentMonthBill.dueDate), startOfDay(new Date())) && Object.values(stats.currentMonthBill.isPaid).some(v => v === false)
                          ? "text-red-600"
                          : "text-indigo-600"
                      )}>
                        <Calendar size={10} />
                        Due {format(parseISO(stats.currentMonthBill.dueDate || stats.currentMonthBill.date), 'MMM do, yyyy')}
                        {stats.currentMonthBill.dueDate && isBefore(parseISO(stats.currentMonthBill.dueDate), startOfDay(new Date())) && Object.values(stats.currentMonthBill.isPaid).some(v => v === false) && (
                          <span className="ml-1 bg-red-600 text-white px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest animate-pulse shadow-sm shadow-red-100">Overdue Bill</span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {stats.currentMonthBill && stats.personStats.every(p => stats.currentMonthBill!.isPaid[p.id] !== false) && (
                      <button 
                        onClick={settleCurrentBill}
                        className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-[10px] font-bold text-white shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95 animate-in fade-in slide-in-from-right-4 duration-300"
                      >
                        <Check size={12} strokeWidth={3} />
                        <span>Confirm Payment</span>
                      </button>
                    )}
                    <Users size={16} className="text-slate-400" />
                  </div>
                </div>

                <AnimatePresence>
                  {showPaymentHelp && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-indigo-50 p-4 border-b border-indigo-100">
                        <div className="flex items-start gap-3">
                          <div className="bg-white p-1.5 rounded-lg shadow-sm">
                            <CheckCircle2 size={16} className="text-emerald-500" />
                          </div>
                          <div className="space-y-1">
                            <h4 className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider">How to Confirm Payment</h4>
                            <p className="text-xs text-indigo-800 leading-relaxed">
                              When everyone in your list has paid their share, a <span className="font-bold text-emerald-700">"Confirm Payment"</span> button will appear at the top right of this card. Clicking it will finalize the bill, move it to history, and clear the status for the next cycle.
                            </p>
                            <p className="text-[10px] text-indigo-500 italic mt-1">
                              * Mark members as paid by clicking the PENDING status.
                            </p>
                          </div>
                          <button 
                            onClick={() => setShowPaymentHelp(false)}
                            className="text-indigo-400 hover:text-indigo-600 ml-auto"
                          >
                            <XCircle size={16} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="divide-y divide-slate-50">
                  {stats.personStats.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold border border-slate-200">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                            <span className={cn(
                              "text-[9px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border shadow-sm shadow-indigo-50/50 transition-all",
                              p.role === 'main' 
                                ? "bg-indigo-50 text-indigo-600 border-indigo-100" 
                                : "bg-slate-50 text-slate-400 border-slate-100"
                            )}>
                              {p.role} Holder
                            </span>
                          </div>
                          {stats.currentMonthBill && (
                            <p className="text-xs text-slate-400 font-medium tracking-tight whitespace-nowrap">Status for current month</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        {stats.currentMonthBill && (
                          <>
                            <p className="text-sm font-bold text-slate-700">
                              {formatCurrency(p.monthlyTotal)}
                            </p>
                            <div className="flex flex-col items-end gap-1">
                              <button 
                                onClick={() => togglePaid(stats.currentMonthBill!.id, p.id)}
                                className={cn(
                                  "text-[10px] font-bold px-2 py-0.5 rounded border uppercase transition-all flex items-center gap-1",
                                  stats.currentMonthBill.isPaid[p.id]
                                    ? "text-green-600 bg-green-50 border-green-100 shadow-sm"
                                    : (stats.currentMonthBill.dueDate && isBefore(parseISO(stats.currentMonthBill.dueDate), startOfDay(new Date()))
                                        ? "text-red-600 bg-red-50 border-red-100"
                                        : "text-amber-600 bg-amber-50 border-amber-100")
                                )}
                              >
                                {stats.currentMonthBill.isPaid[p.id] ? (
                                  <><Check size={10} strokeWidth={3} /> Paid</>
                                ) : (
                                  stats.currentMonthBill.dueDate && isBefore(parseISO(stats.currentMonthBill.dueDate), startOfDay(new Date())) 
                                    ? 'Overdue' 
                                    : 'Pending'
                                )}
                              </button>
                              
                              {stats.currentMonthBill.isPaid[p.id] && stats.currentMonthBill.paidAt?.[p.id] && (
                                <div className="flex items-center gap-1 group">
                                  <span className={cn(
                                    "text-[9px] font-medium px-1 pr-0 rounded-sm italic",
                                    stats.currentMonthBill.dueDate && isBefore(parseISO(stats.currentMonthBill.dueDate), parseISO(stats.currentMonthBill.paidAt[p.id]))
                                      ? "text-red-500 bg-red-50"
                                      : "text-slate-400"
                                  )}>
                                    {stats.currentMonthBill.dueDate && isBefore(parseISO(stats.currentMonthBill.dueDate), parseISO(stats.currentMonthBill.paidAt[p.id])) && "Late: "}
                                    {format(parseISO(stats.currentMonthBill.paidAt[p.id]), 'MMM d')}
                                  </span>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingPayment({ 
                                        billId: stats.currentMonthBill!.id, 
                                        personId: p.id, 
                                        date: format(parseISO(stats.currentMonthBill!.paidAt![p.id]), 'yyyy-MM-dd') 
                                      });
                                    }}
                                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-indigo-600 transition-all p-0.5"
                                    title="Edit payment date"
                                  >
                                    <Edit3 size={10} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Previous Bills */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-700">Previous Bills</h3>
                  <button onClick={() => setActiveTab('history')} className="text-xs font-bold text-indigo-600 hover:underline">View All History →</button>
                </div>
                <div className="space-y-3">
                  {activeAccount?.bills
                    .filter(b => b.settled)
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .slice(0, 1)
                    .map(bill => (
                      <BillCard 
                        key={bill.id} 
                        bill={bill} 
                        people={activeAccount.people} 
                        onTogglePaid={togglePaid} 
                        onEditPaymentDate={(bid, pid, date) => setEditingPayment({ billId: bid, personId: pid, date })}
                        onDelete={deleteBill}
                        interactive={false}
                      />
                    ))
                  }
                  {(!activeAccount || activeAccount.bills.filter(b => b.settled).length === 0) && (
                    <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center bg-white/50">
                      <p className="text-slate-400 text-sm">No settled bills to display.</p>
                    </div>
                  )}
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <div className={cn(
              "w-full transition-all",
              isPreviewingPDF ? "fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-md overflow-y-auto p-4 sm:p-10" : "space-y-6"
            )}>
              <AnimatePresence>
                {isPreviewingPDF && (
                  <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="flex justify-between items-center mb-6 max-w-[210mm] mx-auto w-full no-print"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-indigo-600 p-2 rounded-xl shadow-lg">
                        <Download size={20} className="text-white" />
                      </div>
                      <div>
                        <h2 className="text-xl font-black text-white tracking-tight leading-none">Layout Preview</h2>
                        <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mt-1">Simulating A4 PDF Document</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setIsPreviewingPDF(false)}
                      className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all active:scale-90 border border-white/10"
                    >
                      <X size={24} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div
                key="history"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={cn(
                  "space-y-6 bg-white rounded-2xl",
                  isPreviewingPDF ? "pdf-preview-mode" : "p-4 sm:p-8"
                )}
                ref={historyRef}
              >
                {/* PDF/Print Header - Bank Statement Style - Using print-only class which is handled in index.css */}
                {(isPreviewingPDF || (typeof window !== 'undefined' && window.matchMedia('print').matches)) && (
                  <div className="print-only flex-1 flex flex-col">
                    <div className="statement-header">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center text-white font-black text-lg tracking-tighter">
                          BYL
                        </div>
                        <div>
                          <h1 className="statement-logo">ACCOUNT STATEMENT</h1>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                            Settled Bill Records & Contributions
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Period</p>
                        <p className="text-sm font-bold text-slate-800">Jan 1, {selectedHistoryYear} — Dec 31, {selectedHistoryYear}</p>
                      </div>
                    </div>

                    <div className="statement-summary-grid">
                      <div className="statement-summary-item">
                        <p className="statement-summary-label">Account Name / Number</p>
                        <p className="statement-summary-value">
                          {activeAccount?.payeeName}
                          {activeAccount?.accountNumber && <span className="block text-[10px] text-slate-400 font-mono mt-0.5">#{activeAccount.accountNumber}</span>}
                        </p>
                      </div>
                      <div className="statement-summary-item">
                        <p className="statement-summary-label">Total Expenses ({selectedHistoryYear})</p>
                        <p className="statement-summary-value">{formatCurrency(historyStats.filteredTotal)}</p>
                      </div>
                      <div className="statement-summary-item">
                        <p className="statement-summary-label">Generated On</p>
                        <p className="statement-summary-value">{format(new Date(), 'MMM d, yyyy')}</p>
                      </div>
                    </div>

                    {selectedMemberFilter && (
                      <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-lg mb-6 flex justify-between items-center">
                        <p className="text-[10px] font-bold text-indigo-900 uppercase">Filtered Report For Member:</p>
                        <p className="text-sm font-black text-indigo-700">{historyStats.memberSummary.find(m => m.id === selectedMemberFilter)?.name}</p>
                      </div>
                    )}

                    <table className="statement-table">
                      <thead>
                        <tr>
                          <th className="w-full">Description / Account</th>
                          <th className="whitespace-nowrap">Paid Date</th>
                          <th className="whitespace-nowrap">Due Date</th>
                          <th className="text-right">Total</th>
                          <th className="text-right">Amount Paid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...(activeAccount?.bills || [])]
                          .filter(bill => bill.settled)
                          .filter(bill => getYear(parseISO(bill.date)) === selectedHistoryYear)
                          .filter(bill => !selectedMemberFilter || (bill.splitDetails[selectedMemberFilter] !== undefined && bill.splitDetails[selectedMemberFilter] > 0))
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .map(bill => {
                            const paidDateStr = selectedMemberFilter 
                              ? (bill.paidAt?.[selectedMemberFilter] || bill.settledAt || bill.date)
                              : (bill.settledAt || bill.date);
                            const paidDate = parseISO(paidDateStr);
                            const billDate = parseISO(bill.date);
                            const dueDate = bill.dueDate ? parseISO(bill.dueDate) : null;
                            const isLate = dueDate && paidDate > dueDate;

                            return (
                              <tr key={bill.id}>
                                <td>
                                  <div className="font-bold">{bill.description}</div>
                                  <div className="text-[9px] text-slate-400">{activeAccount?.payeeName}</div>
                                </td>
                                <td className="whitespace-nowrap">
                                  <div className="font-bold text-slate-700">{format(paidDate, 'MMM d, yyyy')}</div>
                                  {isLate && (
                                    <span className="text-[8px] bg-red-50 text-red-600 px-1 rounded font-black tracking-tighter ml-1">PAID LATE</span>
                                  )}
                                </td>
                                <td className="whitespace-nowrap font-medium text-slate-500">
                                  {format(dueDate || billDate, 'MMM d, yyyy')}
                                </td>
                                <td className="text-right font-bold text-slate-400">{formatCurrency(bill.totalAmount)}</td>
                                <td className="text-right font-black text-indigo-600">
                                  {selectedMemberFilter 
                                    ? formatCurrency(bill.splitDetails[selectedMemberFilter] || 0)
                                    : formatCurrency(bill.totalAmount)
                                  }
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={4} className="text-right py-4 font-bold text-slate-500 uppercase tracking-widest text-[9px]">Calculated Statement Total</td>
                          <td className="text-right py-4 font-black text-xl text-slate-900 border-t-2 border-slate-900">{formatCurrency(historyStats.filteredTotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                    
                    <div className="mt-auto pt-8 border-t border-slate-100 text-[9px] text-slate-400 text-center uppercase tracking-widest leading-relaxed">
                      <p>This statement is an official record of payments settled through the BYL tracker.</p>
                    </div>
                  </div>
                )}

                {/* Dashboard View - Only visible when NOT previewing PDF */}
                {!isPreviewingPDF && (
                  <>
              <header className="flex flex-col gap-4 border-b border-slate-200 pb-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-bold tracking-tight text-slate-800">
                        {selectedMemberFilter 
                          ? `${historyStats.memberSummary.find(m => m.id === selectedMemberFilter)?.name} Payment Report` 
                          : `${activeAccount?.payeeName} History`}
                      </h2>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                         <p className="text-sm text-slate-500 no-print">
                           {selectedMemberFilter ? `Viewing contributions for ${historyStats.memberSummary.find(m => m.id === selectedMemberFilter)?.name}` : 'Complete record of your split expenses'}
                         </p>
                         <p className="text-sm text-slate-500 print-only font-bold">Yearly Statement: {selectedHistoryYear}</p>
                         {selectedMemberFilter && (
                           <p className="text-sm text-indigo-600 font-bold print-only flex items-center gap-1">
                             <Check size={14} /> Filtered: {historyStats.memberSummary.find(m => m.id === selectedMemberFilter)?.name} contributions only
                           </p>
                         )}
                      </div>
                    </div>
                    <div className="relative no-print">
                      <select 
                        value={selectedHistoryYear}
                        onChange={(e) => setSelectedHistoryYear(parseInt(e.target.value))}
                        className="w-full sm:w-auto appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-10 py-2 text-sm font-bold text-slate-700 outline-none hover:border-indigo-400 transition-all focus:ring-4 focus:ring-indigo-500/10"
                      >
                        {availableYears.map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                      <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 no-print">
                    <div className="relative w-full sm:w-auto">
                      <button 
                        onClick={() => setIsSelectingHistoryEdit(!isSelectingHistoryEdit)}
                        className={cn(
                          "flex w-full items-center justify-center sm:justify-start gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all active:scale-95 border",
                          isSelectingHistoryEdit 
                            ? "bg-amber-100 text-amber-700 border-amber-200" 
                            : "bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200"
                        )}
                      >
                        <Edit3 size={16} />
                        <span>Edit</span>
                      </button>

                      <AnimatePresence>
                        {isSelectingHistoryEdit && (
                          <>
                            <div 
                              className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-0" 
                              onClick={() => setIsSelectingHistoryEdit(false)} 
                            />
                            <motion.div 
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className={cn(
                                "z-50 rounded-xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-slate-900/5 overflow-hidden",
                                "fixed inset-x-4 top-[20%] mx-auto w-auto max-w-sm",
                                "sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:mt-2 sm:w-72"
                              )}
                            >
                              <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-50">
                                Select Bill to Edit ({selectedHistoryYear})
                              </div>
                              <div className="max-h-64 overflow-y-auto mt-1 custom-scrollbar">
                                {[...(activeAccount?.bills || [])]
                                  .filter(b => b.settled && getYear(parseISO(b.date)) === selectedHistoryYear)
                                  .map(bill => (
                                    <button
                                      key={bill.id}
                                      onClick={() => {
                                        setHistoryEditSnapshot(JSON.parse(JSON.stringify(state)));
                                        setSelectedHistoryBillId(bill.id);
                                        setIsSelectingHistoryEdit(false);
                                      }}
                                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 group"
                                    >
                                      <div className="flex flex-col">
                                        <span className="font-bold text-slate-700 group-hover:text-indigo-600 leading-tight">
                                          {format(parseISO(bill.date), 'MMMM yyyy')}
                                        </span>
                                        <div className="flex items-center gap-2 mt-0.5">
                                          <span className="text-[10px] font-bold text-indigo-500">
                                            {formatCurrency(bill.totalAmount)}
                                          </span>
                                          {bill.dueDate && (
                                            <>
                                              <span className="text-[10px] text-slate-300">•</span>
                                              <span className="text-[10px] text-slate-400">
                                                Due: {format(parseISO(bill.dueDate), 'MMM d, yyyy')}
                                              </span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                      <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-400" />
                                    </button>
                                  ))}
                                  {(!activeAccount?.bills || activeAccount.bills.filter(b => b.settled && getYear(parseISO(b.date)) === selectedHistoryYear).length === 0) && (
                                    <div className="p-4 text-center">
                                      <p className="text-xs text-slate-400 italic">No historical bills found for this year.</p>
                                    </div>
                                  )}
                              </div>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>

                    <button 
                      onClick={() => setIsPreviewingPDF(true)}
                      className="flex w-full sm:w-auto items-center justify-center sm:justify-start gap-2 rounded-lg bg-slate-50 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all active:scale-95 border border-slate-200"
                    >
                      <Eye size={16} />
                      <span>Preview</span>
                    </button>
                    <button 
                      onClick={handlePrint}
                      className="flex w-full sm:w-auto items-center justify-center sm:justify-start gap-2 rounded-lg bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-600 hover:bg-indigo-100 transition-all active:scale-95 border border-indigo-100"
                    >
                      <Printer size={16} />
                      <span>Print</span>
                    </button>
                    <button 
                      onClick={handleDownloadPDF}
                      disabled={isDownloading}
                      className="flex w-full sm:w-auto items-center justify-center sm:justify-start gap-2 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-600 hover:bg-emerald-100 transition-all active:scale-95 border border-emerald-100 disabled:opacity-50"
                    >
                      <Download size={16} className={isDownloading ? "animate-bounce" : ""} />
                      <span>{isDownloading ? '...' : 'PDF'}</span>
                    </button>
                  </div>
              </header>

              {/* Financial Summary Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-6 flex flex-col justify-center">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                     {selectedMemberFilter ? `${historyStats.memberSummary.find(m => m.id === selectedMemberFilter)?.name}'s Share` : 'Total Spent'} in {selectedHistoryYear}
                   </p>
                   <p className="text-3xl font-black text-indigo-600">{formatCurrency(historyStats.filteredTotal)}</p>
                   <p className="text-[10px] text-slate-400 font-medium mt-2">
                     {selectedMemberFilter 
                       ? `Total contributions recorded for this member in ${selectedHistoryYear}` 
                       : `Total combined payments across all bills in ${selectedHistoryYear}`}
                   </p>
                </div>

                <div className={cn(
                  "rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col",
                  selectedMemberFilter && "print:hidden no-print" // Hide member list when filtered and printing
                )}>
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Member Contributions ({selectedHistoryYear})</h3>
                      <button 
                        onClick={() => setShowHistorySortHelp(!showHistorySortHelp)}
                        className="text-slate-400 hover:text-indigo-600 transition-colors p-0.5 rounded-full hover:bg-slate-100 no-print"
                        title="About member sorting and printing"
                      >
                        <HelpCircle size={12} />
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {showHistorySortHelp && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden no-print"
                      >
                        <div className="bg-indigo-50 p-4 border-b border-indigo-100">
                          <div className="flex items-start gap-3">
                            <div className="bg-white p-1.5 rounded-lg shadow-sm">
                              <ArrowUpDown size={14} className="text-indigo-600" />
                            </div>
                            <div className="space-y-1">
                              <h4 className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider">Member Sorting & Reports</h4>
                              <p className="text-[10px] text-indigo-800 leading-relaxed">
                                Members are automatically sorted by their contribution amount (highest to lowest). Members who have <span className="font-bold underline">Left Account</span> are kept at the bottom for record-keeping.
                              </p>
                              <p className="text-[10px] text-indigo-800 leading-relaxed mt-1">
                                <span className="font-bold">Tip:</span> Click a member's name to filter the view. You can then use the <span className="font-bold">Print</span> or <span className="font-bold">Download</span> buttons to generate a report showing only their specific payments for the year.
                              </p>
                            </div>
                            <button 
                              onClick={() => setShowHistorySortHelp(false)}
                              className="text-indigo-400 hover:text-indigo-600 ml-auto"
                            >
                              <XCircle size={14} />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="divide-y divide-slate-100 overflow-y-auto max-h-[220px] sm:max-h-none">
                    {historyStats.memberSummary.map(m => (
                      <div 
                        key={m.id} 
                        onClick={() => setSelectedMemberFilter(prev => prev === m.id ? null : m.id)}
                        className={cn(
                          "px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer",
                          selectedMemberFilter === m.id && "bg-indigo-50 hover:bg-indigo-100 border-l-4 border-l-indigo-600"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border",
                            m.isRemoved 
                              ? "bg-slate-50 text-slate-300 border-slate-100" 
                              : (selectedMemberFilter === m.id ? "bg-indigo-600 text-white border-indigo-700" : "bg-slate-100 text-slate-500 border-slate-200")
                          )}>
                            {m.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col text-left">
                            <span className={cn("text-xs font-semibold", m.isRemoved ? "text-slate-400" : "text-slate-700", selectedMemberFilter === m.id && "text-indigo-700")}>
                              {m.name}
                            </span>
                            {m.isRemoved && <span className="text-[7px] font-bold text-slate-300 uppercase tracking-tighter -mt-0.5">Left Account</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={cn("text-xs font-bold", selectedMemberFilter === m.id ? "text-indigo-700" : "text-slate-800")}>{formatCurrency(m.totalPaid)}</p>
                          <p className="text-[8px] font-medium text-slate-400 uppercase tracking-tighter">Paid {selectedHistoryYear}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Footer Row */}
                  <div className="bg-indigo-50 px-4 py-3 border-t border-indigo-100 flex items-center justify-between">
                    <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">Account Contributor for {selectedHistoryYear}</span>
                    <span className="text-sm font-black text-indigo-700">{formatCurrency(historyStats.yearlyTotal)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    {selectedMemberFilter 
                      ? `Bills Paid by ${historyStats.memberSummary.find(m => m.id === selectedMemberFilter)?.name}` 
                      : 'Bill Records'}
                  </h3>
                  {selectedMemberFilter && (
                    <button 
                      onClick={() => setSelectedMemberFilter(null)}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 no-print"
                    >
                      <RotateCcw size={10} />
                      Show All Bills
                    </button>
                  )}
                </div>
                {[...(activeAccount?.bills || [])]
                  .filter(bill => getYear(parseISO(bill.date)) === selectedHistoryYear)
                  .filter(bill => !selectedMemberFilter || (bill.splitDetails[selectedMemberFilter] !== undefined && bill.splitDetails[selectedMemberFilter] > 0))
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map(bill => (
                  <div key={bill.id} className="print-card">
                    <BillCard 
                      bill={bill} 
                      people={activeAccount!.people} 
                      onTogglePaid={togglePaid} 
                      onEditPaymentDate={(bid, pid, date) => setEditingPayment({ billId: bid, personId: pid, date })}
                      onDelete={deleteBill}
                      readOnly={true}
                    />
                  </div>
                ))}
                {(activeAccount?.bills.filter(bill => getYear(parseISO(bill.date)) === selectedHistoryYear).length || 0) === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center no-print">
                    <p className="text-slate-400 text-sm font-medium">No records found for {selectedHistoryYear}.</p>
                  </div>
                )}
              </div>
                  </>
                )}
            </motion.div>
          </div>
          )}

          {activeTab === 'settings' && (
            <motion.div
              key={`settings-${settingsResetKey}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <SettingsTab 
                activeAccount={activeAccount} 
                onUpdateAccount={(updated) => {
                  setState(prev => ({
                    ...prev,
                    accounts: prev.accounts.map(a => a.id === updated.id ? updated : a)
                  }));
                }}
                onDeleteAccount={deleteAccount} 
                onExportData={exportData}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Add Account Modal */}
      <AnimatePresence>
        {isAddingAccount && (
          <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 overflow-y-auto pt-8 sm:pt-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingAccount(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl sm:max-h-[90vh] rounded-xl bg-white p-6 sm:p-8 shadow-2xl shadow-slate-900/20"
            >
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-2xl font-bold tracking-tight text-slate-800">Add New Bill Account</h2>
                <button onClick={() => setIsAddingAccount(false)} className="text-slate-400 hover:text-slate-600">
                  <XCircle size={20} />
                </button>
              </div>
              <p className="mb-8 text-sm text-slate-500">Set up a new payee and assign member roles</p>
              
              <AccountForm 
                onCancel={() => setIsAddingAccount(false)}
                onSubmit={(payee, accountNumber, people) => addAccount(payee, accountNumber, people)}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Bill Modal */}
      <AnimatePresence>
        {isAddingBill && activeAccount && (
          <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 overflow-y-auto pt-8 sm:pt-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingBill(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg sm:max-h-[90vh] rounded-xl bg-white p-6 sm:p-8 shadow-2xl shadow-slate-900/20"
            >
            <div className="flex justify-between items-center mb-1">
              <h2 className="text-xl font-bold tracking-tight text-slate-800">{editingBillId ? 'Edit Monthly Bill' : 'Add Monthly Bill'}</h2>
              <button 
                onClick={() => {
                  setIsAddingBill(false);
                  setEditingBillId(null);
                }} 
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle size={20} />
              </button>
            </div>
            <p className="mb-6 text-sm text-slate-500">
              {editingBillId ? `Update the ${activeAccount?.payeeName} record` : `Record a new ${activeAccount?.payeeName} bill`}
            </p>
            
            <BillForm 
              people={activeAccount.people.filter(p => 
                p.status !== 'left' || 
                (editingBillId && activeAccount.bills.find(b => b.id === editingBillId)?.splitDetails[p.id] !== undefined)
              )}
              onCancel={() => {
                setIsAddingBill(false);
                setEditingBillId(null);
              }}
              onSubmit={saveBill}
              initialBill={activeAccount.bills.find(b => b.id === editingBillId)}
            />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Payment Date Modal */}
      <AnimatePresence>
        {selectedHistoryBillId && activeAccount && (
          <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 overflow-y-auto pt-8 sm:pt-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (historyEditSnapshot) {
                  setState(historyEditSnapshot);
                }
                setSelectedHistoryBillId(null);
                setHistoryEditSnapshot(null);
              }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl sm:max-h-[90vh] rounded-xl bg-white p-6 sm:p-8 shadow-2xl shadow-slate-900/20"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-800">Edit Historical Bill</h2>
                  <p className="text-xs text-slate-500 mt-1">Adjust payment records for this past bill. Click members to edit dates.</p>
                </div>
                <button 
                  onClick={() => {
                    if (historyEditSnapshot) {
                      setState(historyEditSnapshot);
                    }
                    setSelectedHistoryBillId(null);
                    setHistoryEditSnapshot(null);
                  }} 
                  className="text-slate-400 hover:text-slate-600 p-2"
                >
                  <XCircle size={24} />
                </button>
              </div>

              {activeAccount.bills.find(b => b.id === selectedHistoryBillId) && (
                <div className="space-y-6">
                  <div className="bg-slate-50/50 rounded-xl p-4 mb-4 border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bill Details</span>
                      <span className="text-sm font-black text-indigo-600">{format(parseISO(activeAccount.bills.find(b => b.id === selectedHistoryBillId)!.date), 'MMMM yyyy')}</span>
                    </div>
                    <div className="text-lg font-bold text-slate-800">{activeAccount.bills.find(b => b.id === selectedHistoryBillId)!.description}</div>
                    
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Overall Bill Settled Date</label>
                      <div className="relative">
                        <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none" />
                        <input 
                          type="date"
                          value={activeAccount.bills.find(b => b.id === selectedHistoryBillId)?.settledAt ? activeAccount.bills.find(b => b.id === selectedHistoryBillId)!.settledAt!.split('T')[0] : ''}
                          onChange={(e) => updateBillSettledDate(selectedHistoryBillId, e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-4 py-2.5 text-sm font-bold text-slate-700 outline-none transition-all ring-indigo-500/20 focus:border-indigo-500 focus:ring-4"
                        />
                      </div>
                      <p className="text-[9px] text-slate-400 mt-2 italic font-medium leading-tight">
                        * Use this to correct when the entire bill was finalized and moved to history.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Member Payment Records</div>
                      <div className="group relative">
                        <button className="text-slate-300 hover:text-indigo-400 transition-colors">
                          <HelpCircle size={14} />
                        </button>
                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none z-50">
                          <div className="bg-slate-800 text-white text-[10px] p-3 rounded-xl shadow-xl border border-slate-700 leading-relaxed font-medium">
                            <p>You can adjust the individual payment date for any member by clicking their <span className="text-indigo-300 font-bold">name</span>.</p>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45 -translate-y-1"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <BillCard 
                      bill={activeAccount.bills.find(b => b.id === selectedHistoryBillId)!} 
                      people={activeAccount.people} 
                      onTogglePaid={togglePaid} 
                      onEditPaymentDate={(bid, pid, date) => setEditingPayment({ billId: bid, personId: pid, date })}
                      interactive={true}
                      dateClickMode={true}
                    />
                  </div>

                  <div className="mt-8">
                    <button 
                      onClick={() => {
                        setSelectedHistoryBillId(null);
                        setHistoryEditSnapshot(null);
                      }}
                      className="w-full rounded-xl bg-slate-900 py-4 text-sm font-black text-white shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-[0.98]"
                    >
                      SAVE & CLOSE
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Payment Date Modal */}
      <AnimatePresence>
        {editingPayment && activeAccount && (
          <div className="fixed inset-0 z-[110] flex items-start sm:items-center justify-center p-4 overflow-y-auto pt-8 sm:pt-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingPayment(null)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm sm:max-h-[90vh] rounded-xl bg-white p-6 shadow-2xl shadow-slate-900/20"
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold tracking-tight text-slate-800">Edit Payment Date</h2>
                <button 
                  onClick={() => setEditingPayment(null)} 
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle size={20} />
                </button>
              </div>
              <p className="mb-4 text-xs text-slate-500">
                Adjust the date when <span className="font-bold text-slate-700">{activeAccount.people.find(p => p.id === editingPayment.personId)?.name}</span> paid their share.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Payment Date</label>
                  <input 
                    type="date" 
                    value={editingPayment.date.split('T')[0]}
                    onChange={e => setEditingPayment({ ...editingPayment, date: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm outline-none transition-all ring-indigo-500/20 focus:border-indigo-500 focus:ring-4"
                  />
                </div>
                
                <div className="flex items-center gap-3 pt-2">
                  <button 
                    onClick={() => setEditingPayment(null)}
                    className="flex-1 rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => updatePaidDate(editingPayment.billId, editingPayment.personId, editingPayment.date)}
                    disabled={!editingPayment.date}
                    className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save Date
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Recurring Schedule Modal - Removed */}
    </div>
  );
}

function Logo({ className = "h-20 w-20" }: { className?: string }) {
  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <svg 
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-xl"
      >
        <rect 
          x="5" 
          y="5" 
          width="90" 
          height="90" 
          rx="24" 
          fill="url(#logoGradient)" 
        />
        {/* Technical Internal Lines */}
        <path d="M20 30 Q 50 40 80 30" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" fill="none" />
        <path d="M15 50 Q 50 62 85 50" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" fill="none" />
        <circle cx="50" cy="50" r="35" stroke="rgba(255,255,255,0.1)" strokeWidth="1" fill="none" />
        <circle cx="50" cy="50" r="28" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" fill="none" />
        <path d="M40 15 L 40 20 M 60 15 L 60 20" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
        <path d="M15 70 L 25 70 M 75 70 L 85 70" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
        
        <text 
          x="50" 
          y="62" 
          textAnchor="middle" 
          fill="white" 
          style={{ font: 'bold 36px sans-serif', letterSpacing: '-0.5px' }}
        >
          BYL
        </text>
        
        <defs>
          <linearGradient id="logoGradient" x1="5" y1="5" x2="95" y2="95" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#06B6D4" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function LandingPage({ 
  accounts,
  onSelectAccount,
  hasAccounts, 
  onCompleteOnboarding,
  onExportData,
  onImportData,
  onFactoryReset
}: { 
  accounts: BillAccount[],
  onSelectAccount: (id: string) => void,
  hasAccounts: boolean, 
  onCompleteOnboarding: (payee: string, accountNumber: string, people: Person[]) => void,
  onExportData: () => void,
  onImportData: (file: File) => void,
  onFactoryReset: () => void
}) {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (showOnboarding) {
    return <Onboarding onComplete={onCompleteOnboarding} onCancel={() => setShowOnboarding(false)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-indigo-50/50 blur-3xl" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full bg-slate-100 blur-3xl" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-4xl text-center space-y-10"
      >
        <div className="flex flex-col items-center gap-6">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Logo className="h-24 w-24 sm:h-28 sm:w-28" />
          </motion.div>
          <div className="space-y-2">
            <h1 className="text-6xl font-black tracking-tight text-slate-900 sm:text-7xl">
              Byl<span className="text-indigo-600">.</span>
            </h1>
            <p className="text-xl text-slate-500 font-medium max-w-md mx-auto">
              The smartest way to split, track, and manage shared household bills.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-6 pt-4 w-full">
          {hasAccounts ? (
            <div className="w-full max-w-2xl space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Your Bill Accounts</h2>
                <button 
                  onClick={() => setShowOnboarding(true)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 px-3 py-1 rounded-full px-3 py-1"
                >
                  <Plus size={14} />
                  <span>New Account</span>
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                {accounts.map(account => {
                  const today = startOfDay(new Date());
                  const pendingBills = account.bills.filter(b => !b.settled && Object.values(b.isPaid).some(v => !v));
                  const sortedPending = [...pendingBills].sort((a, b) => {
                    const dateA = a.dueDate ? parseISO(a.dueDate).getTime() : parseISO(a.date).getTime();
                    const dateB = b.dueDate ? parseISO(b.dueDate).getTime() : parseISO(b.date).getTime();
                    return dateA - dateB;
                  });
                  const nextBill = sortedPending[0];
                  const overdueBill = pendingBills.find(b => b.dueDate && isBefore(parseISO(b.dueDate), today));

                  return (
                    <button
                      key={account.id}
                      onClick={() => onSelectAccount(account.id)}
                      className={cn(
                        "group flex items-center justify-between gap-4 p-5 rounded-2xl bg-white border transition-all hover:shadow-xl active:scale-[0.98] relative overflow-hidden",
                        overdueBill 
                          ? "border-red-200 shadow-sm shadow-red-50 hover:border-red-400" 
                          : "border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-indigo-50"
                      )}
                    >
                      <div className="flex items-center gap-4 truncate">
                        <div className={cn(
                          "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors",
                          overdueBill 
                            ? "bg-red-50 text-red-500 group-hover:bg-red-100" 
                            : "bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600"
                        )}>
                          <Building2 size={24} />
                        </div>
                        <div className="truncate">
                          <h3 className="font-bold text-slate-800 truncate leading-tight mb-0.5">{account.payeeName}</h3>
                          <div className="flex items-center gap-2">
                            {nextBill ? (
                              <p className={cn(
                                "text-[10px] font-bold uppercase tracking-wider",
                                overdueBill ? "text-red-500" : "text-slate-400"
                              )}>
                                Due {format(parseISO(nextBill.dueDate || nextBill.date), 'MMM do')}
                              </p>
                            ) : (
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">No Pending Bills</p>
                            )}
                            {overdueBill ? (
                              <span className="text-[8px] font-black uppercase bg-red-600 text-white px-1.5 py-0.5 rounded leading-none shrink-0 animate-pulse">Overdue</span>
                            ) : nextBill ? (
                              <span className="text-[8px] font-black uppercase bg-amber-500 text-white px-1.5 py-0.5 rounded leading-none shrink-0">Pending</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <ChevronRight size={18} className={cn(
                        "transition-transform group-hover:translate-x-1",
                        overdueBill ? "text-red-300 group-hover:text-red-500" : "text-slate-300 group-hover:text-indigo-500"
                      )} />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <button 
              onClick={() => setShowOnboarding(true)}
              className="group flex w-full sm:w-auto items-center justify-center gap-3 rounded-2xl bg-indigo-600 px-8 py-4 text-lg font-bold text-white shadow-xl shadow-indigo-100 transition-all hover:bg-indigo-700 hover:scale-[1.02] active:scale-95"
            >
              <span>Get Started</span>
              <Plus size={20} className="transition-transform group-hover:rotate-90" />
            </button>
          )}
          
          <div className="flex items-center gap-8 text-slate-400 font-bold uppercase tracking-widest text-[10px]">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>Smart Splitting</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
              <span>Yearly Reports</span>
            </div>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-12">
          {[
            { icon: <Users size={20} />, title: "Team Split", desc: "Easily distribute costs across roommates or family." },
            { icon: <History size={20} />, title: "Record Keeper", desc: "A permanent, searchable history of every payment made." },
            { icon: <TrendingUp size={20} />, title: "Accountability", desc: "Clear 'Paid' vs 'Pending' status for every member." }
          ].map((f, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + (i * 0.1) }}
              className="bg-white/50 backdrop-blur-sm border border-slate-200 rounded-2xl p-6 text-left hover:bg-white hover:shadow-lg transition-all cursor-default"
            >
              <div className="mb-4 inline-flex p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                {f.icon}
              </div>
              <h3 className="font-bold text-slate-800 mb-1">{f.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">{f.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Global Data Management */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="pt-16 pb-8 border-t border-slate-200 mt-12 w-full max-w-2xl mx-auto"
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-800">Backup & Transfer</h3>
              <p className="text-xs text-slate-400 font-medium">Download or restore all accounts and history at once</p>
            </div>
            
            <div className="flex items-center gap-3 mt-2">
              <button 
                onClick={onExportData}
                className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:border-indigo-200 hover:text-indigo-600 transition-all shadow-sm active:scale-95"
              >
                <Download size={14} />
                <span>Export All Data</span>
              </button>
              
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:border-indigo-200 hover:text-indigo-600 transition-all shadow-sm active:scale-95"
              >
                <Plus size={14} />
                <span>Import Backup</span>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  className="hidden" 
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onImportData(file);
                  }}
                />
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col items-center gap-3">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Danger Zone</p>
              <FactoryResetButton onReset={onFactoryReset} onExport={onExportData} />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

function Onboarding({ onComplete, onCancel }: { onComplete: (payee: string, accountNumber: string, people: Person[]) => void, onCancel?: () => void }) {
  return (
    <div className="min-h-[100dvh] bg-slate-50 flex sm:items-center items-start justify-center p-4 sm:p-6 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-50 via-white to-slate-50 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-4 sm:my-auto"
      >
        <div className="bg-indigo-600 p-10 text-white relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
               <Logo className="h-10 w-10 sm:h-12 sm:w-12 bg-white/10 backdrop-blur-md rounded-xl p-1" />
               <span className="font-bold tracking-widest uppercase text-xs opacity-80">Setup Account</span>
            </div>
            <h1 className="text-4xl font-black tracking-tight mb-3 italic">Welcome to Byl</h1>
            <p className="text-indigo-100 font-medium text-lg max-w-md">Let's set up your first shared expense. You can add more accounts later in settings.</p>
          </div>
          <div className="absolute -right-20 -bottom-20 opacity-20 bg-white w-80 h-80 rounded-full" />
        </div>
        
        <div className="p-10">
          <AccountForm onSubmit={onComplete} hideCancel={!onCancel} onCancel={onCancel} />
        </div>
      </motion.div>
    </div>
  );
}

function AccountForm({ 
  onSubmit, 
  onCancel, 
  hideCancel = false 
}: { 
  onSubmit: (payee: string, accountNumber: string, people: Person[]) => void, 
  onCancel?: () => void,
  hideCancel?: boolean
}) {
  const [payee, setPayee] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [people, setPeople] = useState<Person[]>([
    { id: crypto.randomUUID(), name: '', role: 'main' }
  ]);

  const [error, setError] = useState<string | null>(null);

  const addPerson = () => {
    setPeople([...people, { id: crypto.randomUUID(), name: '', role: 'sub' }]);
    setError(null);
  };

  const removePerson = (id: string) => {
    if (people.length > 1) {
      setPeople(people.filter(p => p.id !== id));
      setError(null);
    }
  };

  const updatePerson = (id: string, name: string) => {
    setPeople(people.map(p => p.id === id ? { ...p, name } : p));
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payee.trim()) {
      setError('Please enter a Payee Name');
      return;
    }
    const validPeople = people.filter(p => p.name.trim());
    if (validPeople.length === 0) {
      setError('Please add at least one member with a name');
      return;
    }
    if (people.some(p => !p.name.trim())) {
      setError('All added members must have a name');
      return;
    }
    onSubmit(payee, accountNumber, validPeople);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-[10px] font-bold uppercase tracking-widest text-center"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Payee Name</label>
            <input 
              type="text" 
              required
              autoFocus
              placeholder="e.g. Electric Co, Rent, Internet"
              value={payee}
              onChange={e => setPayee(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none ring-indigo-500/20 focus:border-indigo-500 focus:ring-4 transition-all"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Account Number (Optional)</label>
            <input 
              type="text" 
              placeholder="e.g. 123456789"
              value={accountNumber}
              onChange={e => setAccountNumber(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none ring-indigo-500/20 focus:border-indigo-500 focus:ring-4 transition-all"
            />
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Account Members</label>
          <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
            {people.map((p, index) => (
              <div key={p.id} className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <input 
                    type="text" 
                    required
                    placeholder={index === 0 ? "Main Holder Name (e.g. You)" : `Member ${index + 1} Name`}
                    value={p.name}
                    onChange={e => updatePerson(p.id, e.target.value)}
                    className="w-full rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 text-sm outline-none focus:bg-white focus:border-indigo-500 transition-all"
                  />
                </div>
                <div className={cn(
                  "text-[9px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border shadow-sm transition-all shrink-0",
                  p.role === 'main' 
                    ? "bg-indigo-50 text-indigo-600 border-indigo-100 shadow-indigo-50/50" 
                    : "bg-slate-50 text-slate-400 border-slate-100"
                )}>
                  {p.role} Holder
                </div>
                {people.length > 1 && (
                  p.role !== 'main' ? (
                    <button 
                      type="button" 
                      onClick={() => removePerson(p.id)}
                      className="p-2 text-slate-300 hover:text-red-500 transition-colors shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : (
                    <div className="w-9" />
                  )
                )}
              </div>
            ))}
          </div>
          <button 
            type="button"
            onClick={addPerson}
            className="flex items-center gap-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 p-2"
          >
            <UserPlus size={14} />
            <span>Add Member</span>
          </button>
        </div>
      </div>

      <div className="pt-4 flex gap-3">
        {!hideCancel && onCancel && (
          <button 
            type="button" 
            onClick={onCancel}
            className="flex-1 rounded-lg bg-slate-100 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-200"
          >
            Cancel
          </button>
        )}
        <button 
          type="submit" 
          className="flex-1 rounded-lg bg-indigo-600 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-100 transition-all hover:bg-indigo-700 active:scale-95"
        >
          Create Account
        </button>
      </div>
    </form>
  );
}

function BillForm({ 
  people, 
  onSubmit, 
  onCancel, 
  initialBill 
}: { 
  people: Person[], 
  onSubmit: (total: number, date: string, dueDate: string, splitDetails: Record<string, number>) => void, 
  onCancel: () => void,
  initialBill?: BillEntry
}) {
  const [totalAmount, setTotalAmount] = useState<string>(initialBill ? initialBill.totalAmount.toString() : '');
  const [date, setDate] = useState(initialBill ? initialBill.date.split('T')[0] : format(new Date(), 'yyyy-MM-dd'));
  const [dueDate, setDueDate] = useState(initialBill?.dueDate ? initialBill.dueDate.split('T')[0] : '');
  const [error, setError] = useState<string | null>(null);
  const [splitDetails, setSplitDetails] = useState<Record<string, string>>(() => {
    if (initialBill) {
      const details: Record<string, string> = {};
      Object.keys(initialBill.splitDetails).forEach(id => {
        details[id] = initialBill.splitDetails[id].toString();
      });
      return details;
    }
    const initial: Record<string, string> = {};
    people.forEach(p => {
      initial[p.id] = '';
    });
    return initial;
  });

  const handleCustomAmountChange = (personId: string, value: string) => {
    const nextDetails = { ...splitDetails, [personId]: value };
    setSplitDetails(nextDetails);
    
    // Auto-calculate total based on individual shares
    let calculatedTotal = 0;
    Object.keys(nextDetails).forEach(key => {
      calculatedTotal += (parseFloat(nextDetails[key]) || 0);
    });
    setTotalAmount(calculatedTotal > 0 ? calculatedTotal.toFixed(2) : '');
  };

  const handleTotalChange = (value: string) => {
    setTotalAmount(value);
    setError(null);
    const total = parseFloat(value) || 0;
    
    // Distribute equally when total is changed
    const split = (total / people.length).toFixed(2);
    const nextDetails: Record<string, string> = {};
    people.forEach(p => {
      nextDetails[p.id] = split;
    });
    setSplitDetails(nextDetails);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!totalAmount || parseFloat(totalAmount) <= 0) {
      setError('Please enter a valid bill amount');
      return;
    }
    
    if (!date) {
      setError('Please select a bill date');
      return;
    }

    if (!dueDate) {
      setError('Please select a due date');
      return;
    }

    if (Object.values(splitDetails).some(v => v === '')) {
      setError('Please fill in all member shares (use 0 if they owe nothing)');
      return;
    }

    const finalTotal = parseFloat(totalAmount);
    const finalDetails: Record<string, number> = {};
    people.forEach(p => {
      finalDetails[p.id] = parseFloat(splitDetails[p.id]) || 0;
    });

    onSubmit(finalTotal, date, dueDate, finalDetails);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Total Bill Amount</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
            <input 
              type="number" 
              step="0.01" 
              required
              placeholder="0.00"
              value={totalAmount}
              onChange={e => handleTotalChange(e.target.value)}
              className={cn(
                "w-full rounded-lg border px-8 py-2.5 text-sm outline-none transition-all",
                error && !totalAmount ? "border-red-500 ring-4 ring-red-50" : "border-slate-200 ring-indigo-500/20 focus:border-indigo-500 focus:ring-4"
              )}
            />
          </div>
          <p className="mt-1 text-[10px] text-slate-400 font-medium italic">Changing this distribute equally among members</p>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Received Bill Date</label>
          <input 
            type="date" 
            required
            value={date}
            onChange={e => {
              setDate(e.target.value);
              setError(null);
            }}
            className={cn(
              "w-full rounded-lg border px-4 py-2.5 text-sm outline-none transition-all",
              error && !date ? "border-red-500 ring-4 ring-red-50" : "border-slate-200 ring-indigo-500/20 focus:border-indigo-500 focus:ring-4"
            )}
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Due Date</label>
          <input 
            type="date" 
            required
            placeholder="Select Due Date"
            value={dueDate}
            onChange={e => {
              setDueDate(e.target.value);
              setError(null);
            }}
            className={cn(
              "w-full rounded-lg border px-4 py-2.5 text-sm outline-none transition-all",
              error && !dueDate ? "border-red-500 ring-4 ring-red-50" : "border-slate-200 ring-indigo-500/20 focus:border-indigo-500 focus:ring-4"
            )}
          />
          <p className="mt-1 text-[10px] text-amber-500 font-medium italic">Payments after this date will be marked as overdue</p>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold border border-red-100 flex items-center gap-2"
          >
            <div className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-4">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Member Shares (Individual Plans)</label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {people.map(p => (
            <div key={p.id} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase">{p.name}</span>
                <span className={cn(
                  "text-[9px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border shadow-sm transition-all",
                  p.role === 'main' 
                    ? "bg-indigo-50 text-indigo-600 border-indigo-100 shadow-indigo-50/50" 
                    : "bg-slate-50 text-slate-400 border-slate-100"
                )}>
                  {p.role} Holder
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">$</span>
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="0.00"
                  value={splitDetails[p.id]}
                  onChange={e => handleCustomAmountChange(p.id, e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-7 py-1.5 text-sm outline-none focus:border-indigo-500 transition-all font-mono"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button 
          type="button" 
          onClick={onCancel}
          className="flex-1 rounded-lg bg-slate-100 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-200"
        >
          Cancel
        </button>
        <button 
          type="submit" 
          className="flex-1 rounded-lg bg-indigo-600 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-100 transition-all hover:bg-indigo-700 active:scale-95"
        >
          {initialBill ? 'Update Bill' : 'Add Bill'}
        </button>
      </div>
    </form>
  );
}
function SettingsTab({ activeAccount, onUpdateAccount, onDeleteAccount, onExportData }: { 
  activeAccount: BillAccount | null, 
  onUpdateAccount: (account: BillAccount) => void,
  onDeleteAccount: (id: string) => void,
  onExportData: () => void
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<BillAccount | null>(activeAccount);
  const [newName, setNewName] = useState('');
  const [showMemberError, setShowMemberError] = useState(false);

  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSave = () => {
    if (editData) {
      onUpdateAccount(editData);
      setIsEditing(false);
    }
  };

  const addMember = () => {
    if (!newName.trim()) {
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      setShowMemberError(true);
      errorTimeoutRef.current = setTimeout(() => setShowMemberError(false), 3000);
      return;
    }
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    setShowMemberError(false);
    setEditData(prev => prev ? ({
      ...prev,
      people: [...prev.people, { id: crypto.randomUUID(), name: newName.trim(), role: 'sub' }]
    }) : null);
    setNewName('');
  };

  const removeMember = (id: string) => {
    setEditData(prev => prev ? ({
      ...prev,
      people: prev.people.map(p => p.id === id ? { 
        ...p, 
        status: 'left' as const,
        leaveYear: new Date().getFullYear()
      } : p)
    }) : null);
  };

  const restoreMember = (id: string) => {
    setEditData(prev => prev ? ({
      ...prev,
      people: prev.people.map(p => p.id === id ? { ...p, status: 'active' as const } : p)
    }) : null);
  };

  const toggleRole = (id: string) => {
    setEditData(prev => {
      if (!prev) return null;
      const target = prev.people.find(p => p.id === id);
      if (!target) return prev;

      // If switching to 'main', demote everyone else to 'sub'
      if (target.role === 'sub') {
        return {
          ...prev,
          people: prev.people.map(p => ({
            ...p,
            role: p.id === id ? 'main' : 'sub'
          }))
        };
      }
      // If already 'main', do nothing (always need 1 main)
      return prev;
    });
  };

  if (!activeAccount) return null;

  return (
    <div className="space-y-8 pb-12">
      <header className="flex items-center justify-between border-b border-slate-200 pb-6 mb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Account Settings</h2>
          <p className="text-sm text-slate-500">Configure billing preferences and members</p>
        </div>
        {!isEditing && (
          <button 
            onClick={() => {
              setEditData(JSON.parse(JSON.stringify(activeAccount)));
              setIsEditing(true);
            }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 active:scale-95 transition-all shadow-sm"
          >
            Edit Account
          </button>
        )}
      </header>

      {isEditing && editData ? (
        <div className="space-y-6 bg-slate-50 p-6 rounded-2xl border border-slate-100">
            {editData ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block font-mono">Account Label</label>
                    <input 
                      className="w-full rounded-lg border border-slate-200 p-3 text-sm focus:ring-4 focus:ring-indigo-100 outline-none"
                      value={editData.payeeName}
                      onChange={e => setEditData({ ...editData, payeeName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block font-mono">Account Number</label>
                    <input 
                      className="w-full rounded-lg border border-slate-200 p-3 text-sm focus:ring-4 focus:ring-indigo-100 outline-none"
                      value={editData.accountNumber || ''}
                      onChange={e => setEditData({ ...editData, accountNumber: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-200">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Manage Members</label>
                  
                  <div className="space-y-2">
                    {editData.people.map(p => {
                      const isLeft = p.status === 'left';
                      return (
                        <div key={p.id} className={cn(
                          "flex items-center justify-between p-3 rounded-xl border transition-all",
                          isLeft ? "bg-slate-50 border-slate-100 opacity-60" : "bg-white border-slate-100 shadow-sm"
                        )}>
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-full border flex items-center justify-center text-[10px] font-bold",
                              isLeft ? "bg-slate-100 text-slate-300 border-slate-200" : "bg-slate-50 text-slate-400 border-slate-100"
                            )}>
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                          <div className="flex flex-col">
                            <span className={cn("text-sm font-bold", isLeft ? "text-slate-400" : "text-slate-700")}>
                              {p.name}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isLeft ? (
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-black text-red-500 uppercase tracking-tighter bg-red-50 px-2 py-1 rounded border border-red-100">Left Account</span>
                              <button 
                                onClick={() => restoreMember(p.id)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold hover:bg-indigo-100 transition-all active:scale-95 border border-indigo-100"
                              >
                                <RotateCcw size={12} />
                                Restore
                              </button>
                            </div>
                          ) : (
                            <>
                              <button 
                                onClick={() => toggleRole(p.id)}
                                className={cn(
                                  "text-[9px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full transition-all border",
                                  p.role === 'main' 
                                    ? "bg-indigo-50 text-indigo-600 border-indigo-100 shadow-sm shadow-indigo-50/50" 
                                    : "bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100 hover:text-slate-600"
                                )}
                              >
                                {p.role} Holder
                              </button>
                              {p.role !== 'main' ? (
                                <button 
                                  onClick={() => removeMember(p.id)}
                                  className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                                  title="Remove from Account"
                                >
                                  <Trash2 size={16} />
                                </button>
                              ) : (
                                <div className="w-[28px]" />
                              )}
                            </>
                          )}
                        </div>
                        </div>
                      );
                    })}
                  </div>

                <div className={cn(
                  "flex gap-2 p-3 bg-white rounded-xl border transition-all duration-300",
                  showMemberError ? "border-red-400 shadow-lg shadow-red-50 ring-2 ring-red-100" : "border-slate-100 shadow-sm"
                )}>
                  <input 
                    placeholder={showMemberError ? "Please enter a name..." : "New Member Name"}
                    className={cn(
                      "flex-1 bg-transparent text-sm outline-none px-1 transition-colors",
                      showMemberError ? "placeholder:text-red-400 text-red-600 font-bold" : ""
                    )}
                    value={newName}
                    onChange={e => {
                      setNewName(e.target.value);
                      if (showMemberError) setShowMemberError(false);
                    }}
                    onKeyPress={e => e.key === 'Enter' && addMember()}
                  />
                  <button 
                    onClick={addMember}
                    className={cn(
                      "flex shrink-0 h-8 w-8 items-center justify-center rounded-lg transition-all active:scale-95 border",
                      showMemberError 
                        ? "bg-red-500 text-white border-red-500 shadow-sm shadow-red-200" 
                        : "text-indigo-600 hover:bg-indigo-50 border-indigo-50"
                    )}
                  >
                    <Plus size={showMemberError ? 16 : 20} className={cn(showMemberError ? "animate-pulse" : "")} />
                  </button>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-3">
                  <Info size={16} className="text-amber-600 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-amber-900 uppercase tracking-tight">About "Left Members"</p>
                    <p className="text-[10px] leading-relaxed text-amber-800">
                      Members marked as <span className="font-bold underline text-amber-900">Left Account</span> remain in the list until the next calendar year begins. This ensures their historical payment data and contribution records are preserved for the current year's reports.
                    </p>
                  </div>
                </div>
                </div>
              </>
            ) : null}

          <div className="flex gap-4 pt-4">
            <button 
              onClick={handleSave}
              className="flex-1 rounded-lg bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 shadow-sm"
            >
              Save Changes
            </button>
            <button 
              onClick={() => setIsEditing(false)}
              className="flex-1 rounded-lg bg-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Account Information</h3>
            <div className="space-y-4">
              <div className="flex justify-between py-2 border-b border-slate-50">
                <span className="text-slate-500 text-sm">Label</span>
                <span className="font-bold text-slate-700">{activeAccount.payeeName}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-50">
                <span className="text-slate-500 text-sm">Account Number</span>
                <span className="font-mono font-bold text-slate-700 text-sm">{activeAccount.accountNumber || 'None'}</span>
              </div>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account Members</h3>
              <div className="group relative">
                <button className="text-slate-400 hover:text-indigo-500 transition-colors p-1">
                  <HelpCircle size={14} />
                </button>
                <div className="absolute left-0 bottom-full mb-2 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none z-50">
                  <div className="bg-slate-800 text-white text-[10px] p-3 rounded-xl shadow-xl border border-slate-700 leading-relaxed font-medium">
                    <p>To add or remove members, click the <span className="text-indigo-300 font-bold">Edit Account</span> button at the top right of the screen.</p>
                    <div className="absolute top-full left-2 w-2 h-2 bg-slate-800 rotate-45 -translate-y-1"></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {activeAccount.people.map(p => {
                const isLeft = p.status === 'left';
                return (
                  <div key={p.id} className={cn(
                    "flex items-center justify-between p-3 rounded-xl border transition-all",
                    isLeft ? "bg-slate-50/50 border-slate-100 opacity-60" : "bg-slate-50 border-slate-100"
                  )}>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-full border flex items-center justify-center text-[10px] font-bold shadow-sm",
                        isLeft ? "bg-slate-100 text-slate-300 border-slate-200" : "bg-white text-slate-500 border-slate-200"
                      )}>
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <span className={cn("text-sm font-bold", isLeft ? "text-slate-400" : "text-slate-700")}>{p.name}</span>
                    </div>
                    {isLeft ? (
                      <span className="text-[9px] font-black text-red-500 uppercase tracking-tighter bg-red-50 px-2 py-1 rounded border border-red-100">Left Account</span>
                    ) : (
                              <span className={cn(
                                "text-[9px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border shadow-sm transition-all",
                                p.role === 'main' 
                                  ? "bg-indigo-50 text-indigo-600 border-indigo-100 shadow-indigo-50/50" 
                                  : "bg-slate-50 text-slate-400 border-slate-100"
                              )}>
                                {p.role} Holder
                              </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="pt-8 border-t border-slate-200 flex flex-col gap-4">
            <AccountDeleteButton 
              onDelete={() => onDeleteAccount(activeAccount.id)} 
              onExport={onExportData}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function NavItem({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-4 py-2 text-sm font-semibold transition-all",
        active ? "bg-indigo-50 text-indigo-600 shadow-sm ring-1 ring-indigo-100" : "text-slate-500 hover:bg-slate-50"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function MobileNavItem({ active, icon, onClick }: { active: boolean, icon: React.ReactNode, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-lg transition-all",
        active ? "bg-indigo-50 text-indigo-600" : "text-slate-400"
      )}
    >
      {icon}
    </button>
  );
}

function StatCard({ label, value, subLabel, icon, children }: { label: string, value: string, subLabel?: string, icon: React.ReactNode, children?: React.ReactNode }) {
  return (
    <div className="group relative flex flex-col items-start rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex w-full items-center justify-between mb-3">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
        <div className="rounded-md bg-slate-50 p-1.5 border border-slate-100">
          {icon}
        </div>
      </div>
      <span className="text-3xl font-extrabold tracking-tight text-slate-800">{value}</span>
      {subLabel && <span className="mt-2 text-xs text-slate-500 font-medium">{subLabel}</span>}
      {children}
    </div>
  );
}

interface BillCardProps {
  key?: string;
  bill: BillEntry;
  people: Person[];
  onTogglePaid: (bid: string, pid: string) => void;
  onEditPaymentDate?: (bid: string, pid: string, current: string) => void;
  onDelete?: (id: string) => void;
  interactive?: boolean;
  readOnly?: boolean;
  dateClickMode?: boolean;
}

function AccountDeleteButton({ onDelete, onExport }: { onDelete: () => void, onExport?: () => void }) {
  const [step, setStep] = useState(0); // 0: Normal, 1: Confirming, 2: Suggest Backup

  return (
    <div className="relative">
      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div 
            key="step1"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center gap-4 p-6 bg-red-50 rounded-2xl border border-red-100 shadow-xl"
          >
            <div className="text-center">
              <h4 className="text-sm font-black text-red-600 mb-1">Delete Account?</h4>
              <p className="text-[10px] text-red-500 font-medium">This will remove this specific account and all its bills forever.</p>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setStep(2)}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-red-200"
              >
                Yes, Delete
              </button>
              <button 
                onClick={() => setStep(0)}
                className="rounded-xl bg-white border border-red-200 px-4 py-2 text-xs font-bold text-slate-500"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        ) : step === 2 ? (
          <motion.div 
            key="step2"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center gap-4 p-6 bg-indigo-50 rounded-2xl border border-indigo-100 shadow-xl"
          >
            <div className="text-center">
              <h4 className="text-sm font-black text-indigo-700 mb-1">Want to Backup First?</h4>
              <p className="text-[10px] text-indigo-500 font-medium leading-relaxed">It's highly recommended to backup all your data before removing an account.</p>
            </div>
            <div className="flex flex-col w-full gap-2">
              <button 
                onClick={() => {
                  if (onExport) onExport();
                }}
                className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-bold text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200"
              >
                <Download size={14} />
                Save Backup
              </button>
              <button 
                onClick={onDelete}
                className="rounded-xl bg-white border border-red-100 px-4 py-3 text-[10px] font-bold text-red-500 hover:bg-red-50"
              >
                No Backup, Delete Only
              </button>
              <button 
                onClick={() => setStep(0)}
                className="py-1 text-[10px] font-bold text-slate-400 hover:text-slate-600"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.button 
            key="step0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setStep(1)}
            className="rounded-lg bg-red-50 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-100 transition-colors w-full"
          >
            Delete This Account
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function FactoryResetButton({ onReset, onExport }: { onReset: () => void, onExport?: () => void }) {
  const [step, setStep] = useState(0); // 0: Ready, 1: Confirming, 2: Suggest Backup

  return (
    <div className="relative">
      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div 
            key="step1"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center gap-4 p-6 bg-red-50 rounded-2xl border border-red-100 shadow-xl"
          >
            <div className="text-center">
              <h4 className="text-sm font-black text-red-600 mb-1">Erase Everything?</h4>
              <p className="text-[10px] text-red-500 font-medium">This will delete all accounts, bills, and history forever.</p>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setStep(2)}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 shadow-lg shadow-red-200 active:scale-95 transition-all"
              >
                Yes, Erase Data
              </button>
              <button 
                onClick={() => setStep(0)}
                className="rounded-xl bg-white border border-red-200 px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        ) : step === 2 ? (
          <motion.div 
            key="step2"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center gap-4 p-6 bg-indigo-50 rounded-2xl border border-indigo-100 shadow-xl"
          >
            <div className="text-center">
              <h4 className="text-sm font-black text-indigo-700 mb-1">Wait! Want a Backup?</h4>
              <p className="text-[10px] text-indigo-500 font-medium leading-relaxed">There is no way to recover your data after this.<br/>Would you like to save a backup file first?</p>
            </div>
            <div className="flex flex-col w-full gap-2 font-mono">
              <button 
                onClick={() => {
                  if (onExport) onExport();
                }}
                className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-bold text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 active:scale-95 transition-all w-full"
              >
                <Download size={14} />
                Save Backup Now
              </button>
              <button 
                onClick={onReset}
                className="rounded-xl bg-white border border-red-100 px-4 py-3 text-[10px] font-bold text-red-500 hover:bg-red-50 w-full"
              >
                No Save, Just Reset
              </button>
              <button 
                onClick={() => setStep(0)}
                className="py-1 text-[10px] font-bold text-slate-400 hover:text-slate-600"
              >
                Actually, go back
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.button 
            key="step0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setStep(1)}
            className="rounded-xl border border-red-200 px-6 py-2.5 text-xs font-bold text-red-500 hover:bg-red-50 transition-all flex items-center gap-2"
          >
            <Trash2 size={14} />
            <span>App Factory Reset</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function BillCard({ bill, people, onTogglePaid, onEditPaymentDate, onDelete, interactive = true, readOnly = false, dateClickMode = false }: BillCardProps) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const isFullyPaid = useMemo(() => {
    // Only check people who actually have a balance to pay
    const peopleToPay = Object.entries(bill.splitDetails).filter(([_, amount]) => amount > 0);
    if (peopleToPay.length === 0) return true;
    return peopleToPay.every(([id]) => bill.isPaid[id]);
  }, [bill.isPaid, bill.splitDetails]);

  const isActuallySettled = bill.settled || isFullyPaid;

  return (
    <div className={cn(
      "group flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all",
      interactive && "hover:border-slate-300 hover:shadow-md"
    )}>
      <div className="flex items-center justify-between border-b border-slate-50 pb-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold text-slate-800">{format(parseISO(bill.date), 'MMMM yyyy')}</span>
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-widest flex items-center gap-1",
              bill.dueDate && isBefore(parseISO(bill.dueDate), startOfDay(new Date())) && !isActuallySettled 
                ? "text-red-600" 
                : "text-slate-400"
            )}>
              <Calendar size={10} className={bill.dueDate && isBefore(parseISO(bill.dueDate), startOfDay(new Date())) && !isActuallySettled ? "text-red-500" : "text-indigo-400"} />
              Due: {format(parseISO(bill.dueDate || bill.date), 'MMM do')}
              {bill.dueDate && isBefore(parseISO(bill.dueDate), startOfDay(new Date())) && !isActuallySettled && (
                <span className="ml-1 bg-red-600 text-white px-2 py-0.5 rounded uppercase tracking-tighter text-[8px] font-black leading-none">Overdue Bill</span>
              )}
            </span>
          </div>
          {isActuallySettled && (
            <div className={cn(
              "flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full w-fit",
              bill.dueDate && bill.settledAt && isBefore(parseISO(bill.dueDate), parseISO(bill.settledAt))
                ? "text-red-600 bg-red-50 border border-red-100"
                : "text-emerald-600 bg-emerald-50 border border-emerald-100"
            )}>
              {bill.dueDate && bill.settledAt && isBefore(parseISO(bill.dueDate), parseISO(bill.settledAt)) ? <AlertCircle size={10} /> : <Check size={10} strokeWidth={3} />}
              <span>Paid On: {bill.settledAt ? format(parseISO(bill.settledAt), 'MMM do') : 'Settled'}{bill.dueDate && bill.settledAt && isBefore(parseISO(bill.dueDate), parseISO(bill.settledAt)) && " (Late)"}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-lg font-extrabold text-slate-800">{formatCurrency(bill.totalAmount)}</span>
            <span className={cn("text-[10px] font-bold uppercase tracking-wider", isActuallySettled ? "text-emerald-600" : "text-amber-500")}>
              {isActuallySettled ? '● Settled' : '● Pending'}
            </span>
          </div>
          {interactive && onDelete && (
            <div className="relative">
              <AnimatePresence mode="wait">
                {isConfirmingDelete ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center gap-1"
                  >
                    <button 
                      onClick={() => onDelete(bill.id)}
                      className="rounded-lg px-2 py-1 text-[10px] font-bold bg-red-600 text-white shadow-sm hover:bg-red-700 active:scale-95 transition-all"
                    >
                      Delete?
                    </button>
                    <button 
                      onClick={() => setIsConfirmingDelete(false)}
                      className="rounded-lg px-2 py-1 text-[10px] font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                    >
                      No
                    </button>
                  </motion.div>
                ) : (
                  <motion.button 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsConfirmingDelete(true)}
                    className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                    title="Delete bill"
                  >
                    <Trash2 size={16} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(bill.peopleSnapshot || people).filter(p => bill.splitDetails[p.id] !== undefined).map(p => {
          const isSinglePaid = bill.isPaid[p.id];
          const showPaid = isSinglePaid;
          
          return (
            <div
              key={p.id}
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2 transition-all relative group/item",
                showPaid 
                  ? "border-emerald-100 bg-emerald-50/50 text-emerald-700 font-medium" 
                  : (bill.dueDate && isBefore(parseISO(bill.dueDate), startOfDay(new Date()))
                      ? "border-red-100 bg-red-50/50 text-red-700"
                      : "border-slate-100 bg-slate-50/30 text-slate-600"),
                (interactive && !readOnly) && Object.keys(bill.splitDetails).includes(p.id) && "hover:border-indigo-200 hover:bg-slate-50 cursor-pointer"
              )}
              onClick={() => {
                if (!readOnly && interactive) {
                  if (dateClickMode && onEditPaymentDate && bill.isPaid[p.id]) {
                    onEditPaymentDate(bill.id, p.id, bill.paidAt[p.id]);
                  } else {
                    onTogglePaid(bill.id, p.id);
                  }
                }
              }}
            >
                  <div className="flex flex-col items-start text-left">
                    <span className="text-[10px] font-bold uppercase tracking-tighter opacity-60 leading-none mb-1">{p.name}</span>
                    <span className="text-xs font-bold">{formatCurrency(bill.splitDetails[p.id])}</span>
                  </div>
              <div className="flex flex-col items-end gap-1">
                {showPaid ? <CheckCircle2 size={14} className="text-emerald-500" /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-300" />}
                {showPaid && bill.paidAt?.[p.id] && (
                  <div className="flex items-center gap-0.5">
                    <span className="text-[8px] font-bold opacity-60">
                      {format(parseISO(bill.paidAt[p.id]), 'MMM d')}
                    </span>
                    {!readOnly && interactive && onEditPaymentDate && !dateClickMode && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditPaymentDate(bill.id, p.id, format(parseISO(bill.paidAt![p.id]), 'yyyy-MM-dd'));
                        }}
                        className="opacity-0 group-hover/item:opacity-100 text-slate-400 hover:text-indigo-600 p-0.5 transition-all"
                        title="Change payment date"
                      >
                        <Edit3 size={8} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

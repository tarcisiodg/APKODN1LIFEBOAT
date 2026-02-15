import React, { useState, useEffect, useMemo } from 'react';
import { User, LifeboatStatus, LifeboatType, ActiveSession, Berth } from '../types';
import { cloudService } from '../services/cloudService';

interface DashboardProps {
  onStartTraining: () => void;
  onResumeTraining: () => void;
  onViewLifeboat: (lb: LifeboatType) => void;
  onOpenUserManagement: () => void;
  onOpenBerthManagement: () => void;
  user: User | null;
  fleetStatus: Record<LifeboatType, LifeboatStatus>;
  historyCount: number;
  activeSession: ActiveSession | null;
}

const LIFEBOATS: LifeboatType[] = [
  'Lifeboat 1', 'Lifeboat 2', 'Lifeboat 3', 
  'Lifeboat 4', 'Lifeboat 5', 'Lifeboat 6'
];

const MANUAL_CATEGORIES = [
  'PONTE', 'BRIGADA 1', 'BRIGADA 2', 'PLATAFORMA', 'SALA TOOLPUSHER', 
  'MÁQUINA', 'ENFERMARIA', 'COZINHA', 'IMEDIATO', 'ON DUTY', 'LIBERADOS', 'OUTROS'
];

const Dashboard: React.FC<DashboardProps> = ({ 
  onStartTraining, 
  onResumeTraining,
  onViewLifeboat,
  onOpenUserManagement,
  onOpenBerthManagement,
  user, 
  fleetStatus, 
  activeSession
}) => {
  const [pendingCount, setPendingCount] = useState(0);
  const [berthStats, setBerthStats] = useState({ total: 0, occupied: 0 });
  const [manualCounts, setManualCounts] = useState<Record<string, number>>(
    Object.fromEntries(MANUAL_CATEGORIES.map(cat => [cat, 0]))
  );
  
  const [allBerths, setAllBerths] = useState<Berth[]>([]);
  const [releasedIds, setReleasedIds] = useState<string[]>([]);
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let unsubscribeCounters: () => void;
    let unsubscribeReleased: () => void;

    if (user?.isAdmin) {
      const fetchData = async () => {
        try {
          const allUsers = await cloudService.getAllUsers();
          setPendingCount(allUsers.filter(u => u.status === 'pending').length);
          const berths = await cloudService.getBerths();
          setAllBerths(berths);
          setBerthStats({
            total: berths.length,
            occupied: berths.filter(b => b.crewName && b.crewName.trim() !== '').length
          });
        } catch (e) { console.error(e); }
      };
      
      fetchData();
      const interval = setInterval(fetchData, 30000);
      
      unsubscribeCounters = cloudService.subscribeToManualCounters((counters) => {
        setManualCounts(prev => ({ ...prev, ...counters }));
      });

      unsubscribeReleased = cloudService.subscribeToReleasedCrew((ids) => {
        setReleasedIds(ids);
      });

      return () => {
        clearInterval(interval);
        if (unsubscribeCounters) unsubscribeCounters();
        if (unsubscribeReleased) unsubscribeReleased();
      };
    }
  }, [user]);

  const updateManualCount = async (category: string, delta: number) => {
    if (category === 'LIBERADOS') {
      if (delta > 0) setIsReleaseModalOpen(true);
      else if (releasedIds.length > 0) setIsReturnModalOpen(true);
      return;
    }

    setManualCounts(prev => {
      const newValue = Math.max(0, (prev[category] || 0) + delta);
      const updated = { ...prev, [category]: newValue };
      cloudService.updateManualCounters(updated).catch(console.error);
      return updated;
    });
  };

  const handleToggleRelease = async (berthId: string) => {
    let newReleased = [...releasedIds];
    if (newReleased.includes(berthId)) {
      newReleased = newReleased.filter(id => id !== berthId);
    } else {
      newReleased.push(berthId);
    }
    
    setReleasedIds(newReleased);
    await cloudService.updateReleasedCrew(newReleased);
    
    const updatedManual = { ...manualCounts, 'LIBERADOS': newReleased.length };
    setManualCounts(updatedManual);
    await cloudService.updateManualCounters(updatedManual);
  };

  const setManualCountAbsolute = async (category: string, value: string) => {
    if (category === 'LIBERADOS') return;

    const numValue = value === '' ? 0 : parseInt(value, 10);
    const validValue = isNaN(numValue) ? 0 : Math.max(0, numValue);
    
    setManualCounts(prev => {
      const updated = { ...prev, [category]: validValue };
      cloudService.updateManualCounters(updated).catch(console.error);
      return updated;
    });
  };

  const totalPeopleInFleet = useMemo(() => {
    return (Object.values(fleetStatus) as LifeboatStatus[]).reduce((sum: number, status: LifeboatStatus) => {
      return sum + (status?.isActive ? (status.count || 0) : 0);
    }, 0);
  }, [fleetStatus]);

  const totalManualGroups = useMemo(() => {
    return (Object.values(manualCounts) as number[]).reduce((sum: number, val: number) => sum + (val || 0), 0);
  }, [manualCounts]);

  const overallMusterTotal = useMemo(() => totalPeopleInFleet + totalManualGroups, [totalPeopleInFleet, totalManualGroups]);

  const availableToRelease = useMemo(() => {
    return allBerths.filter(b => b.crewName && !releasedIds.includes(b.id));
  }, [allBerths, releasedIds]);

  const releasedCrew = useMemo(() => {
    return allBerths.filter(b => releasedIds.includes(b.id));
  }, [allBerths, releasedIds]);

  // Lógica de Status do Muster (Pendentes vs Excedidos)
  const musterStatus = useMemo(() => {
    const diff = berthStats.occupied - overallMusterTotal;
    
    if (diff === 0) {
      return { 
        label: 'MUSTER OK', 
        color: 'bg-emerald-100 text-emerald-700' 
      };
    } else if (diff > 0) {
      return { 
        label: `${diff} ${diff === 1 ? 'PENDENTE' : 'PENDENTES'}`, 
        color: 'bg-rose-100 text-rose-700' 
      };
    } else {
      const absDiff = Math.abs(diff);
      return { 
        label: `${absDiff} ${absDiff === 1 ? 'EXCEDIDO' : 'EXCEDIDOS'}`, 
        color: 'bg-amber-100 text-amber-700' 
      };
    }
  }, [overallMusterTotal, berthStats.occupied]);

  if (!user) return null;

  return (
    <div className="flex-1 flex flex-col p-6 max-w-6xl mx-auto w-full pb-32">
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h2 className="text-4xl md:text-5xl text-slate-900 tracking-tight leading-tight mb-3 font-normal">Olá, {user.name.split(' ')[0]}</h2>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-xl text-[11px] uppercase tracking-widest bg-blue-100 text-blue-700 border border-blue-200 font-bold">{user.role || 'SISTEMA'}</span>
            {user.isAdmin && <span className="px-3 py-1 rounded-xl text-[11px] uppercase tracking-widest bg-slate-900 text-white font-bold">ADM</span>}
          </div>
        </div>

        {user.isAdmin && (
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <button onClick={onOpenBerthManagement} className="flex-1 min-w-[140px] flex items-center justify-center gap-3 px-5 py-3 bg-slate-800 text-white rounded-2xl shadow-md transition-all active:scale-95 group">
              <i className="fa-solid fa-bed"></i>
              <span className="text-[10px] uppercase tracking-widest font-bold">POB/Leitos</span>
            </button>
            <button onClick={onOpenUserManagement} className="flex-1 min-w-[140px] flex items-center justify-center gap-3 px-5 py-3 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all active:scale-95 group">
              <i className="fa-solid fa-users-gear text-slate-600 group-hover:text-blue-600 transition-colors"></i>
              <span className="text-[10px] text-slate-800 uppercase tracking-widest font-bold">Gestão</span>
              {pendingCount > 0 && <span className="flex items-center justify-center min-w-[20px] h-[20px] px-1 bg-red-500 text-white rounded-full text-[9px] font-bold animate-bounce">{pendingCount}</span>}
            </button>
          </div>
        )}
      </div>

      {user.isAdmin ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
            <div className="bg-blue-600 p-6 rounded-[32px] shadow-md text-white relative overflow-hidden">
                <div className="relative z-10 flex flex-col justify-between h-full">
                  <div>
                    <h4 className="text-[9px] font-black uppercase tracking-[0.25em] text-white/70 mb-1.5">MUSTER TOTAL (CONTABILIZADO)</h4>
                    <div className="flex items-baseline gap-2.5">
                      <span className="text-6xl font-black tabular-nums tracking-tighter">{overallMusterTotal}</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Pessoas</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-white/20 flex gap-x-8">
                    <div>
                      <span className="text-[8px] font-black uppercase tracking-widest opacity-50 block mb-1">Baleeras</span>
                      <span className="text-lg font-black">{totalPeopleInFleet}</span>
                    </div>
                    <div>
                      <span className="text-[8px] font-black uppercase tracking-widest opacity-50 block mb-1">Manual</span>
                      <span className="text-lg font-black">{totalManualGroups}</span>
                    </div>
                  </div>
                </div>
                <i className="fa-solid fa-clipboard-check absolute right-[-20px] bottom-[-20px] text-[150px] text-white/5 -rotate-12"></i>
            </div>

            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden">
                <div className="relative z-10">
                  <h4 className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400 mb-1.5">PESSOAS A BORDO (POB OFICIAL)</h4>
                  <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black text-slate-900 tabular-nums tracking-tighter">{berthStats.occupied}</span>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tripulantes</span>
                    </div>
                    <div className="text-right">
                        <span className="text-xl font-black text-slate-400 tabular-nums">{berthStats.total}</span>
                        <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Leitos</p>
                    </div>
                  </div>
                </div>
                <div className="relative z-10 mt-4">
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-slate-900 transition-all duration-1000" style={{ width: `${berthStats.total > 0 ? (berthStats.occupied / berthStats.total) * 100 : 0}%` }}></div>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{berthStats.total > 0 ? Math.round((berthStats.occupied / berthStats.total) * 100) : 0}% CAPACIDADE</span>
                    <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${musterStatus.color}`}>
                      {musterStatus.label}
                    </span>
                  </div>
                </div>
            </div>
          </div>

          <div className="mb-10">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              <i className="fa-solid fa-sliders text-blue-600"></i> Controle de Grupos
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {MANUAL_CATEGORIES.map(category => (
                <div key={category} className={`bg-white p-4 rounded-[28px] border transition-all ${category === 'LIBERADOS' ? 'border-amber-200 bg-amber-50/30 shadow-sm' : 'border-slate-100 shadow-sm'}`}>
                  <p className="text-[9px] font-black text-slate-400 uppercase text-center mb-3 truncate">{category}</p>
                  <div className="flex items-center justify-between gap-1">
                    <button onClick={() => updateManualCount(category, -1)} className="w-7 h-7 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-600 active:scale-95">
                      <i className="fa-solid fa-minus text-[8px]"></i>
                    </button>
                    <input 
                      type="number" 
                      value={manualCounts[category] === 0 ? '' : (manualCounts[category] || '')} 
                      onChange={(e) => setManualCountAbsolute(category, e.target.value)}
                      readOnly={category === 'LIBERADOS'}
                      className="w-10 text-center font-black text-lg bg-transparent border-none outline-none focus:ring-0"
                    />
                    <button onClick={() => updateManualCount(category, 1)} className="w-7 h-7 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 active:scale-95">
                      <i className="fa-solid fa-plus text-[8px]"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {LIFEBOATS.map(lb => {
              const status = fleetStatus[lb];
              const isActive = status?.isActive;
              return (
                <div key={lb} onClick={() => isActive && onViewLifeboat(lb)} className={`p-4 rounded-2xl border transition-all ${isActive ? 'bg-blue-50 border-blue-100 cursor-pointer shadow-sm' : 'bg-white border-slate-100 opacity-60 shadow-sm'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                      <i className={`fa-solid fa-ship ${isActive ? 'text-blue-600 animate-pulse' : 'text-slate-300'}`}></i>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-black text-slate-900 tabular-nums">{status?.count || 0}</span>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Pessoas</p>
                    </div>
                  </div>
                  <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-tight">{lb}</h4>
                  <div className={`text-[8px] font-black uppercase mt-1 ${isActive ? 'text-emerald-500' : 'text-slate-300'}`}>
                    {isActive ? `Líder: ${status.leaderName || '-'}` : 'STANDBY'}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center py-10">
            <button onClick={activeSession ? onResumeTraining : onStartTraining} className="w-64 h-64 bg-blue-600 rounded-full shadow-md shadow-blue-600/20 text-white flex flex-col items-center justify-center gap-4 hover:scale-105 active:scale-95 transition-all">
                <i className={`fa-solid ${activeSession ? 'fa-tower-broadcast animate-pulse' : 'fa-play'} text-4xl`}></i>
                <div className="text-center">
                    <div className="font-bold text-lg uppercase">{activeSession ? 'Retomar Sessão' : 'Novo Embarque'}</div>
                    <div className="text-[10px] opacity-60 uppercase font-bold">{activeSession ? activeSession.lifeboat : 'Acesse para iniciar'}</div>
                </div>
            </button>
        </div>
      )}

      {/* Modais de LIBERADOS */}
      {isReleaseModalOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[32px] max-w-lg w-full p-8 shadow-md animate-in zoom-in duration-300 flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-black text-slate-900 uppercase">Liberar Tripulante</h3>
              <button onClick={() => { setIsReleaseModalOpen(false); setSearchTerm(''); }} className="w-10 h-10 bg-slate-50 rounded-full text-slate-400 active:scale-95"><i className="fa-solid fa-xmark"></i></button>
            </div>
            <input type="text" placeholder="BUSCAR POR NOME..." className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold uppercase mb-4 focus:ring-1 focus:ring-blue-100 outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
              {availableToRelease.filter(b => b.crewName?.toUpperCase().includes(searchTerm.toUpperCase())).map(b => (
                <button key={b.id} onClick={() => handleToggleRelease(b.id)} className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-amber-50 rounded-2xl transition-all group shadow-sm">
                  <div className="text-left">
                    <p className="text-xs font-black text-slate-800 uppercase leading-none mb-1">{b.crewName}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">{b.id} • {b.role}</p>
                  </div>
                  <i className="fa-solid fa-plus text-amber-500 opacity-0 group-hover:opacity-100"></i>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {isReturnModalOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[32px] max-w-lg w-full p-8 shadow-md animate-in zoom-in duration-300 flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-black text-slate-900 uppercase">Tripulantes Liberados</h3>
              <button onClick={() => setIsReturnModalOpen(false)} className="w-10 h-10 bg-slate-50 rounded-full text-slate-400 active:scale-95"><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
              {releasedCrew.map(b => (
                <button key={b.id} onClick={() => handleToggleRelease(b.id)} className="w-full flex items-center justify-between p-4 bg-amber-50 rounded-2xl hover:bg-rose-50 transition-all group shadow-sm">
                  <div className="text-left">
                    <p className="text-xs font-black text-amber-800 group-hover:text-rose-800 uppercase leading-none mb-1">{b.crewName}</p>
                    <p className="text-[9px] font-bold text-amber-600 uppercase">STATUS: LIBERADO</p>
                  </div>
                  <i className="fa-solid fa-rotate-left text-rose-500 opacity-0 group-hover:opacity-100"></i>
                </button>
              ))}
              {releasedCrew.length === 0 && <p className="py-20 text-[10px] font-black text-slate-300 uppercase">Nenhum tripulante liberado</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
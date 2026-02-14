
import React, { useState, useEffect, useMemo } from 'react';
import { User, LifeboatStatus, LifeboatType, ActiveSession, AppState, TrainingRecord } from '../types';
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

  useEffect(() => {
    let unsubscribeCounters: () => void;

    if (user?.isAdmin) {
      const fetchData = async () => {
        try {
          const allUsers = await cloudService.getAllUsers();
          setPendingCount(allUsers.filter(u => u.status === 'pending').length);
          const berths = await cloudService.getBerths();
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

      return () => {
        clearInterval(interval);
        if (unsubscribeCounters) unsubscribeCounters();
      };
    }
  }, [user]);

  const updateManualCount = async (category: string, delta: number) => {
    setManualCounts(prev => {
      const newValue = Math.max(0, (prev[category] || 0) + delta);
      const updated = { ...prev, [category]: newValue };
      cloudService.updateManualCounters(updated).catch(console.error);
      return updated;
    });
  };

  const setManualCountAbsolute = async (category: string, value: string) => {
    // Se o valor for vazio, tratamos como 0 internamente mas salvamos o estado
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

  // FIX: Define overallMusterTotal to resolve "Cannot find name" errors.
  const overallMusterTotal = useMemo(() => totalPeopleInFleet + totalManualGroups, [totalPeopleInFleet, totalManualGroups]);

  if (!user) return null;

  return (
    <div className="flex-1 flex flex-col p-6 max-w-6xl mx-auto w-full pb-32">
      {/* HEADER DO DASHBOARD */}
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
            <button onClick={onOpenBerthManagement} className="flex-1 min-w-[140px] flex items-center justify-center gap-3 px-5 py-3 bg-slate-800 text-white rounded-2xl shadow-lg transition-all active:scale-95 group"><i className="fa-solid fa-bed"></i><span className="text-[10px] uppercase tracking-widest font-bold">POB/Leitos</span></button>
            <button onClick={onOpenUserManagement} className="flex-1 min-w-[140px] flex items-center justify-center gap-3 px-5 py-3 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all active:scale-95 group"><i className="fa-solid fa-users-gear text-slate-600 group-hover:text-blue-600 transition-colors"></i><span className="text-[10px] text-slate-800 uppercase tracking-widest font-bold">Gestão</span>{pendingCount > 0 && <span className="flex items-center justify-center min-w-[20px] h-[20px] px-1 bg-red-500 text-white rounded-full text-[9px] font-bold animate-bounce">{pendingCount}</span>}</button>
          </div>
        )}
      </div>

      {user.isAdmin && (
        <>
          {/* CARDS DE RESUMO DO DASHBOARD */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10 animate-in fade-in slide-in-from-top-4 duration-700">
            {/* Card 1: TOTAL GERAL CONTABILIZADO */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-800 p-4 rounded-[32px] shadow-2xl shadow-blue-600/30 text-white overflow-hidden relative min-h-[145px]">
                <div className="relative z-10 flex flex-col justify-between h-full">
                  <div>
                    <h4 className="text-[9px] font-black uppercase tracking-[0.25em] text-white mb-1.5">TOTAL GERAL CONTABILIZADO (MUSTER)</h4>
                    <div className="flex items-baseline gap-2.5">
                      <span className="text-6xl font-black tabular-nums tracking-tighter animate-pulse-slow">{overallMusterTotal}</span>
                      <span className="text-[10px] font-bold text-white uppercase tracking-widest">Pessoas</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-white/30 flex flex-wrap items-center gap-x-10 gap-y-4">
                    <div className="flex flex-col">
                      <span className="text-[8px] font-black uppercase text-white tracking-[0.2em] mb-1.5">Nas Baleeiras</span>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center shadow-inner">
                          <i className="fa-solid fa-ship text-sm text-white"></i>
                        </div>
                        <span className="text-xl font-black tabular-nums leading-none">{totalPeopleInFleet}</span>
                      </div>
                    </div>
                    <div className="w-px h-8 bg-white/20 hidden lg:block"></div>
                    <div className="flex flex-col">
                      <span className="text-[8px] font-black uppercase text-white tracking-[0.2em] mb-1.5">Grupos Manuais</span>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center shadow-inner">
                          <i className="fa-solid fa-sliders text-sm text-white"></i>
                        </div>
                        <span className="text-xl font-black tabular-nums leading-none">{totalManualGroups}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <i className="fa-solid fa-clipboard-check absolute right-[-15px] bottom-[-15px] text-[120px] text-white/5 -rotate-12"></i>
                <div className="absolute top-3 right-6 flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-lg border border-white/20">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.5)]"></div>
                  <span className="text-[7px] font-black uppercase tracking-widest text-white">Live Sync</span>
                </div>
            </div>

            {/* Card 2: POB Geral da Unidade */}
            <div className="bg-white p-4 rounded-[32px] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden relative min-h-[145px] flex flex-col justify-between">
                <div className="relative z-10">
                  <h4 className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-800 mb-1.5">PESSOAS A BORDO (POB OFICIAL)</h4>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-5xl font-black text-slate-900 tabular-nums tracking-tighter">{berthStats.occupied}</span>
                        <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest">Tripulantes</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-baseline gap-1.5 justify-end">
                        <span className="text-xl font-black text-slate-800 tabular-nums tracking-tighter">{berthStats.total}</span>
                      </div>
                      <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Leitos Totais</span>
                    </div>
                  </div>
                </div>
                <div className="relative z-10 mt-4">
                  <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200">
                    <div className="h-full bg-slate-900 transition-all duration-1000 ease-out shadow-lg" style={{ width: `${berthStats.total > 0 ? (berthStats.occupied / berthStats.total) * 100 : 0}%` }}></div>
                  </div>
                  <div className="flex justify-between items-center mt-2.5 px-0.5">
                    <span className="text-[11px] font-black text-slate-900 uppercase tracking-[0.15em]">{berthStats.total > 0 ? Math.round((berthStats.occupied / berthStats.total) * 100) : 0}% CAPACIDADE</span>
                    <span className={`text-[11px] font-black uppercase tracking-[0.1em] px-3 py-1 rounded-xl border-2 shadow-sm transition-all ${overallMusterTotal === berthStats.occupied ? 'bg-emerald-50 text-emerald-800 border-emerald-400' : 'bg-rose-50 text-rose-800 border-rose-400'}`}>
                      {overallMusterTotal === berthStats.occupied ? 'MUSTER OK' : overallMusterTotal > berthStats.occupied ? `${overallMusterTotal - berthStats.occupied} EXCEDENTE` : `${berthStats.occupied - overallMusterTotal} PENDENTES`}
                    </span>
                  </div>
                </div>
                <i className="fa-solid fa-bed absolute right-[-5px] top-[-5px] text-6xl text-slate-50/50"></i>
            </div>
          </div>

          {/* CONTADORES MANUAIS */}
          <div className="mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
            <div className="flex items-center justify-between px-1 mb-4">
              <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-[0.25em] flex items-center gap-3"><i className="fa-solid fa-sliders text-blue-600"></i>Controle de Grupos Operacionais</h3>
              <div className="bg-slate-200 px-4 py-1.5 rounded-full border border-slate-300">
                <span className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Total Manual: {totalManualGroups}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {MANUAL_CATEGORIES.map(category => (
                <div key={category} className="bg-white p-4 rounded-[32px] border border-slate-200 shadow-sm hover:shadow-md transition-all group active:scale-[0.98]">
                  <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.1em] mb-3 text-center truncate">{category}</p>
                  <div className="flex items-center justify-between gap-1.5 px-1">
                    <button onClick={() => updateManualCount(category, -1)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-rose-100 hover:text-rose-700 transition-all active:scale-75 shadow-sm flex-shrink-0"><i className="fa-solid fa-minus text-[10px]"></i></button>
                    
                    <input 
                      type="number" 
                      inputMode="numeric"
                      pattern="[0-9]*"
                      // Mostra vazio se o valor for 0
                      value={manualCounts[category] === 0 ? '' : manualCounts[category]} 
                      onChange={(e) => setManualCountAbsolute(category, e.target.value)}
                      placeholder="0"
                      className="w-full text-center text-2xl font-black text-slate-900 bg-transparent border-none outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none tabular-nums placeholder-slate-200"
                    />

                    <button onClick={() => updateManualCount(category, 1)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-blue-100 hover:text-blue-700 transition-all active:scale-75 shadow-sm flex-shrink-0"><i className="fa-solid fa-plus text-[10px]"></i></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* MONITORAMENTO DAS BALEERAS */}
      {user.isAdmin && (
        <div className="grid gap-2.5 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-400">
          <div className="flex items-center justify-between px-1 mb-4">
            <h3 className="text-[11px] font-black text-slate-700 uppercase tracking-[0.25em] flex items-center gap-3"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse"></span>Monitoramento em Tempo Real</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 min-h-[100px]">
            {LIFEBOATS.map(lb => {
              const status = fleetStatus[lb];
              const isActive = status?.isActive;
              return (
                <div key={lb} onClick={() => isActive ? onViewLifeboat(lb) : null} className={`p-4 rounded-2xl border transition-all duration-300 ${isActive ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-300 cursor-pointer hover:shadow-lg shadow-blue-600/5' : 'bg-white border-slate-200 grayscale-[0.3] hover:grayscale-0'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${isActive ? 'bg-blue-600 text-white shadow-blue-600/20' : 'bg-slate-100 text-slate-500'}`}><i className={`fa-solid fa-ship text-[11px] ${isActive ? 'animate-pulse' : ''}`}></i></div>
                      <div className="flex flex-col min-w-0">
                        <span className={`text-[12px] uppercase tracking-tight font-black truncate ${isActive ? 'text-blue-800' : 'text-slate-700'}`}>{lb}</span>
                        <span className={`text-[9px] font-bold uppercase tracking-widest truncate ${isActive ? 'text-blue-500' : 'text-slate-500'}`}>
                          {isActive ? `Líder: ${status.leaderName || 'Não Definido'}` : 'Unidade em Espera'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <div className="flex items-baseline justify-end gap-1">
                        <span className={`text-base font-mono font-bold ${isActive ? 'text-blue-600' : 'text-slate-900'}`}>{isActive ? (status?.count || 0) : 0}</span>
                      </div>
                      <span className="text-[8px] uppercase opacity-80 font-black tracking-widest text-slate-700">Pessoas</span>
                    </div>
                  </div>
                  {isActive && <div className="mt-3 pt-3 border-t border-blue-200 flex items-center justify-between"><div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span><span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">Sessão Ativa</span></div><i className="fa-solid fa-chevron-right text-[9px] text-blue-500"></i></div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BOTÃO PARA OPERADORES (NON-ADMIN) */}
      {!user.isAdmin && (
        <div className="mb-8">
          <button onClick={activeSession ? onResumeTraining : onStartTraining} className={`w-full h-32 relative overflow-hidden p-6 rounded-[32px] text-left transition-all active:scale-[0.98] shadow-xl ${activeSession ? 'bg-blue-600 shadow-blue-600/30 border-2 border-blue-400/30 animate-pulse-slow' : 'bg-slate-900 shadow-slate-900/20'}`}>
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="flex justify-between items-start w-full">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${activeSession ? 'bg-white text-blue-600' : 'bg-white/20 text-white'}`}><i className={`fa-solid ${activeSession ? 'fa-tower-broadcast animate-pulse' : 'fa-plus'} text-sm`}></i></div>
                {activeSession && <div className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-lg flex items-center gap-2"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span><span className="text-[8px] font-black text-white uppercase tracking-widest">Live</span></div>}
              </div>
              <div><h3 className="text-xl mb-0.5 uppercase tracking-tight font-black text-white">{activeSession ? 'RETOMAR TREINAMENTO' : 'INICIAR TREINAMENTO'}</h3>{activeSession ? <p className="text-white text-[10px] uppercase tracking-[0.2em] font-bold">Ativo na {activeSession.lifeboat} • {activeSession.tags.length} embarcados</p> : <p className="text-white/80 text-[10px] uppercase tracking-[0.2em] font-bold">Clique para configurar nova sessão</p>}</div>
            </div>
            <i className={`fa-solid ${activeSession ? 'fa-circle-dot opacity-10' : 'fa-anchor opacity-5'} absolute right-[-10px] bottom-[-10px] text-[120px] text-white rotate-12 transition-all`}></i>
          </button>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

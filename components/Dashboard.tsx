
import React, { useState, useEffect, useMemo } from 'react';
import { User, LifeboatStatus, LifeboatType, ActiveSession, AppState } from '../types';
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
  'MÁQUINA', 'ENFERMARIA', 'COZINHA', 'IMEDIATO', 'ON DUTY', 'LIBERADOS'
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
          // Busca usuários pendentes
          const allUsers = await cloudService.getAllUsers();
          setPendingCount(allUsers.filter(u => u.status === 'pending').length);
          
          // Busca estatísticas de leitos (POB)
          const berths = await cloudService.getBerths();
          setBerthStats({
            total: berths.length,
            occupied: berths.filter(b => b.crewName && b.crewName.trim() !== '').length
          });
        } catch (e) { console.error(e); }
      };
      
      fetchData();
      const interval = setInterval(fetchData, 30000);

      // Subscreve aos contadores manuais para tempo real
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
    const newValue = Math.max(0, (manualCounts[category] || 0) + delta);
    const updated = { ...manualCounts, [category]: newValue };
    setManualCounts(updated);
    try {
      await cloudService.updateManualCounters(updated);
    } catch (e) {
      console.error("Erro ao atualizar contador:", e);
    }
  };

  const totalPeopleInFleet = useMemo(() => {
    return (Object.values(fleetStatus) as LifeboatStatus[]).reduce((sum, status) => {
      return sum + (status?.isActive ? (status.count || 0) : 0);
    }, 0);
  }, [fleetStatus]);

  const activeLifeboats = useMemo(() => {
    return LIFEBOATS.filter(lb => fleetStatus[lb]?.isActive);
  }, [fleetStatus]);

  if (!user) return null;

  return (
    <div className="flex-1 flex flex-col p-6 max-w-5xl mx-auto w-full pb-32">
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h2 className="text-4xl md:text-5xl text-slate-900 tracking-tight leading-tight mb-3 font-normal">
            Olá, {user.name.split(' ')[0]}
          </h2>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-xl text-[11px] uppercase tracking-widest bg-blue-100 text-blue-700 border border-blue-200 font-bold">
              {user.role || 'SISTEMA'}
            </span>
            {user.isAdmin && (
              <span className="px-3 py-1 rounded-xl text-[11px] uppercase tracking-widest bg-slate-900 text-white font-bold">
                ADM
              </span>
            )}
          </div>
        </div>

        {user.isAdmin && (
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <button onClick={onOpenBerthManagement} className="flex-1 min-w-[140px] flex items-center justify-center gap-3 px-5 py-3 bg-slate-800 text-white rounded-2xl shadow-lg transition-all active:scale-95 group">
              <i className="fa-solid fa-bed"></i>
              <span className="text-[10px] uppercase tracking-widest font-bold">POB/Leitos</span>
            </button>
            <button onClick={onOpenUserManagement} className="flex-1 min-w-[140px] flex items-center justify-center gap-3 px-5 py-3 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all active:scale-95 group">
              <i className="fa-solid fa-users-gear text-slate-400 group-hover:text-blue-600 transition-colors"></i>
              <span className="text-[10px] text-slate-700 uppercase tracking-widest font-bold">Gestão</span>
              {pendingCount > 0 && <span className="flex items-center justify-center min-w-[20px] h-[20px] px-1 bg-red-500 text-white rounded-full text-[9px] font-bold animate-bounce">{pendingCount}</span>}
            </button>
          </div>
        )}
      </div>

      {user.isAdmin && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10 animate-in fade-in slide-in-from-top-4 duration-700 delay-200">
            {/* Card 1: Pessoal nos Exercícios (Em tempo real) */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-[32px] shadow-2xl shadow-blue-600/20 text-white overflow-hidden relative min-h-[140px]">
                <div className="relative z-10 flex flex-col justify-between h-full">
                  <div>
                    <h4 className="text-[9px] font-black uppercase tracking-[0.25em] text-white/60 mb-2">TREINAMENTO EM CURSO</h4>
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl font-black tabular-nums tracking-tighter">{totalPeopleInFleet}</span>
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Pessoas Muster</span>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/60">Sincronizado via Cloud</span>
                  </div>
                </div>
                <i className="fa-solid fa-people-group absolute right-[-10px] bottom-[-10px] text-8xl text-white/10 -rotate-12"></i>
            </div>

            {/* Card 2: POB Geral (Ocupação de Leitos) */}
            <div className="bg-white p-6 rounded-[32px] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden relative min-h-[140px] flex flex-col justify-between">
                <div className="relative z-10">
                  <h4 className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400 mb-2">ESTATÍSTICAS DA UNIDADE (POB)</h4>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-4xl font-black text-slate-900 tabular-nums tracking-tighter">{berthStats.occupied}</span>
                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Leitos Ocupados</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-baseline gap-1.5 justify-end">
                        <span className="text-2xl font-black text-slate-400 tabular-nums tracking-tighter">{berthStats.total}</span>
                      </div>
                      <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Capacidade Total</span>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 mt-4">
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 transition-all duration-1000 ease-out" 
                      style={{ width: `${berthStats.total > 0 ? (berthStats.occupied / berthStats.total) * 100 : 0}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest">
                      {berthStats.total > 0 ? Math.round((berthStats.occupied / berthStats.total) * 100) : 0}% de Ocupação
                    </span>
                    <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">
                      {berthStats.total - berthStats.occupied} Disponíveis
                    </span>
                  </div>
                </div>
                <i className="fa-solid fa-bed absolute right-[-5px] top-[-5px] text-6xl text-slate-50"></i>
            </div>
          </div>

          {/* Seção de Contadores Manuais */}
          <div className="mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
            <div className="flex items-center justify-between px-1 mb-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-3">
                <i className="fa-solid fa-sliders text-blue-500"></i>
                Controle de Grupos Operacionais
              </h3>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {MANUAL_CATEGORIES.map(category => (
                <div key={category} className="bg-white p-4 rounded-[28px] border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-3 text-center truncate">{category}</p>
                  <div className="flex items-center justify-between gap-2">
                    <button 
                      onClick={() => updateManualCount(category, -1)}
                      className="w-8 h-8 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all active:scale-75"
                    >
                      <i className="fa-solid fa-minus text-[8px]"></i>
                    </button>
                    <span className="text-xl font-black text-slate-800 tabular-nums">
                      {manualCounts[category] || 0}
                    </span>
                    <button 
                      onClick={() => updateManualCount(category, 1)}
                      className="w-8 h-8 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 transition-all active:scale-75"
                    >
                      <i className="fa-solid fa-plus text-[8px]"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!user.isAdmin && (
        <div className="mb-8">
          <button 
            onClick={activeSession ? onResumeTraining : onStartTraining} 
            className={`w-full h-32 relative overflow-hidden p-6 rounded-[32px] text-left transition-all active:scale-[0.98] shadow-xl ${
              activeSession 
                ? 'bg-blue-600 shadow-blue-600/30 border-2 border-blue-400/30 animate-pulse-slow' 
                : 'bg-slate-900 shadow-slate-900/20'
            }`}
          >
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="flex justify-between items-start w-full">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${activeSession ? 'bg-white text-blue-600' : 'bg-white/20 text-white'}`}>
                  <i className={`fa-solid ${activeSession ? 'fa-tower-broadcast animate-pulse' : 'fa-plus'} text-sm`}></i>
                </div>
                {activeSession && (
                  <div className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-lg flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
                    <span className="text-[8px] font-black text-white uppercase tracking-widest">Live</span>
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-xl mb-0.5 uppercase tracking-tight font-black text-white">
                  {activeSession ? 'RETOMAR TREINAMENTO' : 'INICIAR TREINAMENTO'}
                </h3>
                {activeSession ? (
                  <p className="text-white/70 text-[9px] uppercase tracking-[0.2em] font-bold">
                    Ativo na {activeSession.lifeboat} • {activeSession.tags.length} embarcados
                  </p>
                ) : (
                  <p className="text-white/40 text-[9px] uppercase tracking-[0.2em] font-bold">
                    Clique para configurar nova sessão
                  </p>
                )}
              </div>
            </div>
            <i className={`fa-solid ${activeSession ? 'fa-circle-dot opacity-10' : 'fa-anchor opacity-5'} absolute right-[-10px] bottom-[-10px] text-[120px] text-white rotate-12 transition-all`}></i>
          </button>
        </div>
      )}

      {user.isAdmin && (
        <div className="grid gap-2.5">
          <div className="flex items-center justify-between px-1 mb-1">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-3">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse"></span> 
              Monitoramento em Tempo Real
            </h3>
            <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">
              {activeLifeboats.length} {activeLifeboats.length === 1 ? 'Unidade Ativa' : 'Unidades Ativas'}
            </span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 min-h-[100px]">
            {activeLifeboats.length > 0 ? (
              activeLifeboats.map(lb => {
                const status = fleetStatus[lb];
                return (
                  <div 
                    key={lb} 
                    onClick={() => onViewLifeboat(lb)}
                    className="p-3 rounded-2xl border bg-blue-50 border-blue-100 ring-1 ring-blue-200 cursor-pointer hover:shadow-md transition-all animate-in fade-in zoom-in-95 duration-300"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-600 text-white shadow-lg shadow-blue-600/20">
                          <i className="fa-solid fa-ship text-[10px]"></i>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[11px] uppercase tracking-tight font-black truncate text-blue-700">
                            {lb}
                          </span>
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate">
                            Líder: {status.leaderName || 'Não Definido'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <span className="text-xs font-mono font-normal text-blue-600">{status?.count || 0}</span>
                        <span className="text-[7px] uppercase ml-1 opacity-30 font-normal">Pessoas</span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-full py-16 px-6 border-2 border-dashed border-slate-100 rounded-[32px] flex flex-col items-center justify-center text-center bg-white/50">
                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-200 mb-4">
                  <i className="fa-solid fa-satellite-dish text-xl"></i>
                </div>
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Nenhuma baleeira ativa no momento</p>
                <p className="text-[8px] font-bold text-slate-300/60 uppercase mt-1">Aguardando início de novos exercícios</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

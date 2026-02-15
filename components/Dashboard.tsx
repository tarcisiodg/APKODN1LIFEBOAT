
import React, { useState, useEffect, useMemo } from 'react';
import { User, LifeboatStatus, LifeboatType, ActiveSession, Berth, TrainingRecord } from '../types';
import { cloudService } from '../services/cloudService';
import { generateTrainingSummary } from '../services/geminiService';

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
  const [isSaving, setIsSaving] = useState(false);

  // Estados para o cronômetro de treinamento geral (Contagem Geral)
  const [generalTraining, setGeneralTraining] = useState<{
    isActive: boolean;
    isFinished: boolean;
    startTime: string;
    endTime: string;
    duration: string;
    startTimestamp?: number;
    finalTotal?: number;
  }>({ isActive: false, isFinished: false, startTime: '', endTime: '', duration: '' });
  
  const [liveDuration, setLiveDuration] = useState('00:00:00');

  useEffect(() => {
    let unsubscribeCounters: () => void;
    let unsubscribeReleased: () => void;
    let unsubscribeGeneralTraining: () => void;

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

      unsubscribeGeneralTraining = cloudService.subscribeToGeneralMusterTraining((data) => {
        if (data) setGeneralTraining(data);
      });

      return () => {
        clearInterval(interval);
        if (unsubscribeCounters) unsubscribeCounters();
        if (unsubscribeReleased) unsubscribeReleased();
        if (unsubscribeGeneralTraining) unsubscribeGeneralTraining();
      };
    }
  }, [user]);

  // Timer ao vivo para o treinamento geral
  useEffect(() => {
    let timer: number;
    if (generalTraining.isActive && generalTraining.startTimestamp) {
      timer = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - (generalTraining.startTimestamp || 0)) / 1000);
        const h = Math.floor(elapsed / 3600);
        const m = Math.floor((elapsed % 3600) / 60);
        const s = elapsed % 60;
        setLiveDuration(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [generalTraining.isActive, generalTraining.startTimestamp]);

  const totalPeopleInFleet = useMemo(() => {
    return (Object.values(fleetStatus) as LifeboatStatus[]).reduce((sum: number, status: LifeboatStatus) => {
      return sum + (status?.isActive ? (status.count || 0) : 0);
    }, 0);
  }, [fleetStatus]);

  const totalManualGroups = useMemo(() => {
    return (Object.values(manualCounts) as number[]).reduce((sum: number, val: number) => sum + (val || 0), 0);
  }, [manualCounts]);

  const overallMusterTotal = useMemo(() => totalPeopleInFleet + totalManualGroups, [totalPeopleInFleet, totalManualGroups]);

  const handleStartGeneralTraining = async () => {
    const now = new Date();
    const startTimeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const newState = {
      isActive: true,
      isFinished: false,
      startTime: startTimeStr,
      endTime: '',
      duration: '',
      startTimestamp: Date.now()
    };
    await cloudService.updateGeneralMusterTraining(newState);
  };

  const handleFinishGeneralTraining = async () => {
    const now = new Date();
    const endTimeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const elapsed = Math.floor((Date.now() - (generalTraining.startTimestamp || 0)) / 1000);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    const durationStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    
    const newState = {
      ...generalTraining,
      isActive: false,
      isFinished: true,
      endTime: endTimeStr,
      duration: durationStr,
      finalTotal: overallMusterTotal
    };
    await cloudService.updateGeneralMusterTraining(newState);
  };

  const handleSaveAndClearEverything = async () => {
    setIsSaving(true);
    try {
      const record: TrainingRecord = {
        id: crypto.randomUUID(),
        date: new Date().toLocaleString('pt-BR'),
        lifeboat: 'FROTA COMPLETA',
        leaderName: user?.name || 'Operador',
        trainingType: 'Contagem Geral',
        isRealScenario: false,
        crewCount: generalTraining.finalTotal || overallMusterTotal,
        duration: generalTraining.duration,
        summary: await generateTrainingSummary('FROTA COMPLETA', generalTraining.finalTotal || overallMusterTotal, generalTraining.duration),
        operator: user?.name || 'Sistema',
        tags: []
      };
      await cloudService.saveTrainingRecord(record);
      await cloudService.finalizeEverythingGlobally();
      setGeneralTraining({ isActive: false, isFinished: false, startTime: '', endTime: '', duration: '' });
    } catch (e) {
      alert("Erro ao encerrar contagem geral.");
    } finally {
      setIsSaving(false);
    }
  };

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

  const availableToRelease = useMemo(() => allBerths.filter(b => b.crewName && !releasedIds.includes(b.id)), [allBerths, releasedIds]);
  const releasedCrew = useMemo(() => allBerths.filter(b => releasedIds.includes(b.id)), [allBerths, releasedIds]);

  const musterStatus = useMemo(() => {
    const diff = berthStats.occupied - overallMusterTotal;
    if (diff === 0) return { label: 'CONTATO OK', color: 'bg-emerald-100 text-emerald-700' };
    else if (diff > 0) return { label: `${diff} ${diff === 1 ? 'PENDENTE' : 'PENDENTES'}`, color: 'bg-rose-100 text-rose-700' };
    else return { label: `${Math.abs(diff)} EXCEDIDO`, color: 'bg-amber-100 text-amber-700' };
  }, [overallMusterTotal, berthStats.occupied]);

  const capacityPercentage = useMemo(() => berthStats.total === 0 ? 0 : Math.min(100, Math.round((berthStats.occupied / berthStats.total) * 100)), [berthStats.occupied, berthStats.total]);

  if (!user) return null;

  return (
    <div className="flex-1 flex flex-col p-6 max-w-6xl mx-auto w-full pb-32">
      <div className="mb-8 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h2 className="text-4xl md:text-5xl text-slate-900 tracking-tight leading-tight mb-3 font-normal">Olá, {user.name.split(' ')[0]}</h2>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-xl text-[11px] uppercase tracking-widest bg-blue-100 text-blue-700 border border-blue-200 font-bold">{user.role || 'SISTEMA'}</span>
            {user.isAdmin && <span className="px-3 py-1 rounded-xl text-[11px] uppercase tracking-widest bg-slate-900 text-white font-bold">ADM</span>}
          </div>
        </div>

        {user.isAdmin && (
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 w-full lg:w-auto">
              <div className="flex-1 sm:flex-none bg-white border border-slate-200 rounded-2xl px-5 py-3 flex flex-col items-center justify-center min-w-[125px] shadow-sm">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">POB VIGENTE</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-slate-900 leading-none">{berthStats.occupied}</span>
                  <span className="text-sm font-bold text-slate-300">/</span>
                  <span className="text-sm font-black text-slate-400 leading-none">{berthStats.total}</span>
                </div>
              </div>
              <div className="flex-1 sm:flex-none bg-white border border-slate-200 rounded-2xl px-5 py-3 flex flex-col items-center justify-center min-w-[125px] shadow-sm">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2 text-center">CAPACIDADE</span>
                <span className={`text-2xl font-black leading-none ${capacityPercentage >= 90 ? 'text-rose-600' : 'text-emerald-600'}`}>{capacityPercentage}%</span>
              </div>
              <button onClick={onOpenBerthManagement} className="flex-1 sm:flex-none bg-blue-600 border border-blue-700 rounded-2xl px-5 py-3 flex flex-col items-center justify-center min-w-[125px] shadow-md hover:bg-blue-700 transition-all active:scale-95 group">
                <span className="text-[9px] font-black text-blue-100 uppercase tracking-widest leading-none mb-2 opacity-80">CONTROLE</span>
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-bed text-white"></i>
                  <span className="text-[10px] text-white font-black uppercase tracking-tight">LEITOS</span>
                </div>
              </button>
              <button onClick={onOpenUserManagement} className="flex-1 sm:flex-none bg-slate-800 border border-slate-900 rounded-2xl px-5 py-3 flex flex-col items-center justify-center min-w-[125px] shadow-md hover:bg-slate-900 transition-all active:scale-95 group relative">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2 opacity-80">SISTEMA</span>
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-users-gear text-white"></i>
                  <span className="text-[10px] text-white font-black uppercase tracking-tight">GESTÃO</span>
                </div>
                {pendingCount > 0 && <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] bg-red-500 text-white rounded-full text-[8px] font-bold shadow-sm animate-bounce">{pendingCount}</span>}
              </button>
            </div>
          </div>
        )}
      </div>

      {user.isAdmin && (
        <div className="mb-10">
          <div className="bg-blue-600 p-8 rounded-[40px] shadow-xl text-white relative overflow-hidden transition-all hover:shadow-2xl ring-1 ring-white/10 h-[260px] flex flex-col">
            <div className="relative z-10 flex flex-col flex-1 h-full">
              {/* TOPO DO CARD */}
              <div className="flex justify-between items-center mb-4">
                <div className="inline-flex items-center px-4 py-1.5 bg-white/20 backdrop-blur-md rounded-full border border-white/20 shadow-sm">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white">CONTAGEM GERAL</h4>
                </div>
                
                <div className="relative flex items-center gap-3">
                   {generalTraining.isFinished ? (
                      <button onClick={handleSaveAndClearEverything} disabled={isSaving} className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all border border-emerald-400/30">
                        {isSaving ? <i className="fa-solid fa-rotate animate-spin"></i> : <i className="fa-solid fa-cloud-arrow-up"></i>}
                        Limpar e Salvar
                      </button>
                    ) : (
                      <button onClick={generalTraining.isActive ? handleFinishGeneralTraining : handleStartGeneralTraining} className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 border shadow-lg ${generalTraining.isActive ? 'bg-rose-500 border-rose-400/30 text-white animate-pulse' : 'bg-white/10 border-white/20 hover:bg-white/20 text-white'}`}>
                        <i className={`fa-solid ${generalTraining.isActive ? 'fa-stop' : 'fa-play'}`}></i>
                        {generalTraining.isActive ? 'Finalizar' : 'Iniciar Treino'}
                      </button>
                    )}

                    {/* BALÃO DE TEMPO POSICIONADO ABSOLUTAMENTE */}
                    {(generalTraining.isActive || generalTraining.duration) && (
                      <div className="absolute top-[100%] right-0 mt-3 bg-black/40 backdrop-blur-xl rounded-[24px] p-4 border border-white/20 flex flex-col items-end gap-2 min-w-[210px] shadow-2xl animate-in fade-in slide-in-from-top-2 duration-500 z-20">
                        {generalTraining.isActive ? (
                          <>
                            <div className="flex items-center gap-3 w-full justify-between mb-1">
                              <span className="text-[14px] font-black text-emerald-400 uppercase tracking-widest drop-shadow-sm">INÍCIO: {generalTraining.startTime}</span>
                              <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_12px_rgba(52,211,153,1)]"></div>
                            </div>
                            <div className="flex flex-col items-end w-full">
                              <span className="text-[12px] font-black text-blue-200 uppercase tracking-widest mb-1 opacity-80">EM CURSO</span>
                              <span className="text-4xl font-mono font-black tabular-nums tracking-tighter leading-none text-white drop-shadow-2xl">{liveDuration}</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-end w-full gap-2">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[14px] font-black text-white uppercase tracking-widest leading-none drop-shadow-sm">INÍCIO: {generalTraining.startTime}</span>
                              <span className="text-[14px] font-black text-white uppercase tracking-widest leading-none drop-shadow-sm">TÉRMINO: {generalTraining.endTime}</span>
                            </div>
                            <div className="h-px w-full bg-white/20 my-1"></div>
                            <div className="flex flex-col items-end">
                              <span className="text-[13px] font-black text-emerald-400 uppercase tracking-widest mb-1 opacity-80">DURAÇÃO TOTAL</span>
                              <span className="text-4xl font-mono font-black tabular-nums tracking-tighter leading-none text-emerald-400 drop-shadow-2xl">{generalTraining.duration}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                </div>
              </div>

              {/* CONTEÚDO CENTRAL - LIMPO E CENTRALIZADO */}
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="flex items-baseline gap-2">
                  <span className="text-[85px] font-black tabular-nums tracking-tighter leading-none drop-shadow-lg">{overallMusterTotal}</span>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Pessoas Bordo</span>
                </div>
              </div>

              {/* BASE DO CARD - COM O BALÃO DE STATUS ALINHADO ÀS EQUIPES */}
              <div className="mt-auto pt-4 border-t border-white/10 flex items-end justify-between gap-6">
                <div className="flex gap-x-12">
                  <div className="group cursor-default">
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-300/80 block mb-0.5">LIFEBOATS</span>
                    <span className="text-3xl font-black tabular-nums">{totalPeopleInFleet}</span>
                  </div>
                  <div className="group cursor-default">
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-300/80 block mb-0.5">EQUIPES RESPOSTA</span>
                    <span className="text-3xl font-black tabular-nums">{totalManualGroups}</span>
                  </div>
                </div>

                <div className="pb-1">
                   <span className={`text-[12px] font-black uppercase px-6 py-2 rounded-2xl shadow-xl animate-in fade-in zoom-in duration-500 ring-2 ring-white/10 ${musterStatus.color}`}>
                    {musterStatus.label}
                  </span>
                </div>
              </div>
            </div>
            
            <i className="fa-solid fa-clipboard-check absolute right-[-20px] bottom-[-40px] text-[200px] text-white/5 -rotate-12 pointer-events-none"></i>
          </div>
        </div>
      )}
      
      {user.isAdmin ? (
        <>
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div>
              <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em]">EQUIPES DE RESPOSTA A EMERGÊNCIAS</h3>
              <div className="flex-1 h-px bg-slate-100"></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {MANUAL_CATEGORIES.map(category => {
                const count = manualCounts[category] || 0;
                const hasValue = count > 0;
                return (
                  <div key={category} className={`bg-white p-4 rounded-[28px] border-2 transition-all duration-300 ${category === 'LIBERADOS' ? 'border-amber-400 bg-amber-50/30 shadow-sm' : hasValue ? 'border-blue-500 bg-blue-50/20 shadow-md ring-1 ring-blue-50' : 'border-slate-300 shadow-sm'}`}>
                    <p className={`text-[10px] font-black uppercase text-center mb-3 truncate tracking-tight transition-colors ${hasValue ? 'text-blue-700' : 'text-slate-600'}`}>{category}</p>
                    <div className="flex items-center justify-between gap-1">
                      <button onClick={() => updateManualCount(category, -1)} className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:border-slate-300"><i className="fa-solid fa-minus text-[8px]"></i></button>
                      <input type="number" value={count === 0 ? '' : count} onChange={(e) => setManualCountAbsolute(category, e.target.value)} readOnly={category === 'LIBERADOS'} className={`w-12 text-center font-black text-2xl bg-transparent border-none outline-none focus:ring-0 transition-colors ${hasValue ? 'text-blue-900' : 'text-slate-800'}`} />
                      <button onClick={() => updateManualCount(category, 1)} className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:border-slate-300"><i className="fa-solid fa-plus text-[8px]"></i></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {LIFEBOATS.map(lb => {
              const status = fleetStatus[lb];
              const isActive = status?.isActive;
              return (
                <div key={lb} onClick={() => isActive && onViewLifeboat(lb)} className={`p-4 rounded-2xl border-2 transition-all ${isActive ? 'bg-blue-50 border-blue-600 cursor-pointer shadow-sm' : 'bg-white border-slate-300 opacity-60 shadow-sm'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center shadow-sm">
                      <i className={`fa-solid fa-ship ${isActive ? 'text-blue-600 animate-pulse' : 'text-slate-300'}`}></i>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-black text-slate-900 tabular-nums">{status?.count || 0}</span>
                      <p className="text-right text-[8px] font-black text-slate-700 uppercase tracking-widest">Pessoas</p>
                    </div>
                  </div>
                  <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-tight transition-colors">{lb}</h4>
                  <div className={`text-[8px] font-black uppercase mt-1 transition-colors ${isActive ? 'text-emerald-600' : 'text-slate-600'}`}>
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

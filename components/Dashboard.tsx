
import React, { useState, useEffect, useMemo } from 'react';
import { User, LifeboatStatus, LifeboatType, ActiveSession, Berth, TrainingRecord, ScannedTag } from '../types';
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
  const [isConfirmingGeneralFinish, setIsConfirmingGeneralFinish] = useState(false);
  const [isPobConsultOpen, setIsPobConsultOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Estados para o Wizard de Início de Contagem Geral
  const [isGeneralSetupOpen, setIsGeneralSetupOpen] = useState(false);
  const [generalSetupStep, setGeneralSetupStep] = useState<1 | 2>(1);
  const [gsIsReal, setGsIsReal] = useState(false);
  const [gsType, setGsType] = useState<'Gás' | 'Fogo/Abandono'>('Fogo/Abandono');
  const [gsDescription, setGsDescription] = useState('');

  // Estados para o cronômetro de treinamento geral (Contagem Geral)
  const [generalTraining, setGeneralTraining] = useState<{
    isActive: boolean;
    isFinished: boolean;
    startTime: string;
    endTime: string;
    duration: string;
    startTimestamp?: number;
    finalTotal?: number;
    trainingType?: string;
    isRealScenario?: boolean;
    description?: string;
  }>({ isActive: false, isFinished: false, startTime: '', endTime: '', duration: '' });
  
  const [liveDuration, setLiveDuration] = useState('00:00:00');

  useEffect(() => {
    let unsubscribeCounters: () => void;
    let unsubscribeReleased: () => void;
    let unsubscribeGeneralTraining: () => void;

    const fetchData = async () => {
      try {
        if (user?.isAdmin) {
          const allUsers = await cloudService.getAllUsers();
          setPendingCount(allUsers.filter(u => u.status === 'pending').length);
        }
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
    
    if (user?.isAdmin) {
      unsubscribeCounters = cloudService.subscribeToManualCounters((counters) => {
        setManualCounts(prev => ({ ...prev, ...counters }));
      });

      unsubscribeReleased = cloudService.subscribeToReleasedCrew((ids) => {
        setReleasedIds(ids);
      });

      unsubscribeGeneralTraining = cloudService.subscribeToGeneralMusterTraining((data) => {
        if (data) setGeneralTraining(data);
      });
    }

    return () => {
      clearInterval(interval);
      if (unsubscribeCounters) unsubscribeCounters();
      if (unsubscribeReleased) unsubscribeReleased();
      if (unsubscribeGeneralTraining) unsubscribeGeneralTraining();
    };
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
      if (status?.isManualMode) {
        return sum + (status.manualCount || 0);
      }
      return sum + (status?.isActive ? (status.count || 0) : 0);
    }, 0);
  }, [fleetStatus]);

  const totalManualGroups = useMemo(() => {
    return (Object.values(manualCounts) as number[]).reduce((sum: number, val: number) => sum + (val || 0), 0);
  }, [manualCounts]);

  const overallMusterTotal = useMemo(() => totalPeopleInFleet + totalManualGroups, [totalPeopleInFleet, totalManualGroups]);

  const musterDiff = useMemo(() => berthStats.occupied - overallMusterTotal, [berthStats.occupied, overallMusterTotal]);

  const capacityPercentage = useMemo(() => {
    if (berthStats.total === 0) return 0;
    return Math.round((berthStats.occupied / berthStats.total) * 100);
  }, [berthStats.occupied, berthStats.total]);

  const handleStartGeneralSetup = () => {
    setGeneralSetupStep(1);
    setGsIsReal(false);
    setGsType('Fogo/Abandono');
    setGsDescription('');
    setIsGeneralSetupOpen(true);
  };

  const handleFinishGeneralSetup = async () => {
    const now = new Date();
    const startTimeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const newState = {
      isActive: true,
      isFinished: false,
      startTime: startTimeStr,
      endTime: '',
      duration: '',
      startTimestamp: Date.now(),
      trainingType: gsType,
      isRealScenario: gsIsReal,
      description: gsDescription
    };
    await cloudService.updateGeneralMusterTraining(newState);
    setIsGeneralSetupOpen(false);
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
    setIsConfirmingGeneralFinish(false);
  };

  const handleSaveAndClearEverything = async () => {
    setIsSaving(true);
    try {
      let allTags: ScannedTag[] = [];
      const lbBreakdown: Record<string, { count: number; tags: ScannedTag[] }> = {};
      
      LIFEBOATS.forEach(lb => {
        const status = fleetStatus[lb];
        if (status?.isManualMode) {
          lbBreakdown[lb] = { count: status.manualCount || 0, tags: [] };
        } else if (status?.tags && status.tags.length > 0) {
          allTags = [...allTags, ...status.tags];
          lbBreakdown[lb] = {
            count: status.tags.length,
            tags: status.tags
          };
        }
      });

      const endTimeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const record: TrainingRecord = {
        id: crypto.randomUUID(),
        date: new Date().toLocaleString('pt-BR'),
        lifeboat: 'FROTA COMPLETA',
        leaderName: user?.name || 'Operador',
        trainingType: generalTraining.isRealScenario ? `EMERGÊNCIA: ${generalTraining.trainingType}` : `SIMULADO: ${generalTraining.trainingType}`,
        isRealScenario: generalTraining.isRealScenario || false,
        crewCount: generalTraining.finalTotal || overallMusterTotal,
        duration: generalTraining.duration,
        summary: `${generalTraining.description ? `MOTIVO/LOCAL: ${generalTraining.description}. ` : ''}${await generateTrainingSummary('FROTA COMPLETA', generalTraining.finalTotal || overallMusterTotal, generalTraining.duration)}`,
        operator: user?.name || 'Sistema',
        tags: allTags,
        ertCounts: manualCounts,
        lifeboatBreakdown: lbBreakdown,
        startTime: generalTraining.startTime,
        endTime: endTimeStr
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

  const toggleLifeboatManualMode = async (lb: LifeboatType) => {
    const status = fleetStatus[lb];
    const isNowManual = !status?.isManualMode;
    const updatedFleet = {
      ...fleetStatus,
      [lb]: {
        ...status,
        isManualMode: isNowManual,
        manualCount: isNowManual ? (status?.count || 0) : 0
      }
    };
    await cloudService.updateFleetStatus(updatedFleet);
  };

  const updateLifeboatManualCount = async (lb: LifeboatType, delta: number) => {
    const status = fleetStatus[lb];
    if (!status?.isManualMode) return;
    
    const updatedFleet = {
      ...fleetStatus,
      [lb]: {
        ...status,
        manualCount: Math.max(0, (status.manualCount || 0) + delta)
      }
    };
    await cloudService.updateFleetStatus(updatedFleet);
  };

  const handleToggleRelease = async (berthId: string) => {
    let newReleased = [...releasedIds];
    const isAddingToReleased = !newReleased.includes(berthId);

    if (isAddingToReleased) {
      newReleased.push(berthId);
      const updatedFleet = { ...fleetStatus };
      let fleetChanged = false;

      LIFEBOATS.forEach(lb => {
        if (updatedFleet[lb]?.isActive && updatedFleet[lb].tags) {
          const originalLength = updatedFleet[lb].tags.length;
          updatedFleet[lb].tags = updatedFleet[lb].tags.filter(tag => tag.leito !== berthId);
          
          if (updatedFleet[lb].tags.length !== originalLength) {
            updatedFleet[lb].count = updatedFleet[lb].tags.length;
            fleetChanged = true;
          }
        }
      });

      if (fleetChanged) {
        try {
          await cloudService.updateFleetStatus(updatedFleet);
        } catch (e) {
          console.error("Erro ao remover tripulante da baleeira:", e);
        }
      }
    } else {
      newReleased = newReleased.filter(id => id !== berthId);
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
  
  const sortedPobList = useMemo(() => {
    const filtered = allBerths.filter(b => 
      b.crewName?.toUpperCase().includes(searchTerm.toUpperCase()) || 
      b.id.toUpperCase().includes(searchTerm.toUpperCase()) ||
      b.role?.toUpperCase().includes(searchTerm.toUpperCase()) ||
      b.company?.toUpperCase().includes(searchTerm.toUpperCase())
    );

    return filtered.sort((a, b) => {
      const nameA = a.crewName || 'ZZZZZ'; 
      const nameB = b.crewName || 'ZZZZZ';
      return nameA.localeCompare(nameB);
    });
  }, [allBerths, searchTerm]);

  if (!user) return null;

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 max-w-6xl mx-auto w-full pb-32 overflow-x-hidden animate-in fade-in duration-500">
      <div className="mb-8 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div className="w-full lg:w-auto">
          <h2 className="text-3xl sm:text-4xl md:text-5xl text-slate-900 tracking-tight leading-tight mb-3 font-normal">Olá, {user.name.split(' ')[0]}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-xl text-[10px] sm:text-[11px] uppercase tracking-widest bg-blue-100 text-blue-700 border border-blue-200 font-bold">{user.role || 'SISTEMA'}</span>
            {user.isAdmin && <span className="px-3 py-1 rounded-xl text-[10px] sm:text-[11px] uppercase tracking-widest bg-slate-900 text-white font-bold">ADMINISTRADOR</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 w-full lg:w-auto">
            <div className="bg-white border border-slate-200 rounded-2xl px-4 sm:px-5 py-3 flex flex-col items-center justify-center flex-1 sm:flex-none min-w-[110px] sm:min-w-[125px] shadow-sm">
              <span className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">POB VIGENTE</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-black text-slate-900 leading-none">{berthStats.occupied}</span>
                <span className="text-xs sm:text-sm font-bold text-slate-300">/</span>
                <span className="text-xs sm:text-sm font-black text-slate-400 leading-none">{berthStats.total}</span>
              </div>
            </div>
            {user.isAdmin && (
              <>
                <div className="bg-white border border-slate-200 rounded-2xl px-4 sm:px-5 py-3 flex flex-col items-center justify-center flex-1 sm:flex-none min-w-[110px] sm:min-w-[125px] shadow-sm">
                  <span className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2 text-center">CAPACIDADE</span>
                  <span className={`text-xl sm:text-2xl font-black leading-none ${capacityPercentage >= 90 ? 'text-rose-600' : 'text-emerald-600'}`}>{capacityPercentage}%</span>
                </div>
                <button onClick={onOpenBerthManagement} className="bg-blue-600 border border-blue-700 rounded-2xl px-4 sm:px-5 py-3 flex flex-col items-center justify-center flex-1 sm:flex-none min-w-[110px] sm:min-w-[125px] shadow-md hover:bg-blue-700 transition-all active:scale-95 group">
                  <span className="text-[8px] sm:text-[9px] font-black text-blue-100 uppercase tracking-widest leading-none mb-2 opacity-80">CONTROLE</span>
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-bed text-white text-xs"></i>
                    <span className="text-[9px] sm:text-[10px] text-white font-black uppercase tracking-tight">LEITOS</span>
                  </div>
                </button>
                <button onClick={onOpenUserManagement} className="bg-slate-800 border border-slate-900 rounded-2xl px-4 sm:px-5 py-3 flex flex-col items-center justify-center flex-1 sm:flex-none min-w-[110px] sm:min-w-[125px] shadow-md hover:bg-slate-900 transition-all active:scale-95 group relative">
                  <span className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2 opacity-80">SISTEMA</span>
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-users-gear text-white text-xs"></i>
                    <span className="text-[9px] sm:text-[10px] text-white font-black uppercase tracking-tight">GESTÃO</span>
                  </div>
                  {pendingCount > 0 && <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] bg-red-500 text-white rounded-full text-[8px] font-bold shadow-sm animate-bounce">{pendingCount}</span>}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {user.isAdmin && (
        <div className="mb-10">
          <div className={`p-4 sm:p-5 rounded-[32px] sm:rounded-[40px] shadow-xl text-white relative overflow-hidden transition-all hover:shadow-2xl ring-1 ring-white/10 min-h-[180px] flex flex-col ${generalTraining.isRealScenario ? 'bg-rose-600 animate-pulse' : 'bg-blue-600'}`}>
            <div className="relative z-10 flex flex-col flex-1 h-full">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
                <div className="inline-flex flex-col gap-1">
                  <div className="inline-flex items-center px-4 py-1.5 bg-white/20 backdrop-blur-md rounded-full border border-white/20 shadow-sm self-start">
                    <h4 className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-white">CONTAGEM GERAL</h4>
                  </div>
                  {generalTraining.isActive && (
                    <div className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-white/80 ml-2">
                      {generalTraining.isRealScenario ? 'CENÁRIO: EMERGÊNCIA' : 'CENÁRIO: SIMULADO'} • {generalTraining.trainingType}
                    </div>
                  )}
                </div>
                
                <div className="relative flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                   {generalTraining.isFinished ? (
                      <button onClick={handleSaveAndClearEverything} disabled={isSaving} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all border border-emerald-400/30">
                        {isSaving ? <i className="fa-solid fa-rotate animate-spin"></i> : <i className="fa-solid fa-cloud-arrow-up"></i>}
                        Limpar e Salvar
                      </button>
                    ) : (
                      <button onClick={generalTraining.isActive ? () => setIsConfirmingGeneralFinish(true) : handleStartGeneralSetup} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-2xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 border shadow-lg ${generalTraining.isActive ? 'bg-rose-600 border-rose-500 hover:bg-rose-700 text-white shadow-rose-600/20' : 'bg-white/10 border-white/20 hover:bg-white/20 text-white'}`}>
                        <i className={`fa-solid ${generalTraining.isActive ? 'fa-stop' : 'fa-play'}`}></i>
                        {generalTraining.isActive ? 'Finalizar' : 'Iniciar'}
                      </button>
                    )}

                    {(generalTraining.isActive || generalTraining.duration) && (
                      <div className="relative sm:absolute sm:top-[100%] sm:right-0 mt-3 sm:mt-2 bg-black/40 backdrop-blur-xl rounded-[20px] sm:rounded-[24px] p-3 sm:p-4 border border-white/20 flex flex-col items-end gap-2 min-w-[160px] sm:min-w-[210px] shadow-2xl animate-in fade-in slide-in-from-top-2 duration-500 z-20">
                        {generalTraining.isActive ? (
                          <>
                            <div className="flex items-center gap-3 w-full justify-between mb-0.5">
                              <span className="text-[10px] sm:text-[14px] font-black text-emerald-400 uppercase tracking-widest drop-shadow-sm leading-none">INÍCIO: {generalTraining.startTime}</span>
                              <div className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(52,211,153,1)]"></div>
                            </div>
                            <div className="flex flex-col items-end w-full">
                              <span className="text-[9px] sm:text-[12px] font-black text-blue-200 uppercase tracking-widest mb-0.5 opacity-80 leading-none">EM CURSO</span>
                              <span className="text-2xl sm:text-4xl font-mono font-black tabular-nums tracking-tighter leading-none text-white drop-shadow-2xl">{liveDuration}</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-end w-full gap-1.5 sm:gap-2">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[10px] sm:text-[14px] font-black text-white uppercase tracking-widest leading-none drop-shadow-sm">INÍCIO: {generalTraining.startTime}</span>
                              <span className="text-[10px] sm:text-[14px] font-black text-white uppercase tracking-widest leading-none drop-shadow-sm">TÉRMINO: {generalTraining.endTime}</span>
                            </div>
                            <div className="h-px w-full bg-white/20 my-0.5"></div>
                            <div className="flex flex-col items-end">
                              <span className="text-[9px] sm:text-[13px] font-black text-emerald-400 uppercase tracking-widest mb-0.5 opacity-80 leading-none">DURAÇÃO TOTAL</span>
                              <span className="text-2xl sm:text-4xl font-mono font-black tabular-nums tracking-tighter leading-none text-emerald-400 drop-shadow-2xl">{generalTraining.duration}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                </div>
              </div>

              <div className="flex-1 flex flex-col justify-center py-2">
                <div className="flex items-baseline gap-4 sm:gap-6">
                  <div className="flex items-baseline gap-2">
                    <span className="text-6xl sm:text-7xl md:text-[80px] font-black tabular-nums tracking-tighter leading-none drop-shadow-lg">{overallMusterTotal}</span>
                    <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] opacity-80">
                      {overallMusterTotal === 1 ? 'Pessoa' : 'Pessoas'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-auto pt-3 border-t border-white/10 flex flex-wrap gap-x-6 gap-y-2 sm:gap-x-12">
                <div className="group cursor-default">
                  <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-blue-300/80 block mb-0.5 leading-none">LIFEBOATS</span>
                  <span className="text-xl sm:text-2xl font-black tabular-nums leading-none">{totalPeopleInFleet}</span>
                </div>
                <div className="group cursor-default">
                  <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-blue-300/80 block mb-0.5 leading-none">EQUIPES</span>
                  <span className="text-xl sm:text-2xl font-black tabular-nums leading-none">{totalManualGroups}</span>
                </div>
                {generalTraining.isActive && (
                  <div className="group cursor-default animate-in fade-in zoom-in duration-500">
                    {musterDiff > 0 ? (
                      <>
                        <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-blue-300/80 block mb-0.5 leading-none">
                          {musterDiff === 1 ? 'PENDENTE' : 'PENDENTES'}
                        </span>
                        <span className="text-xl sm:text-2xl font-black tabular-nums leading-none text-rose-400">
                          {musterDiff}
                        </span>
                      </>
                    ) : musterDiff === 0 ? (
                      <>
                        <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-emerald-400 block mb-0.5 leading-none drop-shadow-sm">STATUS</span>
                        <span className="text-xl sm:text-2xl font-black leading-none text-emerald-400 animate-pulse drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">
                          MUSTER
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-amber-300/80 block mb-0.5 leading-none">
                          {Math.abs(musterDiff) === 1 ? 'EXCEDENTE' : 'EXCEDENTES'}
                        </span>
                        <span className="text-xl sm:text-2xl font-black tabular-nums leading-none text-amber-400">
                          {Math.abs(musterDiff)}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <i className={`fa-solid ${generalTraining.isRealScenario ? 'fa-triangle-exclamation' : 'fa-clipboard-check'} absolute right-[-15px] bottom-[-25px] text-[90px] sm:text-[130px] text-white/5 -rotate-12 pointer-events-none`}></i>
          </div>
        </div>
      )}
      
      {!user.isAdmin ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 gap-8">
            <button onClick={activeSession ? onResumeTraining : onStartTraining} className="w-56 h-56 sm:w-64 sm:h-64 bg-blue-600 rounded-full shadow-2xl shadow-blue-600/30 text-white flex flex-col items-center justify-center gap-4 hover:scale-105 active:scale-95 transition-all group border-4 border-white">
                <i className={`fa-solid ${activeSession ? 'fa-tower-broadcast animate-pulse' : 'fa-play'} text-4xl group-hover:rotate-12 transition-transform`}></i>
                <div className="text-center">
                    <div className="font-black text-lg sm:text-xl uppercase tracking-tight">{activeSession ? 'Retomar Sessão' : 'Iniciar Embarque'}</div>
                    <div className="text-[9px] sm:text-[10px] opacity-60 uppercase font-bold tracking-widest">{activeSession ? activeSession.lifeboat : 'LIFEBOAT MUSTER'}</div>
                </div>
            </button>
            
            <button onClick={() => setIsPobConsultOpen(true)} className="flex items-center gap-4 px-8 py-5 bg-white rounded-3xl border-2 border-slate-100 text-slate-800 hover:border-blue-600 hover:bg-blue-50 transition-all shadow-sm active:scale-95 group">
                <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <i className="fa-solid fa-users"></i>
                </div>
                <div className="text-left">
                  <span className="block font-black text-xs uppercase tracking-tight">Consultar POB</span>
                  <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Lista de tripulantes</span>
                </div>
            </button>
        </div>
      ) : (
        <>
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div>
              <h3 className="text-[10px] sm:text-[11px] font-black text-slate-900 uppercase tracking-[0.2em]">EQUIPES DE RESPOSTA A EMERGÊNCIAS</h3>
              <div className="flex-1 h-px bg-slate-100"></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {MANUAL_CATEGORIES.map(category => {
                const count = manualCounts[category] || 0;
                const hasValue = count > 0;
                return (
                  <div key={category} className={`bg-white p-3 sm:p-4 rounded-[24px] sm:rounded-[28px] border-2 transition-all duration-300 ${category === 'LIBERADOS' ? 'border-amber-400 bg-amber-50/30 shadow-sm' : hasValue ? 'border-blue-500 bg-blue-50/20 shadow-md ring-1 ring-blue-50' : 'border-slate-300 shadow-sm'}`}>
                    <p className={`text-[9px] sm:text-[10px] font-black uppercase text-center mb-2 sm:mb-3 truncate tracking-tight transition-colors ${hasValue ? 'text-blue-700' : 'text-slate-600'}`}>{category}</p>
                    <div className="flex items-center justify-between gap-1">
                      <button onClick={() => updateManualCount(category, -1)} className="w-7 h-7 sm:w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:border-slate-300"><i className="fa-solid fa-minus text-[8px]"></i></button>
                      <input type="number" value={count === 0 ? '' : count} onChange={(e) => setManualCountAbsolute(category, e.target.value)} readOnly={category === 'LIBERADOS'} className={`w-10 sm:w-12 text-center font-black text-xl sm:text-2xl bg-transparent border-none outline-none focus:ring-0 transition-colors ${hasValue ? 'text-blue-900' : 'text-slate-800'}`} />
                      <button onClick={() => updateManualCount(category, 1)} className="w-7 h-7 sm:w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:border-slate-300"><i className="fa-solid fa-plus text-[8px]"></i></button>
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
              const isManual = status?.isManualMode;
              const countToDisplay = isManual ? (status.manualCount || 0) : (status?.count || 0);
              
              return (
                <div key={lb} className={`p-5 rounded-[32px] border-2 transition-all flex flex-col gap-4 relative ${isManual ? 'bg-amber-50 border-amber-500 shadow-md' : isActive ? 'bg-blue-50 border-blue-600 shadow-sm' : 'bg-white border-slate-300 opacity-70 shadow-sm'}`}>
                  <div className="flex items-start justify-between">
                    <div onClick={() => isActive && !isManual && onViewLifeboat(lb)} className={`w-12 h-12 bg-white border border-slate-200 rounded-2xl flex items-center justify-center shadow-sm ${isActive && !isManual ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'}`}>
                      <i className={`fa-solid ${isManual ? 'fa-triangle-exclamation text-amber-500' : 'fa-ship ' + (isActive ? 'text-blue-600 animate-pulse' : 'text-slate-300')} text-xl`}></i>
                    </div>
                    
                    {isManual ? (
                      <div className="flex items-center gap-2 bg-white/50 p-1 rounded-full border border-amber-200">
                         <button onClick={() => updateLifeboatManualCount(lb, -1)} className="w-8 h-8 rounded-full flex items-center justify-center bg-white text-amber-600 shadow-sm active:scale-90 transition-all border border-amber-100"><i className="fa-solid fa-minus text-[10px]"></i></button>
                         <span className="text-2xl font-black text-amber-900 tabular-nums w-10 text-center">{countToDisplay}</span>
                         <button onClick={() => updateLifeboatManualCount(lb, 1)} className="w-8 h-8 rounded-full flex items-center justify-center bg-white text-amber-600 shadow-sm active:scale-90 transition-all border border-amber-100"><i className="fa-solid fa-plus text-[10px]"></i></button>
                      </div>
                    ) : (
                      <div onClick={() => isActive && !isManual && onViewLifeboat(lb)} className={`text-right ${isActive ? 'cursor-pointer' : 'cursor-default'}`}>
                        <span className="text-3xl font-black text-slate-900 tabular-nums leading-none">{countToDisplay}</span>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">PESSOAS</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight mb-1">{lb}</h4>
                    <div className={`text-[9px] font-black uppercase transition-colors ${isManual ? 'text-amber-700' : isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {isManual ? 'COMANDO MANUAL ATIVO' : isActive ? `Líder: ${status.leaderName || '-'}` : 'STANDBY'}
                    </div>
                  </div>

                  <div className="mt-auto pt-4 border-t border-slate-100/50">
                    <button 
                      onClick={() => toggleLifeboatManualMode(lb)}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm border ${
                        isManual 
                        ? 'bg-amber-600 text-white border-amber-700 shadow-amber-600/20' 
                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                      }`}
                      title={isManual ? "Voltar para Automático" : "Assumir Comando Manual"}
                    >
                      <i className={`fa-solid ${isManual ? 'fa-toggle-on' : 'fa-toggle-off'} text-xs`}></i>
                      {isManual ? 'MODO OFFLINE' : 'MODO ONLINE'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal de Consulta de POB (Para Operadores) - Responsivo Otimizado */}
      {isPobConsultOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 lg:p-6">
          <div className="bg-white rounded-[24px] sm:rounded-[40px] max-w-7xl w-full p-3 sm:p-8 shadow-2xl animate-in zoom-in duration-300 flex flex-col h-[95vh] sm:max-h-[90vh] border border-slate-100">
            
            {/* Cabeçalho do Modal */}
            <div className="flex justify-between items-center mb-4 sm:mb-6 px-1 sm:px-2">
              <div className="min-w-0">
                <h3 className="text-lg sm:text-xl font-black text-slate-900 uppercase tracking-tight truncate">Consulta de POB</h3>
                <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate">Lista Geral Ordenada por Nome</p>
              </div>
              <button 
                onClick={() => { setIsPobConsultOpen(false); setSearchTerm(''); }} 
                className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-50 rounded-xl sm:rounded-2xl text-slate-400 active:scale-95 hover:text-rose-500 hover:bg-rose-50 transition-all flex items-center justify-center shadow-sm flex-shrink-0"
              >
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>
            
            {/* Barra de Busca */}
            <div className="relative mb-4 sm:mb-6 px-1 sm:px-2">
              <i className="fa-solid fa-magnifying-glass absolute left-6 sm:left-8 top-1/2 -translate-y-1/2 text-slate-300 text-xs sm:text-sm"></i>
              <input 
                type="text" 
                placeholder="BUSCAR NOME, FUNÇÃO, LEITO OU EMPRESA..." 
                className="w-full pl-11 sm:pl-14 pr-6 py-4 sm:py-4.5 bg-slate-50 border border-slate-100 rounded-xl sm:rounded-2xl text-[10px] sm:text-[11px] font-black uppercase focus:ring-2 focus:ring-blue-100 focus:bg-white outline-none transition-all shadow-inner" 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
              />
            </div>

            {/* Container da Lista (Responsivo: Tabela no Desktop, Grid de Cards em Tablets/Mobile) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-1 sm:px-2 pb-6">
              {sortedPobList.length === 0 ? (
                <div className="py-24 text-center text-slate-300 bg-slate-50/30 rounded-2xl">
                  <i className="fa-solid fa-users-slash text-4xl sm:text-5xl mb-4 block opacity-20"></i>
                  <p className="text-[10px] font-black uppercase tracking-widest">Nenhum tripulante encontrado</p>
                </div>
              ) : (
                <>
                  {/* Visão de CARDS (Mobile e Tablets < 1024px) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:hidden pb-4">
                    {sortedPobList.map((b) => {
                      const isOccupied = b.crewName && b.crewName.trim() !== '';
                      return (
                        <div key={b.id} className={`bg-white border p-4 rounded-2xl shadow-sm space-y-3 transition-all ${isOccupied ? 'border-blue-100 bg-blue-50/10' : 'border-slate-100 opacity-60'}`}>
                          <div className="flex justify-between items-start gap-3">
                             <div className="min-w-0">
                               <div className="flex items-center gap-2 mb-1">
                                 <h4 className={`text-[11px] font-black uppercase leading-tight truncate ${isOccupied ? 'text-slate-800' : 'text-slate-400'}`}>
                                   {isOccupied ? b.crewName : '--- VAZIO ---'}
                                 </h4>
                               </div>
                               <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight truncate">
                                 {isOccupied ? `${b.role || '-'} • ${b.company || '-'}` : 'Leito disponível para alocação'}
                               </p>
                             </div>
                             <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                               <span className="bg-slate-800 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold shadow-sm">{b.id}</span>
                               <span className={`text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest ${isOccupied ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                 {isOccupied ? 'Ocupado' : 'Livre'}
                               </span>
                             </div>
                          </div>
                          
                          <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                            <div className="flex-1 flex flex-col gap-1">
                              <span className="text-[8px] font-black text-slate-300 uppercase tracking-wider">Primária</span>
                              <span className={`text-[10px] font-black py-1.5 rounded-lg border text-center uppercase tracking-tighter shadow-sm ${b.lifeboat ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-200 border-slate-100'}`}>
                                {b.lifeboat ? b.lifeboat.replace(/\D/g, '') : '-'}
                              </span>
                            </div>
                            <div className="flex-1 flex flex-col gap-1">
                              <span className="text-[8px] font-black text-slate-300 uppercase tracking-wider">Secundária</span>
                              <span className={`text-[10px] font-black py-1.5 rounded-lg border text-center uppercase tracking-tighter shadow-sm ${b.secondaryLifeboat ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-50 text-slate-200 border-slate-100'}`}>
                                {b.secondaryLifeboat ? b.secondaryLifeboat.replace(/\D/g, '') : '-'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Visão de TABELA (Desktop >= 1024px) */}
                  <div className="hidden lg:block min-w-full bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-md z-20 border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Leito</th>
                          <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome Completo</th>
                          <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Função</th>
                          <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Empresa</th>
                          <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">PRIMÁRIA</th>
                          <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">SECUNDÁRIA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedPobList.map((b) => (
                          <tr key={b.id} className="hover:bg-blue-50/40 transition-colors group/row">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold shadow-sm inline-block group-hover/row:scale-105 transition-transform">{b.id}</span>
                            </td>
                            <td className="px-6 py-4 min-w-0">
                              <p className="text-[11px] font-black text-slate-800 uppercase leading-none group-hover/row:text-blue-700 transition-colors truncate">{b.crewName || '--- VAZIO ---'}</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight truncate">{b.role || '-'}</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-[10px] font-black text-blue-600/80 uppercase tracking-tighter truncate">{b.company || '-'}</p>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`text-[9px] font-black px-3 py-1.5 rounded-full border uppercase tracking-tighter shadow-sm inline-block min-w-[50px] ${b.lifeboat ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-300 border-slate-100'}`}>
                                {b.lifeboat ? b.lifeboat.replace(/\D/g, '') : '---'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`text-[9px] font-black px-3 py-1.5 rounded-full border uppercase tracking-tighter shadow-sm inline-block min-w-[50px] ${b.secondaryLifeboat ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-50 text-slate-300 border-slate-100'}`}>
                                {b.secondaryLifeboat ? b.secondaryLifeboat.replace(/\D/g, '') : '---'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            
            {/* Rodapé do Modal */}
            <div className="mt-auto pt-3 sm:pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between px-1 sm:px-2 gap-3 sm:gap-0">
              <div className="flex gap-4 sm:gap-6 w-full sm:w-auto justify-center sm:justify-start">
                 <div className="flex items-center gap-2">
                   <div className="w-2 sm:w-2.5 h-2 sm:h-2.5 bg-blue-600 rounded-full shadow-sm"></div>
                   <span className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest">POB Total: {sortedPobList.length}</span>
                 </div>
                 <div className="flex items-center gap-2">
                   <div className="w-2 sm:w-2.5 h-2 sm:h-2.5 bg-emerald-500 rounded-full shadow-sm"></div>
                   <span className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest">A Bordo: {sortedPobList.filter(x => x.crewName && x.crewName.trim() !== '').length}</span>
                 </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-lg border border-slate-100 self-center sm:self-auto">
                <i className="fa-solid fa-shield-halved text-[9px] sm:text-[10px] text-blue-400"></i>
                <span className="text-[8px] sm:text-[9px] font-black text-slate-300 uppercase tracking-[0.2em]">Lifesafe ODN1(NS-41)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Outros Modais (Setup, Finish, Release, etc) - Mantidos do Dashboard original */}
      {isGeneralSetupOpen && (
        <div className="fixed inset-0 z-[300] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[40px] max-lg w-full p-8 sm:p-10 shadow-2xl animate-in zoom-in duration-300 border border-slate-100">
            <div className="flex items-center justify-between mb-8">
               <h3 className="text-xl font-bold text-slate-900 uppercase tracking-tight">
                 {generalSetupStep === 1 ? 'Tipo de Cenário' : 'Detalhes do Evento'}
               </h3>
               <button onClick={() => setIsGeneralSetupOpen(false)} className="w-10 h-10 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center"><i className="fa-solid fa-xmark"></i></button>
            </div>

            {generalSetupStep === 1 ? (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="grid grid-cols-1 gap-4">
                  <button onClick={() => { setGsIsReal(false); setGeneralSetupStep(2); }} className="p-6 rounded-3xl border-2 border-slate-100 hover:border-blue-600 hover:bg-blue-50 transition-all text-left flex items-center gap-4 group">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white"><i className="fa-solid fa-graduation-cap text-lg"></i></div>
                    <div>
                      <span className="block font-black text-xs uppercase text-slate-900">Simulado</span>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">Exercício de Treinamento</span>
                    </div>
                  </button>
                  <button onClick={() => { setGsIsReal(true); setGeneralSetupStep(2); }} className="p-6 rounded-3xl border-2 border-slate-100 hover:border-rose-600 hover:bg-rose-50 transition-all text-left flex items-center gap-4 group">
                    <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white"><i className="fa-solid fa-triangle-exclamation text-lg"></i></div>
                    <div>
                      <span className="block font-black text-xs uppercase text-slate-900">Emergência Real</span>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">Cenário Crítico Ativo</span>
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                <div className="space-y-2 text-left">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-1">TIPO DE EVENTO</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setGsType('Gás')} className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${gsType === 'Gás' ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>Gás</button>
                    <button onClick={() => setGsType('Fogo/Abandono')} className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${gsType === 'Fogo/Abandono' ? 'bg-rose-600 text-white border-rose-600 shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>Fogo/Abandono</button>
                  </div>
                </div>
                <div className="space-y-2 text-left">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-1">MOTIVO / LOCAL / OBSERVAÇÕES</label>
                  <textarea value={gsDescription} onChange={(e) => setGsDescription(e.target.value)} rows={3} placeholder="DESCREVA O LOCAL OU MOTIVO..." className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold uppercase focus:ring-1 focus:ring-blue-100 outline-none resize-none" />
                </div>
                <div className="grid gap-2 pt-4">
                  <button onClick={handleFinishGeneralSetup} className="w-full py-5 bg-slate-900 text-white font-black rounded-3xl text-[11px] uppercase tracking-widest shadow-xl active:scale-95 transition-all">Iniciar Contagem Geral</button>
                  <button onClick={() => setGeneralSetupStep(1)} className="w-full py-5 bg-slate-100 text-slate-400 font-black rounded-3xl text-[11px] uppercase tracking-widest">Voltar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isConfirmingGeneralFinish && (
        <div className="fixed inset-0 z-[300] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[40px] max-md w-full p-8 sm:p-10 shadow-2xl animate-in zoom-in duration-300 border border-slate-100">
            <div className="w-20 h-20 bg-rose-50 rounded-[28px] flex items-center justify-center text-rose-600 mx-auto mb-8 shadow-inner">
              <i className="fa-solid fa-stop text-3xl"></i>
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-8 uppercase tracking-tight">Finalizar Contagem?</h3>
            <div className="grid gap-3">
              <button onClick={handleFinishGeneralTraining} className="w-full py-5 bg-rose-600 text-white font-black rounded-3xl text-[11px] uppercase tracking-widest shadow-xl shadow-rose-600/20 active:scale-95 transition-all border border-rose-400/30">Sim, Finalizar</button>
              <button onClick={() => setIsConfirmingGeneralFinish(false)} className="w-full py-5 bg-slate-50 text-slate-400 font-black rounded-3xl text-[11px] uppercase tracking-widest active:scale-95 transition-all">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

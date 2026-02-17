
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  const [selectedForAction, setSelectedForAction] = useState<Set<string>>(new Set());
  
  const [isConfirmingGeneralFinish, setIsConfirmingGeneralFinish] = useState(false);
  const [isPobConsultOpen, setIsPobConsultOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // NFC Test State
  const [isTestNfcOpen, setIsTestNfcOpen] = useState(false);
  const [testTagResult, setTestTagResult] = useState<{tagId: string, crewName?: string, role?: string, company?: string, berthId?: string} | null>(null);
  const [nfcTestState, setNfcTestState] = useState<'idle' | 'scanning' | 'error'>('idle');
  const nfcReaderRef = useRef<any>(null);

  const [isGeneralSetupOpen, setIsGeneralSetupOpen] = useState(false);
  const [generalSetupStep, setGeneralSetupStep] = useState<1 | 2>(1);
  const [gsIsReal, setGsIsReal] = useState(false);
  const [gsType, setGsType] = useState<'Gás' | 'Fogo/Abandono'>('Fogo/Abandono');
  const [gsDescription, setGsDescription] = useState('');
  
  const [lbToReset, setLbToReset] = useState<LifeboatType | null>(null);

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
    
    unsubscribeGeneralTraining = cloudService.subscribeToGeneralMusterTraining((data) => {
      if (data) setGeneralTraining(data);
    });

    if (user?.isAdmin) {
      unsubscribeCounters = cloudService.subscribeToManualCounters((counters) => {
        setManualCounts(prev => ({ ...prev, ...counters }));
      });

      unsubscribeReleased = cloudService.subscribeToReleasedCrew((ids) => {
        setReleasedIds(ids);
      });
    }

    return () => {
      clearInterval(interval);
      if (unsubscribeCounters) unsubscribeCounters();
      if (unsubscribeReleased) unsubscribeReleased();
      if (unsubscribeGeneralTraining) unsubscribeGeneralTraining();
    };
  }, [user]);

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

  const berthStatsOccupiedActual = useMemo(() => berthStats.occupied, [berthStats.occupied]);

  const musterDiff = useMemo(() => berthStatsOccupiedActual - overallMusterTotal, [berthStatsOccupiedActual, overallMusterTotal]);

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
      setSearchTerm('');
      setSelectedForAction(new Set());
      if (delta > 0) {
        setIsReleaseModalOpen(true);
      } else if (releasedIds.length > 0) {
        setIsReturnModalOpen(true);
      }
      return;
    }

    setManualCounts(prev => {
      const newValue = Math.max(0, (prev[category] || 0) + delta);
      const updated = { ...prev, [category]: newValue };
      cloudService.updateManualCounters(updated).catch(console.error);
      return updated;
    });
  };

  const handleConfirmRelease = async () => {
    if (selectedForAction.size === 0) return;
    setIsSaving(true);
    try {
      const newIds = [...new Set([...releasedIds, ...Array.from(selectedForAction)])];
      await cloudService.updateReleasedCrew(newIds);
      const updatedCounters = { ...manualCounts, 'LIBERADOS': newIds.length };
      await cloudService.updateManualCounters(updatedCounters);
      setIsReleaseModalOpen(false);
      setSelectedForAction(new Set());
    } catch (e) {
      alert("Erro ao processar liberação.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmReturn = async () => {
    if (selectedForAction.size === 0) return;
    setIsSaving(true);
    try {
      const newIds = releasedIds.filter(id => !selectedForAction.has(id));
      await cloudService.updateReleasedCrew(newIds);
      const updatedCounters = { ...manualCounts, 'LIBERADOS': newIds.length };
      await cloudService.updateManualCounters(updatedCounters);
      setIsReturnModalOpen(false);
      setSelectedForAction(new Set());
    } catch (e) {
      alert("Erro ao processar retorno.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedForAction);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedForAction(next);
  };

  const toggleLifeboatManualMode = async (lb: LifeboatType) => {
    const status = fleetStatus[lb];
    const isNowManual = !status?.isManualMode;
    
    let updatedStatus: LifeboatStatus = { ...status };
    
    if (isNowManual) {
      let currentSeconds = status.seconds || 0;
      if (!status.isPaused && status.startTime) {
        const elapsed = Math.floor((Date.now() - status.startTime) / 1000);
        currentSeconds = (status.accumulatedSeconds || 0) + elapsed;
      }
      
      updatedStatus = {
        ...status,
        isManualMode: true,
        manualCount: status.count || 0,
        isPaused: true,
        accumulatedSeconds: currentSeconds,
        seconds: currentSeconds
      };
    } else {
      updatedStatus = {
        ...status,
        isManualMode: false,
        isPaused: false,
        startTime: Date.now()
      };
    }

    await cloudService.updateSingleLifeboatStatus(lb, updatedStatus);
  };

  const updateLifeboatManualCount = async (lb: LifeboatType, delta: number) => {
    const status = fleetStatus[lb];
    if (!status?.isManualMode) return;
    
    const updatedStatus = {
      ...status,
      manualCount: Math.max(0, (status.manualCount || 0) + delta)
    };
    await cloudService.updateSingleLifeboatStatus(lb, updatedStatus);
  };

  const setLifeboatManualCountAbsolute = async (lb: LifeboatType, value: string) => {
    const status = fleetStatus[lb];
    if (!status?.isManualMode) return;
    const numValue = value === '' ? 0 : parseInt(value, 10);
    const validValue = isNaN(numValue) ? 0 : Math.max(0, numValue);

    const updatedStatus = {
      ...status,
      manualCount: validValue
    };
    await cloudService.updateSingleLifeboatStatus(lb, updatedStatus);
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

  const handleForceResetLifeboat = async () => {
    if (!lbToReset) return;
    setIsSaving(true);
    try {
      const resetStatus: LifeboatStatus = { 
        count: 0, 
        isActive: false, 
        tags: [], 
        seconds: 0, 
        isManualMode: false,
        isPaused: false,
        startTime: 0,
        accumulatedSeconds: 0
      };
      await cloudService.updateSingleLifeboatStatus(lbToReset, resetStatus);
      setLbToReset(null);
    } catch (e) {
      alert("Erro ao resetar baleeira.");
    } finally {
      setIsSaving(false);
    }
  };

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

  const availableToRelease = useMemo(() => {
    return sortedPobList.filter(b => b.crewName && b.crewName.trim() !== '' && !releasedIds.includes(b.id));
  }, [sortedPobList, releasedIds]);

  const currentlyReleased = useMemo(() => {
    return allBerths.filter(b => releasedIds.includes(b.id) && (b.crewName?.toUpperCase().includes(searchTerm.toUpperCase()) || b.id.toUpperCase().includes(searchTerm.toUpperCase())));
  }, [allBerths, releasedIds, searchTerm]);

  const startNfcTest = async () => {
    if (!('NDEFReader' in window)) {
      alert("NFC não suportado neste dispositivo.");
      return;
    }
    setNfcTestState('scanning');
    setTestTagResult(null);
    try {
      const reader = new (window as any).NDEFReader();
      nfcReaderRef.current = reader;
      await reader.scan();
      reader.addEventListener("reading", ({ serialNumber }: any) => {
        const tagId = serialNumber || "";
        if (tagId) {
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          
          const matchedBerth = allBerths.find(b => 
            (b.tagId1 && b.tagId1.trim().toLowerCase() === tagId.trim().toLowerCase()) ||
            (b.tagId2 && b.tagId2.trim().toLowerCase() === tagId.trim().toLowerCase()) ||
            (b.tagId3 && b.tagId3.trim().toLowerCase() === tagId.trim().toLowerCase())
          );

          setTestTagResult({
            tagId: tagId,
            crewName: matchedBerth?.crewName,
            role: matchedBerth?.role,
            company: matchedBerth?.company,
            berthId: matchedBerth?.id
          });
        }
      });
    } catch (e) {
      console.error(e);
      setNfcTestState('error');
    }
  };

  const closeNfcTest = () => {
    setIsTestNfcOpen(false);
    setTestTagResult(null);
    setNfcTestState('idle');
  };

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
            
            <i className="fa-solid fa-clipboard-check absolute right-[-15px] bottom-[-25px] text-[90px] sm:text-[130px] text-white/5 -rotate-12 pointer-events-none"></i>
          </div>
        </div>
      )}
      
      {!user.isAdmin ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 gap-8">
            <div className="relative w-full max-w-[640px]">
              {!generalTraining.isActive && !activeSession && (
                <div className="absolute inset-0 bg-white/90 backdrop-blur-[6px] z-10 rounded-[40px] sm:rounded-[48px] flex flex-row items-center justify-center gap-6 sm:gap-10 border-4 border-dashed border-blue-200/50 shadow-inner group/standby overflow-hidden px-6 sm:px-12">
                  <div className="absolute -inset-[100%] bg-gradient-to-tr from-transparent via-blue-50/30 to-transparent animate-[shimmer_4s_infinite] pointer-events-none"></div>
                  
                  <div className="relative">
                    <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-20"></div>
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-3xl flex items-center justify-center text-blue-500 shadow-[0_10px_25px_rgba(59,130,246,0.1)] border border-blue-50/50 relative z-10">
                      <i className="fa-solid fa-clock-rotate-left text-2xl sm:text-3xl animate-[spin_10s_linear_infinite]"></i>
                    </div>
                  </div>
                  
                  <div className="text-left relative z-10 flex-1">
                    <h3 className="text-[12px] sm:text-[16px] font-black text-slate-900 uppercase tracking-tight mb-1">Sistema em Standby</h3>
                    <p className="text-[9px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-[0.15em] leading-relaxed opacity-80">
                      Aguardando início da contagem pelo <span className="text-blue-600 font-black">Administrador</span>
                    </p>
                  </div>
                  
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce"></div>
                  </div>
                </div>
              )}
              
              <button 
                onClick={activeSession ? onResumeTraining : onStartTraining} 
                disabled={!generalTraining.isActive && !activeSession}
                className={`w-full py-10 sm:py-14 rounded-[40px] sm:rounded-[48px] shadow-[0_35px_60px_-15px_rgba(37,99,235,0.4)] text-white flex flex-row items-center justify-center gap-6 sm:gap-10 hover:scale-[1.02] active:scale-95 transition-all group border-8 border-white/90 ring-1 ring-blue-100 ${generalTraining.isRealScenario && generalTraining.isActive ? 'bg-rose-600 shadow-rose-600/40' : 'bg-blue-600'}`}
              >
                  <i className={`fa-solid ${activeSession ? 'fa-tower-broadcast animate-pulse' : (generalTraining.isRealScenario && generalTraining.isActive ? 'fa-triangle-exclamation animate-bounce' : 'fa-play')} text-5xl sm:text-6xl group-hover:rotate-12 transition-transform drop-shadow-lg`}></i>
                  <div className="text-left">
                      <div className="font-black text-2xl sm:text-4xl uppercase tracking-tighter drop-shadow-md leading-tight">
                        {activeSession ? 'Retomar Sessão' : (generalTraining.isRealScenario && generalTraining.isActive ? 'EMERGÊNCIA: INICIAR' : 'Iniciar Embarque')}
                      </div>
                      <div className="text-[11px] sm:text-[14px] opacity-80 uppercase font-black tracking-[0.2em] mt-1">
                        {activeSession ? activeSession.lifeboat : (generalTraining.isActive ? `CENÁRIO: ${generalTraining.trainingType}` : 'LIFESAFE ODN1')}
                      </div>
                  </div>
              </button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-[640px]">
              <button onClick={() => setIsPobConsultOpen(true)} className="flex items-center justify-center gap-4 px-8 py-6 bg-white rounded-[32px] border-4 border-slate-100 text-slate-900 hover:border-blue-600 hover:bg-blue-50 transition-all shadow-lg active:scale-95 group">
                  <div className="w-12 h-12 bg-slate-900 text-white rounded-[18px] flex items-center justify-center group-hover:bg-blue-600 transition-colors shadow-md">
                    <i className="fa-solid fa-users-viewfinder text-xl"></i>
                  </div>
                  <span className="font-black text-lg uppercase tracking-tighter">CONSULTAR POB</span>
              </button>

              <button onClick={() => { setIsTestNfcOpen(true); startNfcTest(); }} className="flex items-center justify-center gap-4 px-8 py-6 bg-white rounded-[32px] border-4 border-slate-100 text-slate-900 hover:border-emerald-600 hover:bg-emerald-50 transition-all shadow-lg active:scale-95 group">
                  <div className="w-12 h-12 bg-emerald-600 text-white rounded-[18px] flex items-center justify-center group-hover:bg-emerald-700 transition-colors shadow-md">
                    <i className="fa-solid fa-id-card text-xl"></i>
                  </div>
                  <span className="font-black text-lg uppercase tracking-tighter">LER/TESTAR CARTÃO</span>
              </button>
            </div>
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
                    
                    <div className="flex flex-col items-end">
                      {isActive && user.isAdmin && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); setLbToReset(lb); }}
                          disabled={isSaving}
                          className="w-8 h-8 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mb-2 hover:bg-rose-100 transition-colors shadow-sm active:scale-90 disabled:opacity-50"
                          title="Encerrar Imediatamente"
                        >
                          <i className="fa-solid fa-power-off text-[10px]"></i>
                        </button>
                      )}
                      {isManual ? (
                        <div className="flex items-center gap-2 bg-white/50 p-1 rounded-full border border-amber-200">
                           <button onClick={() => updateLifeboatManualCount(lb, -1)} className="w-8 h-8 rounded-full flex items-center justify-center bg-white text-amber-600 shadow-sm active:scale-90 transition-all border border-amber-100"><i className="fa-solid fa-minus text-[10px]"></i></button>
                           <input 
                              type="number" 
                              value={countToDisplay === 0 ? '' : countToDisplay} 
                              onChange={(e) => setLifeboatManualCountAbsolute(lb, e.target.value)}
                              className="text-2xl font-black text-amber-900 tabular-nums w-12 text-center bg-transparent border-none outline-none focus:ring-0"
                           />
                           <button onClick={() => updateLifeboatManualCount(lb, 1)} className="w-8 h-8 rounded-full flex items-center justify-center bg-white text-amber-600 shadow-sm active:scale-90 transition-all border border-amber-100"><i className="fa-solid fa-plus text-[10px]"></i></button>
                        </div>
                      ) : (
                        <div onClick={() => isActive && !isManual && onViewLifeboat(lb)} className={`text-right ${isActive ? 'cursor-pointer' : 'cursor-default'}`}>
                          <span className="text-3xl font-black text-slate-900 tabular-nums leading-none">{countToDisplay}</span>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">PESSOAS</p>
                        </div>
                      )}
                    </div>
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

      {/* Confirmation Modal for Lifeboat Force Reset */}
      {lbToReset && (
        <div className="fixed inset-0 z-[300] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[40px] max-md w-full p-8 sm:p-10 shadow-2xl animate-in zoom-in duration-300 border border-slate-100">
            <div className="w-20 h-20 bg-rose-50 rounded-[28px] flex items-center justify-center text-rose-600 mx-auto mb-8 shadow-inner">
              <i className="fa-solid fa-power-off text-3xl"></i>
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">Desligar {lbToReset}?</h3>
            <p className="text-slate-500 text-[10px] font-bold uppercase mb-8 leading-relaxed">
              Isso interromperá a contagem imediatamente e deixará a baleeira disponível para seleção. NENHUM registro será salvo.
            </p>
            <div className="grid gap-3">
              <button 
                onClick={handleForceResetLifeboat} 
                disabled={isSaving}
                className="w-full py-5 bg-rose-600 text-white font-black rounded-3xl text-[11px] uppercase tracking-widest shadow-xl shadow-rose-600/20 active:scale-95 transition-all border border-rose-400/30 disabled:opacity-50"
              >
                {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : 'Confirmar Encerramento'}
              </button>
              <button onClick={() => setLbToReset(null)} disabled={isSaving} className="w-full py-5 bg-slate-50 text-slate-400 font-black rounded-3xl text-[11px] uppercase tracking-widest active:scale-95 transition-all">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Release Crew Selection Modal */}
      {(isReleaseModalOpen || isReturnModalOpen) && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 lg:p-6">
          <div className="bg-white rounded-[24px] sm:rounded-[40px] max-w-4xl w-full p-4 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.2)] animate-in zoom-in duration-300 flex flex-col h-[90vh] border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter">
                  {isReleaseModalOpen ? 'Liberar Tripulantes' : 'Retornar Tripulantes'}
                </h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1 opacity-70">
                  {isReleaseModalOpen ? 'Escolha quem ficará fora da contagem de baleeira' : 'Escolha quem retornará para a contagem normal'}
                </p>
              </div>
              <button 
                onClick={() => { setIsReleaseModalOpen(false); setIsReturnModalOpen(false); setSelectedForAction(new Set()); }} 
                className="w-12 h-12 bg-slate-50 rounded-2xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all flex items-center justify-center shadow-sm border border-slate-100"
              >
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>

            <div className="relative mb-6">
              <div className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-blue-500 bg-blue-50 rounded-lg">
                <i className="fa-solid fa-magnifying-glass text-xs"></i>
              </div>
              <input 
                type="text" 
                placeholder="BUSCAR NOME, FUNÇÃO OU LEITO..." 
                className="w-full pl-14 pr-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-[20px] text-[11px] font-black uppercase focus:border-blue-500 focus:bg-white outline-none transition-all shadow-inner" 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
              />
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-6 space-y-3">
              {(isReleaseModalOpen ? availableToRelease : currentlyReleased).length === 0 ? (
                <div className="py-20 text-center text-slate-300">
                   <i className="fa-solid fa-users-slash text-5xl mb-4 opacity-20"></i>
                   <p className="text-[11px] font-black uppercase tracking-widest">Nenhum tripulante disponível</p>
                </div>
              ) : (
                (isReleaseModalOpen ? availableToRelease : currentlyReleased).map(b => {
                  const isSelected = selectedForAction.has(b.id);
                  return (
                    <div 
                      key={b.id} 
                      onClick={() => toggleSelection(b.id)}
                      className={`p-4 rounded-[24px] border-2 cursor-pointer transition-all flex items-center justify-between gap-4 ${isSelected ? 'border-blue-600 bg-blue-50/30 shadow-md' : 'border-slate-100 bg-white hover:border-slate-200'}`}
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                         <div className={`w-12 h-10 rounded-xl flex items-center justify-center text-[11px] font-mono font-black ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-900 text-white'}`}>
                           {b.id}
                         </div>
                         <div className="min-w-0">
                           <h4 className="text-[13px] font-black uppercase truncate">{b.crewName}</h4>
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate">{b.role || '-'} • {b.company || '-'}</p>
                         </div>
                      </div>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 bg-white'}`}>
                        {isSelected && <i className="fa-solid fa-check text-[10px]"></i>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-auto pt-6 border-t border-slate-100">
              <button 
                onClick={isReleaseModalOpen ? handleConfirmRelease : handleConfirmReturn} 
                disabled={selectedForAction.size === 0 || isSaving}
                className={`w-full py-5 rounded-[24px] font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 ${selectedForAction.size === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : (isReleaseModalOpen ? 'bg-blue-600 text-white shadow-blue-600/20' : 'bg-emerald-600 text-white shadow-emerald-600/20')}`}
              >
                {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className={`fa-solid ${isReleaseModalOpen ? 'fa-arrow-right-from-bracket' : 'fa-arrow-right-to-bracket'}`}></i>}
                {isReleaseModalOpen ? `Liberar ${selectedForAction.size} Selecionados` : `Retornar ${selectedForAction.size} Selecionados`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NFC Test Modal */}
      {isTestNfcOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] max-lg w-full p-8 shadow-2xl animate-in zoom-in duration-300 border border-slate-100 overflow-hidden">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Testar Cartão NFC</h3>
              <button onClick={closeNfcTest} className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors">
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>

            <div className="space-y-8">
              {!testTagResult ? (
                <div className="text-center py-10 space-y-6">
                  <div className="relative inline-block">
                    <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-30"></div>
                    <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-[32px] flex items-center justify-center mx-auto shadow-inner relative z-10">
                      <i className="fa-solid fa-wifi text-4xl animate-pulse"></i>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-slate-800 uppercase mb-2">Aguardando Cartão...</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Aproxime a TAG do leitor NFC do dispositivo</p>
                  </div>
                  {nfcTestState === 'error' && (
                    <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-[10px] font-black uppercase shadow-sm">
                      Falha ao acessar o leitor NFC. Certifique-se de que o NFC está ativo.
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6 animate-in slide-in-from-bottom-4">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-[32px] p-8 text-center relative overflow-hidden group">
                    <i className="fa-solid fa-id-card absolute top-[-20px] left-[-20px] text-[100px] text-emerald-500/5 rotate-12 pointer-events-none"></i>
                    
                    <div className="relative z-10">
                      <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-emerald-600 mx-auto mb-4 shadow-sm">
                        <i className="fa-solid fa-check text-2xl"></i>
                      </div>
                      <h4 className="text-2xl font-black text-emerald-900 uppercase tracking-tight mb-1">
                        {testTagResult.crewName || 'CARTÃO NÃO VINCULADO'}
                      </h4>
                      <p className="text-[10px] font-black text-emerald-600/60 uppercase tracking-widest">DADOS IDENTIFICADOS NO SISTEMA</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex justify-between items-center">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">ID DA TAG</span>
                      <span className="text-xs font-mono font-black text-slate-900">{testTagResult.tagId}</span>
                    </div>
                    {testTagResult.berthId && (
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex justify-between items-center">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">LEITO/BERTH</span>
                        <span className="text-xs font-black text-slate-900">{testTagResult.berthId}</span>
                      </div>
                    )}
                    {testTagResult.role && (
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex justify-between items-center">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">FUNÇÃO</span>
                        <span className="text-xs font-black text-slate-900">{testTagResult.role}</span>
                      </div>
                    )}
                    {testTagResult.company && (
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex justify-between items-center">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">EMPRESA</span>
                        <span className="text-xs font-black text-slate-900">{testTagResult.company}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button onClick={() => { setTestTagResult(null); startNfcTest(); }} className="flex-1 py-4 bg-slate-900 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">
                      <i className="fa-solid fa-rotate-right mr-2"></i> Ler Outro
                    </button>
                    <button onClick={() => setTestTagResult(null)} className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl text-[10px] uppercase tracking-widest active:scale-95 transition-all">
                      <i className="fa-solid fa-eraser mr-2"></i> Limpar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isPobConsultOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 lg:p-6">
          <div className="bg-white rounded-[24px] sm:rounded-[40px] max-w-7xl w-full p-3 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.2)] animate-in zoom-in duration-300 flex flex-col h-[95vh] sm:max-h-[90vh] border border-slate-100">
            
            <div className="flex justify-between items-center mb-4 sm:mb-6 px-1 sm:px-2">
              <div className="min-w-0">
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter truncate">Consulta de POB</h3>
                <p className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1 truncate opacity-70">Lista Geral Ordenada por Nome</p>
              </div>
              <button 
                onClick={() => { setIsPobConsultOpen(false); setSearchTerm(''); }} 
                className="w-12 h-12 sm:w-14 sm:h-14 bg-slate-50 rounded-2xl text-slate-400 active:scale-95 hover:text-rose-500 hover:bg-rose-50 transition-all flex items-center justify-center shadow-sm flex-shrink-0 border border-slate-100"
              >
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            
            <div className="relative mb-5 sm:mb-8 px-1 sm:px-2">
              <div className="absolute left-6 sm:left-9 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-blue-500 bg-blue-50 rounded-lg">
                <i className="fa-solid fa-magnifying-glass text-xs"></i>
              </div>
              <input 
                type="text" 
                placeholder="BUSCAR NOME, FUNÇÃO, LEITO OU EMPRESA..." 
                className="w-full pl-14 sm:pl-16 pr-6 py-5 sm:py-6 bg-slate-50 border-2 border-slate-100 rounded-[20px] sm:rounded-[24px] text-[11px] sm:text-[12px] font-black uppercase focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white outline-none transition-all shadow-inner placeholder:text-slate-300" 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
              />
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-1 sm:px-2 pb-6">
              {sortedPobList.length === 0 ? (
                <div className="py-24 text-center text-slate-300 bg-slate-50/30 rounded-3xl border-2 border-dashed border-slate-100">
                  <i className="fa-solid fa-users-slash text-5xl mb-4 block opacity-20"></i>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em]">Nenhum tripulante encontrado</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:hidden pb-4">
                    {sortedPobList.map((b) => {
                      const isOccupied = b.crewName && b.crewName.trim() !== '';
                      return (
                        <div key={b.id} className={`bg-white border-2 p-5 rounded-[28px] shadow-sm space-y-4 transition-all hover:shadow-md ${isOccupied ? 'border-slate-100' : 'border-slate-100 opacity-50 bg-slate-50/30'}`}>
                          <div className="flex justify-between items-start gap-4">
                             <div className="min-w-0 flex-1">
                               <div className="flex items-center gap-2 mb-1.5">
                                 <h4 className={`text-[13px] font-black uppercase leading-tight truncate ${isOccupied ? 'text-slate-900' : 'text-slate-400'}`}>
                                   {isOccupied ? b.crewName : '--- VAZIO ---'}
                                 </h4>
                               </div>
                               <div className="space-y-1">
                                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-tight truncate flex items-center gap-1.5">
                                   <i className="fa-solid fa-briefcase text-[8px] opacity-40"></i>
                                   {isOccupied ? b.role || '-' : '-'}
                                 </p>
                                 <p className="text-[10px] font-black text-blue-600 uppercase tracking-tight truncate flex items-center gap-1.5">
                                   <i className="fa-solid fa-building text-[8px] opacity-40"></i>
                                   {isOccupied ? b.company || '-' : '-'}
                                 </p>
                               </div>
                             </div>
                             <div className="flex flex-col items-end gap-2 flex-shrink-0">
                               <span className="bg-slate-900 text-white px-3 py-2 rounded-xl text-[11px] font-mono font-black shadow-md">{b.id}</span>
                               <span className={`text-[8px] font-black px-2 py-1 rounded-lg uppercase tracking-widest border-2 ${isOccupied ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                                 {isOccupied ? 'OCUPADO' : 'LIVRE'}
                               </span>
                             </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-50">
                            <div className="flex flex-col gap-1.5">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">PRIMÁRIA</span>
                              <div className={`text-[11px] font-black py-2 rounded-xl border-2 text-center uppercase tracking-tighter shadow-sm flex items-center justify-center gap-1.5 ${b.lifeboat ? 'bg-white text-emerald-600 border-emerald-500' : 'bg-slate-50 text-slate-300 border-slate-100'}`}>
                                {b.lifeboat && <i className="fa-solid fa-ship text-[8px]"></i>}
                                {b.lifeboat ? b.lifeboat.replace(/\D/g, '') : '---'}
                              </div>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">SECUNDÁRIA</span>
                              <div className={`text-[11px] font-black py-2 rounded-xl border-2 text-center uppercase tracking-tighter shadow-sm flex items-center justify-center gap-1.5 ${b.secondaryLifeboat ? 'bg-white text-indigo-600 border-indigo-500' : 'bg-slate-50 text-slate-300 border-slate-100'}`}>
                                {b.secondaryLifeboat && <i className="fa-solid fa-ship text-[8px]"></i>}
                                {b.secondaryLifeboat ? b.secondaryLifeboat.replace(/\D/g, '') : '---'}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden lg:block min-w-full bg-white rounded-[32px] border-2 border-slate-100 shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-md z-20 border-b-2 border-slate-200">
                        <tr>
                          <th className="px-6 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.15em]">Leito</th>
                          <th className="px-6 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.15em]">Nome Completo</th>
                          <th className="px-6 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.15em]">Função</th>
                          <th className="px-6 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.15em]">Empresa</th>
                          <th className="px-6 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] text-center">PRIMÁRIA</th>
                          <th className="px-6 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] text-center">SECUNDÁRIA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y-2 divide-slate-50">
                        {sortedPobList.map((b) => (
                          <tr key={b.id} className="hover:bg-blue-50/40 transition-colors group/row">
                            <td className="px-6 py-5 whitespace-nowrap">
                              <span className="bg-slate-900 text-white px-3.5 py-2 rounded-xl text-[11px] font-mono font-black shadow-md inline-block group-hover/row:scale-105 transition-transform">{b.id}</span>
                            </td>
                            <td className="px-6 py-5 min-w-0">
                              <p className="text-[12px] font-black text-slate-900 uppercase leading-none group-hover/row:text-blue-700 transition-colors truncate">{b.crewName || '--- VAZIO ---'}</p>
                            </td>
                            <td className="px-6 py-5">
                              <p className="text-[10px] font-black text-slate-500 uppercase tracking-tight truncate">{b.role || '-'}</p>
                            </td>
                            <td className="px-6 py-5">
                              <p className="text-[10px] font-black text-blue-600 uppercase tracking-tight truncate">{b.company || '-'}</p>
                            </td>
                            <td className="px-6 py-5 text-center">
                              <span className={`text-[10px] font-black px-4 py-2 rounded-full border-2 uppercase tracking-tighter shadow-sm inline-block min-w-[60px] ${b.lifeboat ? 'bg-white text-emerald-600 border-emerald-500' : 'bg-slate-50 text-slate-200 border-slate-100'}`}>
                                {b.lifeboat ? b.lifeboat.replace(/\D/g, '') : '---'}
                              </span>
                            </td>
                            <td className="px-6 py-5 text-center">
                              <span className={`text-[10px] font-black px-4 py-2 rounded-full border-2 uppercase tracking-tighter shadow-sm inline-block min-w-[60px] ${b.secondaryLifeboat ? 'bg-white text-indigo-600 border-indigo-500' : 'bg-slate-50 text-slate-200 border-slate-100'}`}>
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
            
            <div className="mt-auto pt-4 sm:pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between px-1 sm:px-2 gap-4 sm:gap-0">
              <div className="flex gap-5 sm:gap-8 w-full sm:w-auto justify-center sm:justify-start">
                 <div className="flex items-center gap-2.5">
                   <div className="w-3 h-3 bg-blue-600 rounded-full shadow-[0_0_8px_rgba(37,99,235,0.4)]"></div>
                   <span className="text-[10px] font-black text-slate-900 uppercase tracking-[0.1em]">POB Total: {sortedPobList.length}</span>
                 </div>
                 <div className="flex items-center gap-2.5">
                   <div className="w-3 h-3 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.4)]"></div>
                   <span className="text-[10px] font-black text-slate-900 uppercase tracking-[0.1em]">A Bordo: {sortedPobList.filter(x => x.crewName && x.crewName.trim() !== '').length}</span>
                 </div>
              </div>
            </div>
          </div>
        </div>
      )}

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

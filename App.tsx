
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, LifeboatType, User, LifeboatStatus, TrainingRecord, ActiveSession, ScannedTag, Berth } from './types';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import LifeboatSelection from './components/LifeboatSelection';
import TrainingSession from './components/TrainingSession';
import History from './components/History';
import TrainingConfig from './components/TrainingConfig';
import UserManagement from './components/UserManagement';
import NfcEnrollment from './components/NfcEnrollment';
import BerthManagement from './components/BerthManagement';
import { cloudService } from './services/cloudService';
import { generateTrainingSummary } from './services/geminiService';

const INITIAL_STATUS: Record<LifeboatType, LifeboatStatus> = {
  'Lifeboat 1': { count: 0, isActive: false },
  'Lifeboat 2': { count: 0, isActive: false },
  'Lifeboat 3': { count: 0, isActive: false },
  'Lifeboat 4': { count: 0, isActive: false },
  'Lifeboat 5': { count: 0, isActive: false },
  'Lifeboat 6': { count: 0, isActive: false },
};

const App: React.FC = () => {
  // Lazy initializers for synchronous state loading
  const [currentPage, setCurrentPage] = useState<AppState>(() => {
    const saved = localStorage.getItem('lifesafe_current_page');
    const user = localStorage.getItem('lifesafe_user');
    return user ? (saved as AppState || AppState.DASHBOARD) : AppState.LOGIN;
  });

  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('lifesafe_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [activeSession, setActiveSession] = useState<ActiveSession | null>(() => {
    const saved = localStorage.getItem('lifesafe_active_session');
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!parsed.isPaused && parsed.startTime) {
      const elapsed = Math.floor((Date.now() - parsed.startTime) / 1000);
      parsed.seconds = (parsed.accumulatedSeconds || 0) + elapsed;
    }
    return parsed;
  });

  const [fleetStatus, setFleetStatus] = useState<Record<LifeboatType, LifeboatStatus>>(INITIAL_STATUS);
  const [history, setHistory] = useState<TrainingRecord[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isConfirmingLogout, setIsConfirmingLogout] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [generalMusterStatus, setGeneralMusterStatus] = useState<{
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
  } | null>(null);
  const [tempConfig, setTempConfig] = useState<{trainingType: 'Gás' | 'Fogo/Abandono', isRealScenario: boolean} | null>(() => {
    const saved = localStorage.getItem('lifesafe_temp_config');
    return saved ? JSON.parse(saved) : null;
  });

  const activeSessionRef = useRef<ActiveSession | null>(activeSession);
  const isInitializingRef = useRef<boolean>(true);
  const fleetStatusRef = useRef<Record<LifeboatType, LifeboatStatus>>(INITIAL_STATUS);

  useEffect(() => {
    activeSessionRef.current = activeSession;
    if (activeSession) {
      localStorage.setItem('lifesafe_active_session', JSON.stringify(activeSession));
    } else {
      localStorage.removeItem('lifesafe_active_session');
    }
  }, [activeSession]);

  useEffect(() => {
    fleetStatusRef.current = fleetStatus;
  }, [fleetStatus]);

  const formatDuration = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const loadHistoryData = async () => {
    try {
      const cloudHistory = await cloudService.getHistory();
      setHistory(cloudHistory);
    } catch (e) { console.error(e); }
  };

  const finishSession = useCallback(async () => {
    const localActiveSession = activeSessionRef.current;
    if (localActiveSession && !localActiveSession.isAdminView) {
      const finalStatus: LifeboatStatus = { count: 0, isActive: false, tags: [], seconds: 0 };
      await cloudService.updateSingleLifeboatStatus(localActiveSession.lifeboat, finalStatus);
    }
    setActiveSession(null); 
    setTempConfig(null); 
    setCurrentPage(AppState.DASHBOARD);
  }, []);

  useEffect(() => {
    let unsubscribeFleet: () => void;
    let unsubscribeGeneralMuster: () => void;

    const initData = async () => {
      setIsSyncing(true);
      await loadHistoryData();

      unsubscribeGeneralMuster = cloudService.subscribeToGeneralMusterTraining((data) => {
        setGeneralMusterStatus(data);
        const localActiveSession = activeSessionRef.current;
        
        // Regra de retorno automático: Se o exercício NÃO estiver ativo e NÃO estiver em estado de "Finalizado (aguardando salvar)", reseta o operador.
        if (data && data.isActive === false && data.isFinished === false && localActiveSession && !localActiveSession.isAdminView) {
          finishSession();
        }
      });

      unsubscribeFleet = cloudService.subscribeToFleet((updatedStatusFromCloud) => {
        const mergedStatus = { ...INITIAL_STATUS, ...updatedStatusFromCloud };
        const localActiveSession = activeSessionRef.current;
        
        if (localActiveSession && !isInitializingRef.current) {
          const remoteStatus = mergedStatus[localActiveSession.lifeboat];
          
          if (remoteStatus && !remoteStatus.isActive && !localActiveSession.isAdminView) {
            // Se o status da baleeira foi resetado remotamente e não estamos no modo admin, fechar a sessão.
            setActiveSession(null);
            if (currentPage === AppState.TRAINING) setCurrentPage(AppState.DASHBOARD);
          } else if (remoteStatus && localActiveSession.isAdminView) {
            // Only sync back if we are viewing as admin to avoid state fighting
            setActiveSession(prev => {
              if (!prev) return null;
              let currentSeconds = remoteStatus.seconds || 0;
              if (!remoteStatus.isPaused && remoteStatus.startTime) {
                const elapsed = Math.floor((Date.now() - remoteStatus.startTime) / 1000);
                currentSeconds = (remoteStatus.accumulatedSeconds || 0) + elapsed;
              }
              return { ...prev, tags: remoteStatus.tags || [], seconds: currentSeconds, isPaused: remoteStatus.isPaused || false };
            });
          }
        }
        setFleetStatus(mergedStatus);
      });

      setTimeout(() => { isInitializingRef.current = false; setIsSyncing(false); }, 1000);
    };
    initData();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => { 
      if (unsubscribeFleet) unsubscribeFleet();
      if (unsubscribeGeneralMuster) unsubscribeGeneralMuster();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [finishSession, currentPage]);

  useEffect(() => {
    if (currentPage !== AppState.LOGIN) {
      localStorage.setItem('lifesafe_current_page', currentPage);
    }
  }, [currentPage]);

  useEffect(() => {
    if (tempConfig) {
      localStorage.setItem('lifesafe_temp_config', JSON.stringify(tempConfig));
    } else {
      localStorage.removeItem('lifesafe_temp_config');
    }
  }, [tempConfig]);

  // Sync state to cloud effect (optimized: removed seconds from dependency to prevent flicker)
  useEffect(() => {
    const syncToCloud = async () => {
      const localActive = activeSessionRef.current;
      if (!localActive || localActive.isAdminView || isInitializingRef.current) return;
      
      const update: LifeboatStatus = {
        count: localActive.tags.length,
        tags: localActive.tags,
        seconds: localActive.seconds,
        startTime: localActive.startTime,
        accumulatedSeconds: localActive.accumulatedSeconds,
        isPaused: localActive.isPaused,
        isActive: true,
        isRealScenario: localActive.isRealScenario,
        leaderName: localActive.leaderName,
        trainingType: localActive.trainingType,
        operatorName: user?.name || 'Sistema'
      };
      try { 
        await cloudService.updateSingleLifeboatStatus(localActive.lifeboat, update); 
      } catch (e) { console.error(e); }
    };
    syncToCloud();
  }, [activeSession?.tags.length, activeSession?.isPaused]); // Only sync on these critical changes

  const processNewScan = useCallback((tagId: string, tagData: string) => {
    if (!tagId) return;
    setActiveSession(prev => {
      if (!prev || prev.isPaused || prev.isAdminView) return prev;
      if (prev.tags.some(t => t.id === tagId)) return prev;

      const matchedBerth = prev.expectedCrew?.find(b => 
        (b.tagId1 && b.tagId1.trim().toLowerCase() === tagId.trim().toLowerCase()) ||
        (b.tagId2 && b.tagId2.trim().toLowerCase() === tagId.trim().toLowerCase()) ||
        (b.tagId3 && b.tagId3.trim().toLowerCase() === tagId.trim().toLowerCase())
      );
      
      if (!matchedBerth) return prev; 
      if (prev.tags.some(t => t.leito === matchedBerth.id)) return prev;

      const newTag: ScannedTag = { 
        id: tagId, 
        timestamp: new Date().toLocaleTimeString('pt-BR'), 
        data: tagData || tagId, 
        name: matchedBerth.crewName, 
        role: matchedBerth.role || 'TRIPULANTE',
        company: matchedBerth.company || 'N/A',
        leito: matchedBerth.id
      };

      return { ...prev, tags: [newTag, ...prev.tags] };
    });
  }, []);

  const removeTag = useCallback((tagId: string) => {
    setActiveSession(prev => prev ? { ...prev, tags: prev.tags.filter(t => t.id !== tagId) } : null);
  }, []);

  useEffect(() => {
    let timerInterval: number | undefined;
    if (activeSession && !activeSession.isPaused && !activeSession.isAdminView) {
      timerInterval = window.setInterval(() => {
        setActiveSession(prev => {
          if (!prev || prev.isPaused) return prev;
          const elapsed = Math.floor((Date.now() - prev.startTime) / 1000);
          return { ...prev, seconds: prev.accumulatedSeconds + elapsed };
        });
      }, 1000);
    }
    return () => clearInterval(timerInterval);
  }, [activeSession?.isPaused, activeSession?.startTime]);

  const startTrainingSession = async (lb: LifeboatType) => {
    setIsSyncing(true);
    try {
      const allBerths = await cloudService.getBerths();
      const expectedCrew = allBerths.filter(b => b.lifeboat === lb || b.secondaryLifeboat === lb);
      
      const ns: ActiveSession = { 
        lifeboat: lb, 
        leaderName: user?.name || 'Operador', 
        trainingType: tempConfig?.trainingType || 'Fogo/Abandono', 
        isRealScenario: tempConfig?.isRealScenario || false, 
        tags: [], seconds: 0, startTime: Date.now(), 
        accumulatedSeconds: 0, isPaused: false,
        expectedCrew: expectedCrew
      };
      setActiveSession(ns);
      setCurrentPage(AppState.TRAINING);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogin = (userData: User) => {
    setUser(userData);
    localStorage.setItem('lifesafe_user', JSON.stringify(userData));
    setCurrentPage(AppState.DASHBOARD);
  };

  const saveToHistory = async (recordData: Omit<TrainingRecord, 'id' | 'operator'>) => {
    setIsSyncing(true);
    let finalType = recordData.trainingType;
    if (!finalType.includes('SIMULADO:') && !finalType.includes('EMERGÊNCIA:')) {
      finalType = `${recordData.isRealScenario ? 'EMERGÊNCIA' : 'SIMULADO'}: ${recordData.trainingType}`;
    }
    const newRecord: TrainingRecord = { 
      ...recordData, 
      trainingType: finalType,
      id: crypto.randomUUID(), 
      operator: user?.name || 'Sistema', 
      tags: activeSession?.tags || recordData.tags || [] 
    };
    await cloudService.saveTrainingRecord(newRecord);
    await loadHistoryData();
    setIsSyncing(false);
  };

  const handleLogout = async () => {
    setIsSyncing(true);

    // Se for administrador e houver um treinamento geral ativo, finaliza e salva antes de sair
    if (user?.isAdmin && generalMusterStatus?.isActive) {
      try {
        const manualCounts = await cloudService.getManualCounters();
        
        let allTags: ScannedTag[] = [];
        const lbBreakdown: Record<string, { count: number; tags: ScannedTag[] }> = {};
        
        (Object.entries(fleetStatus) as [LifeboatType, LifeboatStatus][]).forEach(([lb, status]) => {
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

        const totalPeopleInFleet = (Object.values(fleetStatus) as LifeboatStatus[]).reduce((sum: number, status: LifeboatStatus) => {
          return sum + (status.isManualMode ? (status.manualCount || 0) : (status.tags?.length || 0));
        }, 0);

        const totalManualGroups = (Object.values(manualCounts) as number[]).reduce((sum: number, val: number) => sum + (val || 0), 0);
        const overallMusterTotal = totalPeopleInFleet + totalManualGroups;

        const now = new Date();
        const endTimeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        let finalDuration = generalMusterStatus.duration;
        if (generalMusterStatus.isActive && generalMusterStatus.startTimestamp) {
          const elapsed = Math.floor((Date.now() - generalMusterStatus.startTimestamp) / 1000);
          finalDuration = formatDuration(elapsed);
        }

        const aiSummary = await generateTrainingSummary('FROTA COMPLETA', overallMusterTotal, finalDuration);

        const record: TrainingRecord = {
          id: crypto.randomUUID(),
          date: new Date().toLocaleString('pt-BR'),
          lifeboat: 'FROTA COMPLETA',
          leaderName: user?.name || 'Operador',
          trainingType: generalMusterStatus.isRealScenario ? `EMERGÊNCIA: ${generalMusterStatus.trainingType}` : `SIMULADO: ${generalMusterStatus.trainingType}`,
          isRealScenario: generalMusterStatus.isRealScenario || false,
          crewCount: overallMusterTotal,
          duration: finalDuration,
          summary: `FINALIZADO VIA LOGOUT ADMIN. ${generalMusterStatus.description ? `MOTIVO/LOCAL: ${generalMusterStatus.description}. ` : ''}${aiSummary}`,
          operator: user?.name || 'Sistema',
          tags: allTags,
          ertCounts: manualCounts,
          lifeboatBreakdown: lbBreakdown,
          startTime: generalMusterStatus.startTime,
          endTime: endTimeStr
        };

        await cloudService.saveTrainingRecord(record);
        await cloudService.finalizeEverythingGlobally();
      } catch (e) {
        console.error("Erro ao finalizar treinamento no logout:", e);
      }
    }

    if (activeSession && !activeSession.isAdminView) {
      try {
        await saveToHistory({ 
          date: new Date().toLocaleString('pt-BR'), lifeboat: activeSession.lifeboat, 
          leaderName: activeSession.leaderName, trainingType: activeSession.trainingType, 
          isRealScenario: activeSession.isRealScenario, crewCount: activeSession.tags.length, 
          duration: formatDuration(activeSession.seconds), summary: "Logout interrompido", tags: activeSession.tags 
        });
        const finalStatus: LifeboatStatus = { count: 0, isActive: false };
        await cloudService.updateSingleLifeboatStatus(activeSession.lifeboat, finalStatus);
      } catch (e) { console.error(e); }
    }
    setUser(null); 
    setActiveSession(null); 
    setTempConfig(null); 
    setFleetStatus(INITIAL_STATUS); 
    localStorage.clear(); 
    setIsConfirmingLogout(false);
    setCurrentPage(AppState.LOGIN); 
    setIsSyncing(false);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col">
      {currentPage === AppState.LOGIN && <Login onLogin={handleLogin} />}
      {currentPage !== AppState.LOGIN && (
        <header className="bg-white border-b border-slate-100 px-6 py-4 flex justify-between items-center sticky top-0 z-[70] shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center text-blue-600 font-bold text-lg shadow-sm">
              <i className="fa-solid fa-shield-halved"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm md:text-base font-black text-slate-800 leading-none uppercase tracking-tight">LIFEBOAT MUSTER</h1>
              </div>
            </div>
          </div>
          <button onClick={() => setIsConfirmingLogout(true)} className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"><i className="fa-solid fa-power-off"></i></button>
        </header>
      )}

      <main className={`flex-1 flex flex-col ${currentPage !== AppState.TRAINING && currentPage !== AppState.LOGIN ? 'pb-24' : ''}`}>
        {currentPage === AppState.DASHBOARD && <Dashboard onStartTraining={() => setCurrentPage(AppState.SELECTION)} onResumeTraining={() => setCurrentPage(AppState.TRAINING)} onViewLifeboat={async (lb) => { if(user?.isAdmin || user?.isSupervisor) { const s = fleetStatus[lb]; if(s?.isActive) { setIsSyncing(true); const allBerths = await cloudService.getBerths(); const expectedCrew = allBerths.filter(b => b.lifeboat === lb || b.secondaryLifeboat === lb); setActiveSession({ lifeboat: lb, leaderName: s.leaderName || 'Líder', trainingType: s.trainingType as any || 'Fogo/Abandono', isRealScenario: s.isRealScenario || false, tags: s.tags || [], seconds: s.seconds || 0, startTime: s.startTime || Date.now(), accumulatedSeconds: s.accumulatedSeconds || 0, isPaused: s.isPaused || false, isAdminView: true, expectedCrew: expectedCrew }); setCurrentPage(AppState.TRAINING); setIsSyncing(false); } } }} onOpenUserManagement={() => setCurrentPage(AppState.USER_MANAGEMENT)} onOpenBerthManagement={() => setCurrentPage(AppState.BERTH_MANAGEMENT)} user={user} fleetStatus={fleetStatus} historyCount={history.length} activeSession={activeSession} />}
        {currentPage === AppState.TRAINING_CONFIG && <TrainingConfig onSubmit={(type, isReal) => { setTempConfig({trainingType: type, isRealScenario: isReal}); setCurrentPage(AppState.SELECTION); }} onBack={() => setCurrentPage(AppState.DASHBOARD)} />}
        {currentPage === AppState.SELECTION && <LifeboatSelection onSelect={startTrainingSession} onBack={() => setCurrentPage(AppState.DASHBOARD)} fleetStatus={fleetStatus} />}
        {currentPage === AppState.HISTORY && <History records={history} onBack={() => setCurrentPage(AppState.DASHBOARD)} isAdmin={user?.isAdmin || user?.isSupervisor} onRefresh={loadHistoryData} />}
        {currentPage === AppState.USER_MANAGEMENT && <UserManagement onBack={() => setCurrentPage(AppState.DASHBOARD)} />}
        {currentPage === AppState.NFC_ENROLLMENT && <NfcEnrollment onBack={() => setCurrentPage(AppState.DASHBOARD)} />}
        {currentPage === AppState.BERTH_MANAGEMENT && <BerthManagement onBack={() => setCurrentPage(AppState.DASHBOARD)} user={user} />}
        {currentPage === AppState.TRAINING && activeSession && <TrainingSession session={activeSession} onFinish={finishSession} onMinimize={() => setCurrentPage(AppState.DASHBOARD)} onScanTag={processNewScan} onRemoveTag={removeTag} onTogglePause={(p) => setActiveSession(prev => prev ? (p ? { ...prev, isPaused: true, accumulatedSeconds: prev.seconds } : { ...prev, isPaused: false, startTime: Date.now() }) : null)} onSaveRecord={saveToHistory} operatorName={user?.name || 'Operador'} isAdminUser={user?.isAdmin || user?.isSupervisor} generalTrainingStatus={generalMusterStatus} />}
      </main>

      {user && currentPage !== AppState.LOGIN && currentPage !== AppState.TRAINING && (
        <nav className="fixed bottom-0 left-0 right-0 z-[80] bg-white border-t border-slate-100 flex items-center justify-around py-3 px-4 shadow-sm">
            <button onClick={() => setCurrentPage(AppState.DASHBOARD)} className={`flex flex-col items-center gap-1 transition-colors ${currentPage === AppState.DASHBOARD ? 'text-blue-600' : 'text-slate-400'}`}>
              <i className="fa-solid fa-house text-lg"></i>
              <span className="text-[9px] font-black uppercase">Início</span>
            </button>
            <button onClick={() => setCurrentPage(AppState.HISTORY)} className={`flex flex-col items-center gap-1 transition-colors ${currentPage === AppState.HISTORY ? 'text-blue-600' : 'text-slate-400'}`}>
              <i className="fa-solid fa-clock-rotate-left text-lg"></i>
              <span className="text-[9px] font-black uppercase">Histórico</span>
            </button>
            <div className={`flex flex-col items-center gap-1 ${isOnline ? 'text-emerald-500' : 'text-rose-500'}`}>
              <i className={`fa-solid ${isOnline ? 'fa-cloud' : 'fa-plane-slash'} text-lg`}></i>
              <span className="text-[9px] font-black uppercase">{isOnline ? 'CLOUD' : 'OFFLINE'}</span>
            </div>
        </nav>
      )}

      {isConfirmingLogout && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[32px] max-w-md w-full p-8 shadow-md border border-slate-100">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm"><i className="fa-solid fa-power-off text-2xl"></i></div>
            <h3 className="text-xl font-black mb-2 uppercase tracking-tight">Sair do Sistema?</h3>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-8">Sessões ativas serão salvas em nuvem.</p>
            <div className="grid gap-3">
              <button onClick={handleLogout} className="w-full py-4 bg-red-600 text-white font-black rounded-xl text-xs uppercase shadow-md active:scale-95 transition-all">Confirmar Logout</button>
              <button onClick={() => setIsConfirmingLogout(false)} className="w-full py-4 bg-slate-100 text-slate-700 font-black rounded-xl text-xs uppercase">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

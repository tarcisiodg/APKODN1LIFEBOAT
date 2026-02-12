
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, LifeboatType, User, LifeboatStatus, TrainingRecord, ActiveSession, ScannedTag } from './types';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import LifeboatSelection from './components/LifeboatSelection';
import TrainingSession from './components/TrainingSession';
import History from './components/History';
import TrainingConfig from './components/TrainingConfig';
import UserManagement from './components/UserManagement';
import { cloudService } from './services/cloudService';

const INITIAL_STATUS: Record<LifeboatType, LifeboatStatus> = {
  'Lifeboat 1': { count: 0, isActive: false },
  'Lifeboat 2': { count: 0, isActive: false },
  'Lifeboat 3': { count: 0, isActive: false },
  'Lifeboat 4': { count: 0, isActive: false },
  'Lifeboat 5': { count: 0, isActive: false },
  'Lifeboat 6': { count: 0, isActive: false },
};

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<AppState>(AppState.LOGIN);
  const [user, setUser] = useState<User | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [fleetStatus, setFleetStatus] = useState<Record<LifeboatType, LifeboatStatus>>(INITIAL_STATUS);
  const [history, setHistory] = useState<TrainingRecord[]>([]);
  const [isNfcAvailable, setIsNfcAvailable] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isConfirmingLogout, setIsConfirmingLogout] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [tempConfig, setTempConfig] = useState<{trainingType: 'Gás' | 'Fogo/Abandono', isRealScenario: boolean} | null>(null);

  const activeSessionRef = useRef<ActiveSession | null>(null);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  const formatDuration = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    let unsubscribeFleet: () => void;

    const initData = async () => {
      setIsSyncing(true);
      const savedUser = localStorage.getItem('lifesafe_user');
      if (savedUser) setUser(JSON.parse(savedUser));

      try {
        const cloudHistory = await cloudService.getHistory();
        setHistory(cloudHistory);
      } catch (e) { console.error("Firebase History Error:", e); }

      unsubscribeFleet = cloudService.subscribeToFleet((updatedStatusFromCloud) => {
        setFleetStatus(currentLocalStatus => {
          const mergedStatus = { ...INITIAL_STATUS, ...updatedStatusFromCloud };
          
          const localActiveSession = activeSessionRef.current;
          if (localActiveSession && !localActiveSession.isAdminView) {
            const remoteStatus = mergedStatus[localActiveSession.lifeboat];
            if (!remoteStatus?.isActive && localActiveSession.lifeboat) {
              setActiveSession(null);
              setCurrentPage(AppState.DASHBOARD);
              alert(`O exercício na ${localActiveSession.lifeboat} foi encerrado pelo Administrador.`);
            }
          }

          if (localActiveSession?.isAdminView) {
            const remoteData = mergedStatus[localActiveSession.lifeboat];
            if (remoteData) {
              setActiveSession(prev => prev ? {
                ...prev,
                tags: remoteData.tags || [],
                seconds: remoteData.seconds || 0,
                isPaused: remoteData.isPaused || false
              } : null);
            }
          }

          return mergedStatus;
        });
      });

      const savedSession = localStorage.getItem('lifesafe_active_session');
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        setActiveSession(parsed);
      }

      const savedPage = localStorage.getItem('lifesafe_current_page');
      if (savedPage && savedUser) setCurrentPage(savedPage as AppState);
      else if (savedUser) setCurrentPage(AppState.DASHBOARD);
      setIsSyncing(false);
    };

    initData();
    return () => { if (unsubscribeFleet) unsubscribeFleet(); };
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const syncToCloud = async () => {
      if (!activeSession || activeSession.isAdminView) return;
      
      const currentStatusUpdate = {
        ...fleetStatus,
        [activeSession.lifeboat]: {
          ...fleetStatus[activeSession.lifeboat],
          count: activeSession.tags.length,
          tags: activeSession.tags,
          seconds: activeSession.seconds,
          isPaused: activeSession.isPaused,
          isActive: true,
          isRealScenario: activeSession.isRealScenario,
          leaderName: activeSession.leaderName,
          trainingType: activeSession.trainingType,
          operatorName: user?.name || 'Sistema'
        }
      };

      try {
        await cloudService.updateFleetStatus(currentStatusUpdate);
      } catch (e) { console.error("Erro ao sincronizar tempo real:", e); }
    };

    syncToCloud();
  }, [activeSession?.tags.length, activeSession?.isPaused, activeSession?.seconds]);

  useEffect(() => {
    if (activeSession) localStorage.setItem('lifesafe_active_session', JSON.stringify(activeSession));
    else localStorage.removeItem('lifesafe_active_session');
  }, [activeSession]);

  useEffect(() => {
    if (currentPage !== AppState.LOGIN) localStorage.setItem('lifesafe_current_page', currentPage);
  }, [currentPage]);

  useEffect(() => {
    setIsNfcAvailable('NDEFReader' in window);
  }, []);

  const processNewScan = useCallback((tagId: string, tagData: string) => {
    if (!tagId) return;

    setActiveSession(prev => {
      if (!prev || prev.isPaused || prev.isAdminView) return prev;
      // Evita duplicatas se o ID já estiver na lista
      if (prev.tags.some(t => t.id === tagId)) return prev;

      const newTag: ScannedTag = { 
        id: tagId, 
        timestamp: new Date().toLocaleTimeString('pt-BR'), 
        data: tagData || "Tag de Identificação", 
        name: `Tripulante ${prev.tags.length + 1}`, 
        role: 'Crew ODN1' 
      };
      
      return { 
        ...prev, 
        tags: [newTag, ...prev.tags] 
      };
    });
  }, []);

  useEffect(() => {
    let timerInterval: number | undefined;
    if (activeSession && !activeSession.isPaused && !activeSession.isAdminView) {
      timerInterval = window.setInterval(() => {
        setActiveSession(prev => prev ? { ...prev, seconds: prev.seconds + 1 } : null);
      }, 1000);
    }
    return () => clearInterval(timerInterval);
  }, [activeSession?.isPaused, !!activeSession && !activeSession?.isAdminView]);

  const handleLogin = (userData: User) => {
    setUser(userData);
    localStorage.setItem('lifesafe_user', JSON.stringify(userData));
    setCurrentPage(AppState.DASHBOARD);
  };

  const saveToHistory = async (recordData: Omit<TrainingRecord, 'id' | 'operator'>) => {
    setIsSyncing(true);
    const newRecord: TrainingRecord = { ...recordData, id: crypto.randomUUID(), operator: user?.name || 'Sistema', tags: activeSession?.tags || recordData.tags || [] };
    await cloudService.saveTrainingRecord(newRecord);
    setHistory(await cloudService.getHistory());
    setIsSyncing(false);
  };

  const handleLogout = async () => {
    setIsSyncing(true);
    if (activeSession && !activeSession.isAdminView) {
      try {
        await saveToHistory({ date: new Date().toLocaleString('pt-BR'), lifeboat: activeSession.lifeboat, leaderName: activeSession.leaderName, trainingType: activeSession.trainingType, isRealScenario: activeSession.isRealScenario, crewCount: activeSession.tags.length, duration: formatDuration(activeSession.seconds), summary: "Encerrado via Logout.", tags: activeSession.tags });
        const finalFleet = { ...fleetStatus };
        finalFleet[activeSession.lifeboat] = { count: 0, isActive: false };
        await cloudService.updateFleetStatus(finalFleet);
      } catch (e) { console.error(e); }
    }
    setUser(null); setActiveSession(null); setFleetStatus(INITIAL_STATUS); setIsConfirmingLogout(false);
    localStorage.clear(); setCurrentPage(AppState.LOGIN); setIsSyncing(false);
  };

  const finishSession = async () => {
    if (activeSession) {
      const finalFleet = { ...fleetStatus };
      finalFleet[activeSession.lifeboat] = { count: 0, isActive: false, tags: [], seconds: 0 };
      setFleetStatus(finalFleet);
      await cloudService.updateFleetStatus(finalFleet);
    }
    setActiveSession(null); setTempConfig(null);
    localStorage.removeItem('lifesafe_active_session');
    setCurrentPage(AppState.DASHBOARD);
  };

  const showFooter = user && 
    currentPage !== AppState.LOGIN && 
    currentPage !== AppState.TRAINING && 
    currentPage !== AppState.TRAINING_CONFIG &&
    currentPage !== AppState.SELECTION;

  const handleViewLifeboatFromDashboard = (lb: LifeboatType) => {
    if (activeSession?.lifeboat === lb) {
      setCurrentPage(AppState.TRAINING);
    } else if (user?.isAdmin && fleetStatus[lb]?.isActive) {
      const status = fleetStatus[lb];
      const viewSession: ActiveSession = {
        lifeboat: lb,
        leaderName: status.leaderName || 'Líder',
        trainingType: (status.trainingType as any) || 'Fogo/Abandono',
        isRealScenario: status.isRealScenario || false,
        tags: status.tags || [],
        seconds: status.seconds || 0,
        isPaused: status.isPaused || false,
        isAdminView: true
      };
      setActiveSession(viewSession);
      setCurrentPage(AppState.TRAINING);
    }
  };

  const handleStartOrResume = () => {
    if (activeSession) {
      setCurrentPage(AppState.TRAINING);
    } else {
      setCurrentPage(AppState.TRAINING_CONFIG);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col">
      <style>{`
        @keyframes pulse-slow {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.01); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }
      `}</style>

      {currentPage === AppState.LOGIN && <Login onLogin={handleLogin} />}
      
      {currentPage !== AppState.LOGIN && (
        <header className="bg-white/90 backdrop-blur-md px-6 py-4 flex justify-between items-center sticky top-0 z-[70] border-b border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#2563eb] rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-blue-600/20 text-xs">ODN1</div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm md:text-base font-black text-slate-800 leading-none uppercase tracking-tight">LIFESAFE ODN1</h1>
                {isSyncing && <i className="fa-solid fa-rotate animate-spin text-blue-400 text-[10px]"></i>}
              </div>
              <span className="text-[9px] text-slate-400 font-bold tracking-widest uppercase">NS-41 MUSTER</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeSession && currentPage !== AppState.TRAINING && (
              <button onClick={() => setCurrentPage(AppState.TRAINING)} className={`flex items-center gap-2 px-3 py-1.5 text-white text-[9px] font-black uppercase rounded-full animate-pulse shadow-lg ${activeSession.isRealScenario ? 'bg-red-600 shadow-red-600/20' : 'bg-blue-600 shadow-blue-600/20'}`}>
                <i className="fa-solid fa-clock"></i> EM ANDAMENTO
              </button>
            )}
            <button onClick={() => setIsConfirmingLogout(true)} className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors">
              <i className="fa-solid fa-power-off"></i>
            </button>
          </div>
        </header>
      )}

      <main className={`flex-1 flex flex-col ${showFooter ? 'pb-32' : ''}`}>
        {currentPage === AppState.DASHBOARD && (
          <Dashboard 
            onStartTraining={handleStartOrResume} 
            onViewLifeboat={handleViewLifeboatFromDashboard} 
            onOpenUserManagement={() => setCurrentPage(AppState.USER_MANAGEMENT)} 
            user={user} 
            fleetStatus={fleetStatus} 
            historyCount={history.length} 
            activeSession={activeSession} 
          />
        )}
        
        {currentPage === AppState.TRAINING_CONFIG && (
          <TrainingConfig 
            onSubmit={(type, isReal) => { 
              setTempConfig({trainingType: type, isRealScenario: isReal}); 
              setCurrentPage(AppState.SELECTION); 
            }} 
            onBack={() => setCurrentPage(AppState.DASHBOARD)} 
          />
        )}
        
        {currentPage === AppState.SELECTION && (
          <LifeboatSelection 
            onSelect={(lb) => { 
              if (!user) return;
              const type = tempConfig?.trainingType || 'Fogo/Abandono';
              const isReal = tempConfig?.isRealScenario || false;
              const ns: ActiveSession = { 
                lifeboat: lb, 
                leaderName: user.name, 
                trainingType: type, 
                isRealScenario: isReal,
                tags: [], 
                seconds: 0, 
                isPaused: false 
              }; 
              setActiveSession(ns); 
              setFleetStatus(p => ({ ...p, [lb]: { ...p[lb], isActive: true, leaderName: user.name, trainingType: type, isRealScenario: isReal, operatorName: user.name, tags: [], seconds: 0 }})); 
              setCurrentPage(AppState.TRAINING); 
            }} 
            onBack={() => setCurrentPage(AppState.TRAINING_CONFIG)} 
            fleetStatus={fleetStatus} 
          />
        )}
        
        {currentPage === AppState.HISTORY && <History records={history} onBack={() => setCurrentPage(AppState.DASHBOARD)} />}
        {currentPage === AppState.USER_MANAGEMENT && <UserManagement onBack={() => setCurrentPage(AppState.DASHBOARD)} />}
        
        {currentPage === AppState.TRAINING && activeSession && (
          <TrainingSession 
            session={activeSession} 
            onFinish={finishSession} 
            onMinimize={() => setCurrentPage(AppState.DASHBOARD)} 
            onScanTag={processNewScan} 
            onTogglePause={(p) => setActiveSession(prev => prev ? { ...prev, isPaused: p } : null)} 
            onSaveRecord={saveToHistory} 
            operatorName={user?.name || 'Operador'} 
          />
        )}
      </main>

      {showFooter && (
        <nav className="fixed bottom-6 left-6 right-6 z-[80] animate-in slide-in-from-bottom-10 duration-500">
          <div className="max-w-lg mx-auto bg-white/80 backdrop-blur-xl border border-white/20 p-2 rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.1)] flex items-stretch justify-center gap-1.5">
            <button onClick={() => setCurrentPage(AppState.DASHBOARD)} className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-[24px] transition-all ${currentPage === AppState.DASHBOARD ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 scale-105' : 'text-slate-400 hover:bg-slate-50'}`}>
              <i className="fa-solid fa-house text-sm"></i>
              <span className="text-[7px] font-black uppercase tracking-widest">Início</span>
            </button>
            <button onClick={() => setCurrentPage(AppState.HISTORY)} className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-[24px] transition-all ${currentPage === AppState.HISTORY ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-105' : 'text-slate-400 hover:bg-slate-50'}`}>
              <i className="fa-solid fa-clock-rotate-left text-sm"></i>
              <span className="text-[7px] font-black uppercase tracking-widest">Histórico</span>
            </button>
            <div className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-[24px] transition-all border ${isOnline ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-rose-50 border-rose-100 text-rose-600 animate-pulse'}`}>
              <i className={`fa-solid ${isOnline ? 'fa-cloud' : 'fa-plane-slash'} text-sm`}></i>
              <span className="text-[7px] font-black uppercase tracking-widest">{isOnline ? 'Cloud' : 'Offline'}</span>
            </div>
            <div className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-[24px] transition-all border ${isNfcAvailable ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-slate-100 border-slate-200 text-slate-300'}`}>
              <i className="fa-solid fa-id-card text-sm"></i>
              <span className="text-[7px] font-black uppercase tracking-widest">NFC</span>
            </div>
          </div>
        </nav>
      )}

      {isConfirmingLogout && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] max-sm w-full p-8 shadow-2xl animate-in zoom-in duration-200 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6"><i className="fa-solid fa-power-off text-2xl"></i></div>
            <h3 className="text-xl font-bold mb-2">Encerrar Sessão?</h3>
            <p className="text-slate-500 text-xs mb-8">O exercício ativo será salvo automaticamente.</p>
            <div className="grid gap-3">
              <button onClick={handleLogout} className="w-full py-4 bg-red-600 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-lg shadow-red-600/20">Sair</button>
              <button onClick={() => setIsConfirmingLogout(false)} className="w-full py-4 bg-slate-100 text-slate-700 font-black rounded-2xl text-[10px] uppercase tracking-widest">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

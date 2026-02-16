
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ActiveSession, TrainingRecord, ScannedTag, LifeboatType } from '../types';
import { generateTrainingSummary } from '../services/geminiService';
import { cloudService } from '../services/cloudService';

interface TrainingSessionProps {
  session: ActiveSession;
  onFinish: () => void;
  onMinimize: () => void;
  onScanTag: (id: string, data: string) => void;
  onRemoveTag: (id: string) => void;
  onTogglePause: (paused: boolean) => void;
  onSaveRecord: (record: Omit<TrainingRecord, 'id' | 'operator'>) => void;
  operatorName: string;
  isAdminUser?: boolean;
}

const LIFEBOATS: LifeboatType[] = ['Lifeboat 1', 'Lifeboat 2', 'Lifeboat 3', 'Lifeboat 4', 'Lifeboat 5', 'Lifeboat 6'];
const MANUAL_CATEGORIES = [
  'PONTE', 'BRIGADA 1', 'BRIGADA 2', 'PLATAFORMA', 'SALA TOOLPUSHER', 
  'MÁQUINA', 'ENFERMARIA', 'COZINHA', 'IMEDIATO', 'ON DUTY', 'LIBERADOS', 'OUTROS'
];

const TrainingSession: React.FC<TrainingSessionProps> = ({ 
  session, 
  onFinish, 
  onMinimize, 
  onScanTag,
  onRemoveTag,
  onTogglePause,
  onSaveRecord,
  operatorName,
  isAdminUser
}) => {
  const [nfcState, setNfcState] = useState<'idle' | 'starting' | 'active' | 'error' | 'unsupported'>('idle');
  const [nfcError, setNfcError] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isConfirmingFinish, setIsConfirmingFinish] = useState(false);
  const [lastScannedText, setLastScannedText] = useState<string | null>(null);
  const [invalidScanId, setInvalidScanId] = useState<string | null>(null);
  const [tagToDelete, setTagToDelete] = useState<ScannedTag | null>(null);
  const [viewTab, setViewTab] = useState<'present' | 'pending'>('present');
  const [releasedIds, setReleasedIds] = useState<string[]>([]);
  
  const nfcReaderRef = useRef<any>(null);

  useEffect(() => {
    const unsub = cloudService.subscribeToReleasedCrew((ids) => {
      setReleasedIds(ids);
    });
    return () => unsub();
  }, []);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const pendingCrew = useMemo(() => {
    if (!session.expectedCrew) return [];
    return session.expectedCrew.filter(berth => {
      // Regra 1: Não deve estar já na lista de embarcados (tags)
      const isAnyTagScanned = session.tags.some(tag => 
        (berth.tagId1 && tag.id.trim().toLowerCase() === berth.tagId1.trim().toLowerCase()) ||
        (berth.tagId2 && tag.id.trim().toLowerCase() === berth.tagId2.trim().toLowerCase()) ||
        (berth.tagId3 && tag.id.trim().toLowerCase() === berth.tagId3.trim().toLowerCase()) ||
        (tag.leito === berth.id)
      );
      
      // Regra 2: Não deve estar na lista de LIBERADOS
      const isReleased = releasedIds.includes(berth.id);

      return !isAnyTagScanned && !isReleased;
    });
  }, [session.expectedCrew, session.tags, releasedIds]);

  const getBerthInfoForTag = (tag: ScannedTag) => {
    if (!session.expectedCrew || !tag.leito) return { role: tag.role, company: tag.company };
    const berth = session.expectedCrew.find(b => b.id === tag.leito);
    return berth ? { role: berth.role, company: berth.company } : { role: tag.role, company: tag.company };
  };

  const startNFC = async () => {
    if (!('NDEFReader' in window)) {
      setNfcState('unsupported');
      return;
    }
    setNfcState('starting');
    try {
      const reader = new (window as any).NDEFReader();
      nfcReaderRef.current = reader;
      await reader.scan();
      setNfcState('active');
      reader.addEventListener("reading", async ({ message, serialNumber }: any) => {
        const tagId = serialNumber || "";
        if (!tagId) return;

        // Fix: Use tagId instead of an undefined 'tag.id'
        const matchedBerth = session.expectedCrew?.find(b => 
          (b.tagId1 && b.tagId1.trim().toLowerCase() === tagId.trim().toLowerCase()) ||
          (b.tagId2 && b.tagId2.trim().toLowerCase() === tagId.trim().toLowerCase()) ||
          (b.tagId3 && tagId.trim().toLowerCase() === tagId.trim().toLowerCase())
        );

        if (!matchedBerth && !session.isAdminView) {
          if (navigator.vibrate) navigator.vibrate([500]);
          setInvalidScanId(tagId);
          setTimeout(() => setInvalidScanId(null), 3000);
          return; 
        }

        const alreadyPresent = session.tags.some(t => t.leito === matchedBerth?.id);
        if (alreadyPresent) {
          if (navigator.vibrate) navigator.vibrate([50]);
          return;
        }

        // Caso a pessoa esteja na lista de LIBERADOS mas escaneou agora
        if (matchedBerth && releasedIds.includes(matchedBerth.id)) {
          const newReleased = releasedIds.filter(id => id !== matchedBerth.id);
          await cloudService.updateReleasedCrew(newReleased);
          // O subscription irá atualizar o estado local automaticamente
        }

        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        let dataStr = "";
        if (message.records) {
          for (const record of message.records) {
            if (record.recordType === "text") {
              try {
                const dataView = new DataView(record.data.buffer);
                const statusByte = dataView.getUint8(0);
                const langCodeLength = statusByte & 0x3F;
                const textDecoder = new TextDecoder();
                dataStr += textDecoder.decode(new Uint8Array(record.data.buffer).slice(1 + langCodeLength));
              } catch (e) {}
            }
          }
        }
        
        setLastScannedText(matchedBerth?.crewName || dataStr.trim() || tagId);
        onScanTag(tagId, dataStr.trim());
        setTimeout(() => setLastScannedText(null), 4000);
      });
    } catch (error: any) { setNfcState('error'); }
  };

  useEffect(() => { if (!session.isAdminView) startNFC(); }, [session.isAdminView]);

  const handleFinish = async (isGlobal: boolean = false) => {
    setIsFinishing(true);
    try {
      const durationStr = formatTime(session.seconds);
      const label = isGlobal ? 'FROTA COMPLETA' : session.lifeboat;
      
      const summary = await generateTrainingSummary(label, session.tags.length, durationStr);
      await onSaveRecord({ 
        date: new Date().toLocaleString('pt-BR'), 
        lifeboat: label as any, 
        leaderName: session.leaderName, 
        trainingType: isGlobal ? 'Contagem Geral' : session.trainingType, 
        isRealScenario: session.isRealScenario, 
        crewCount: session.tags.length, 
        duration: durationStr, 
        summary: summary 
      });

      if (isGlobal) {
        // Encerra tudo em tempo real na nuvem
        const resetFleet: any = {};
        LIFEBOATS.forEach(lb => { resetFleet[lb] = { count: 0, isActive: false, tags: [], seconds: 0 }; });
        const resetCounters = Object.fromEntries(MANUAL_CATEGORIES.map(cat => [cat, 0]));
        
        await Promise.all([
          cloudService.updateFleetStatus(resetFleet),
          cloudService.updateManualCounters(resetCounters),
          cloudService.updateReleasedCrew([]) // Limpa liberados no fim da contagem geral
        ]);
      }

      onFinish();
    } catch (e) {
      alert("Erro ao salvar dados.");
    } finally {
      setIsFinishing(false);
      setIsConfirmingFinish(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 max-w-5xl mx-auto w-full pb-32">
      {/* Toast Notificações */}
      {lastScannedText && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-10 fade-in">
           <div className="p-3 px-5 rounded-full shadow-md border bg-slate-900 border-blue-500 text-white flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center animate-pulse-fast shadow-sm"><i className="fa-solid fa-check text-sm"></i></div>
              <div className="flex-1 overflow-hidden">
                <p className="text-[9px] font-black uppercase text-blue-300">Embarque confirmado:</p>
                <h4 className="text-sm font-black uppercase truncate">{lastScannedText}</h4>
              </div>
           </div>
        </div>
      )}

      {invalidScanId && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-10 fade-in">
           <div className="p-3 px-5 rounded-full shadow-md border bg-rose-600 border-rose-400 text-white flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center animate-shake"><i className="fa-solid fa-xmark text-sm"></i></div>
              <div className="flex-1 overflow-hidden">
                <p className="text-[9px] font-black uppercase text-rose-100">Acesso Negado:</p>
                <h4 className="text-sm font-black uppercase truncate">Baleeira Incorreta</h4>
              </div>
           </div>
        </div>
      )}

      {/* Cabeçalho */}
      <div className="flex justify-between items-start mb-10">
        <div className="flex items-start gap-5">
          <button onClick={onMinimize} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm transition-all active:scale-90 border border-slate-100"><i className="fa-solid fa-chevron-left"></i></button>
          <div className="mt-1">
            <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight leading-none">{session.lifeboat}</h2>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
              <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.2em] opacity-70 leading-none">{session.trainingType}</p>
              <div className="flex items-center gap-1.5 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 self-start sm:self-auto">
                <i className="fa-solid fa-user-shield text-[8px] text-blue-500"></i>
                <span className="text-[9px] font-black text-blue-600 uppercase tracking-wider">LIDER: {session.leaderName}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-[#111827] text-white p-3 px-6 rounded-[24px] shadow-sm flex flex-col items-center min-w-[140px]">
             <span className="text-[8px] font-black opacity-50 uppercase tracking-[0.25em]">CRONÔMETRO</span>
             <span className="text-2xl font-mono font-black mt-1 tracking-tighter tabular-nums">{formatTime(session.seconds)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-8">
        <button onClick={() => setViewTab('present')} className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${viewTab === 'present' ? 'bg-white border-blue-600 text-blue-600 shadow-sm' : 'bg-slate-50 border-transparent text-slate-400'}`}>PRESENTES ({session.tags.length})</button>
        <button onClick={() => setViewTab('pending')} className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${viewTab === 'pending' ? 'bg-white border-blue-600 text-blue-600 shadow-sm' : 'bg-slate-50 border-transparent text-slate-400'}`}>FALTANTES ({pendingCrew.length})</button>
      </div>

      {/* Lista de Tripulantes */}
      <div className="flex-1 space-y-3 overflow-y-auto pb-10">
        {viewTab === 'present' ? (
          session.tags.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-100 rounded-[40px] p-20 text-center shadow-sm">
              <p className="text-slate-300 text-[10px] font-black uppercase tracking-widest">Aguardando Aproximação...</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {session.tags.map((tag) => {
                const berthInfo = getBerthInfoForTag(tag);
                return (
                  <div key={tag.id} className="p-4 py-5 rounded-[32px] bg-white border border-slate-100 shadow-sm flex items-center justify-between transition-all hover:shadow-md animate-in slide-in-from-left-2 duration-300">
                    <div className="flex items-center gap-5 flex-1 min-w-0">
                      <div className="w-14 h-11 bg-slate-800 text-white rounded-[14px] flex items-center justify-center text-[10px] font-black tracking-tighter flex-shrink-0">
                        {tag.leito || 'N/A'}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-black uppercase truncate text-slate-900 tracking-tight">{tag.name}</h4>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                          <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">TAG: {tag.id}</span>
                          <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                          <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tight">EMBARCADO</span>
                          {(berthInfo.role || berthInfo.company) && (
                            <>
                              <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                              <span className="text-[9px] font-bold text-blue-500 uppercase tracking-tight">{berthInfo.role || '-'}</span>
                              <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-tight">{berthInfo.company || '-'}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 pr-2">
                      <span className="text-[10px] font-black text-slate-400 tabular-nums">{tag.timestamp}</span>
                      {!session.isAdminView && (
                        <button onClick={() => setTagToDelete(tag)} className="w-8 h-8 rounded-full bg-rose-50 text-rose-400 flex items-center justify-center active:scale-90 transition-all"><i className="fa-solid fa-trash-can text-[10px]"></i></button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          pendingCrew.length === 0 ? (
             <div className="bg-emerald-50 border-2 border-dashed border-emerald-100 rounded-[40px] p-20 text-center shadow-sm">
                <i className="fa-solid fa-check-double text-emerald-400 text-3xl mb-4"></i>
                <p className="text-emerald-500 text-[10px] font-black uppercase tracking-widest">Todos a Bordo</p>
             </div>
          ) : (
            <div className="grid gap-4">
              {pendingCrew.map((berth) => (
                <div key={berth.id} className="p-4 py-5 rounded-[32px] bg-white border border-slate-100 shadow-sm flex items-center justify-between opacity-80 transition-all">
                  <div className="flex items-center gap-5 flex-1 min-w-0">
                    <div className="w-14 h-11 bg-slate-200 text-slate-500 rounded-[14px] flex items-center justify-center text-[10px] font-black tracking-tighter flex-shrink-0">{berth.id}</div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-black uppercase truncate text-slate-600 tracking-tight">{berth.crewName || 'VAZIO'}</h4>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">NÃO EMBARCADO</span>
                        {(berth.role || berth.company) && (
                          <>
                            <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                            <span className="text-[9px] font-bold text-blue-500 uppercase tracking-tight">{berth.role || '-'}</span>
                            <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-tight">{berth.company || '-'}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Botões de Ação */}
      <div className="fixed bottom-0 left-0 right-0 p-8 bg-white/60 backdrop-blur-xl border-t border-slate-100 flex gap-4 justify-center z-50 shadow-sm">
        <button onClick={onMinimize} className="flex-1 max-w-sm py-5 bg-slate-50 border border-slate-100 text-slate-600 font-black rounded-[20px] text-[10px] uppercase shadow-sm active:scale-95 transition-all tracking-widest">MINIMIZAR</button>
        {!session.isAdminView && (
          <button onClick={() => setIsConfirmingFinish(true)} className="flex-1 max-w-sm py-5 bg-blue-600 text-white font-black rounded-[20px] text-[10px] uppercase shadow-md shadow-blue-600/20 active:scale-95 transition-all tracking-widest">FINALIZAR</button>
        )}
      </div>

      {/* Modais */}
      {isConfirmingFinish && (
        <div className="fixed inset-0 z-[101] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[48px] max-w-lg w-full p-12 shadow-md animate-in zoom-in duration-300">
            <h3 className="text-xl font-black text-slate-900 mb-8 uppercase tracking-tight">O que deseja fazer?</h3>
            <div className="grid gap-3">
              <button onClick={() => handleFinish(false)} disabled={isFinishing} className="w-full py-5 bg-blue-600 text-white font-black rounded-3xl text-[10px] uppercase shadow-md flex items-center justify-center gap-2">
                {isFinishing ? <><i className="fa-solid fa-rotate animate-spin"></i> Salvando...</> : 'Finalizar Esta Unidade'}
              </button>
              
              {isAdminUser && (
                <button onClick={() => handleFinish(true)} disabled={isFinishing} className="w-full py-5 bg-rose-600 text-white font-black rounded-3xl text-[10px] uppercase shadow-md flex items-center justify-center gap-2 border border-rose-400/30">
                  {isFinishing ? <><i className="fa-solid fa-rotate animate-spin"></i> Encerrando...</> : 'Encerrar Contagem Geral (Tudo)'}
                </button>
              )}
              
              <button onClick={() => setIsConfirmingFinish(false)} disabled={isFinishing} className="w-full py-5 bg-slate-50 text-slate-400 font-black rounded-3xl text-[10px] uppercase">Cancelar</button>
            </div>
            {isAdminUser && (
              <p className="mt-4 text-[8px] font-bold text-rose-500 uppercase tracking-widest">Atenção: Encerrar Contagem Geral desativa todas as baleeiras e zera os contadores.</p>
            )}
          </div>
        </div>
      )}

      {tagToDelete && (
        <div className="fixed inset-0 z-[201] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[48px] max-sm w-full p-10 shadow-md text-center">
            <h3 className="text-xl font-black text-slate-900 mb-8 uppercase tracking-tight">Remover Registro?</h3>
            <div className="grid gap-3">
              <button onClick={() => { onRemoveTag(tagToDelete.id); setTagToDelete(null); }} className="w-full py-5 bg-rose-600 text-white font-black rounded-3xl text-[10px] uppercase shadow-md">Remover</button>
              <button onClick={() => setTagToDelete(null)} className="w-full py-5 bg-slate-50 text-slate-400 font-black rounded-3xl text-[10px] uppercase">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingSession;

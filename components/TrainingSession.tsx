
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ActiveSession, TrainingRecord, ScannedTag } from '../types';
import { generateTrainingSummary } from '../services/geminiService';

interface TrainingSessionProps {
  session: ActiveSession;
  onFinish: () => void;
  onMinimize: () => void;
  onScanTag: (id: string, data: string) => void;
  onRemoveTag: (id: string) => void;
  onTogglePause: (paused: boolean) => void;
  onSaveRecord: (record: Omit<TrainingRecord, 'id' | 'operator'>) => void;
  operatorName: string;
}

const TrainingSession: React.FC<TrainingSessionProps> = ({ 
  session, 
  onFinish, 
  onMinimize, 
  onScanTag,
  onRemoveTag,
  onTogglePause,
  onSaveRecord,
  operatorName
}) => {
  const [nfcState, setNfcState] = useState<'idle' | 'starting' | 'active' | 'error' | 'unsupported'>('idle');
  const [nfcError, setNfcError] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isConfirmingFinish, setIsConfirmingFinish] = useState(false);
  const [lastScannedText, setLastScannedText] = useState<string | null>(null);
  const [invalidScanId, setInvalidScanId] = useState<string | null>(null);
  const [tagToDelete, setTagToDelete] = useState<ScannedTag | null>(null);
  const [viewTab, setViewTab] = useState<'present' | 'pending'>('present');
  
  const nfcReaderRef = useRef<any>(null);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const pendingCrew = useMemo(() => {
    if (!session.expectedCrew) return [];
    return session.expectedCrew.filter(berth => {
      const isAnyTagScanned = session.tags.some(tag => 
        (berth.tagId1 && tag.id.trim().toLowerCase() === berth.tagId1.trim().toLowerCase()) ||
        (berth.tagId2 && tag.id.trim().toLowerCase() === berth.tagId2.trim().toLowerCase()) ||
        (berth.tagId3 && tag.id.trim().toLowerCase() === berth.tagId3.trim().toLowerCase()) ||
        (tag.leito === berth.id)
      );
      return !isAnyTagScanned;
    });
  }, [session.expectedCrew, session.tags]);

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
      reader.addEventListener("reading", ({ message, serialNumber }: any) => {
        const tagId = serialNumber || "";
        if (!tagId) return;

        const matchedBerth = session.expectedCrew?.find(b => 
          (b.tagId1 && b.tagId1.trim().toLowerCase() === tagId.trim().toLowerCase()) ||
          (b.tagId2 && b.tagId2.trim().toLowerCase() === tagId.trim().toLowerCase()) ||
          (b.tagId3 && b.tagId3.trim().toLowerCase() === tagId.trim().toLowerCase())
        );

        if (!matchedBerth && !session.isAdminView) {
          if (navigator.vibrate) navigator.vibrate([500]);
          setInvalidScanId(tagId);
          setTimeout(() => setInvalidScanId(null), 3000);
          return; 
        }

        // Se o tripulante já estiver presente, ignoramos silenciosamente para evitar spam de toasts
        const alreadyPresent = session.tags.some(t => t.leito === matchedBerth?.id);
        if (alreadyPresent) {
          if (navigator.vibrate) navigator.vibrate([50]);
          return;
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

  const handleFinish = async () => {
    setIsFinishing(true);
    try {
      const durationStr = formatTime(session.seconds);
      const summary = await generateTrainingSummary(session.lifeboat, session.tags.length, durationStr);
      await onSaveRecord({ 
        date: new Date().toLocaleString('pt-BR'), 
        lifeboat: session.lifeboat, 
        leaderName: session.leaderName, 
        trainingType: session.trainingType, 
        isRealScenario: session.isRealScenario, 
        crewCount: session.tags.length, 
        duration: durationStr, 
        summary: summary 
      });
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
        <div className="fixed top-24 left-6 right-6 z-[100] animate-in slide-in-from-top-10">
           <div className="p-4 rounded-3xl shadow-2xl border bg-slate-900 border-blue-500 text-white flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center animate-bounce shadow-lg shadow-blue-600/20"><i className="fa-solid fa-check"></i></div>
              <div className="flex-1 overflow-hidden">
                <p className="text-[9px] font-black uppercase text-blue-400">Embarque confirmado:</p>
                <h4 className="text-sm font-black uppercase truncate">{lastScannedText}</h4>
              </div>
           </div>
        </div>
      )}

      {invalidScanId && (
        <div className="fixed top-24 left-6 right-6 z-[100] animate-in slide-in-from-top-10">
           <div className="p-4 rounded-3xl shadow-2xl border bg-rose-600 border-rose-400 text-white flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center animate-shake"><i className="fa-solid fa-xmark"></i></div>
              <div className="flex-1 overflow-hidden">
                <p className="text-[9px] font-black uppercase text-rose-100">Acesso Negado:</p>
                <h4 className="text-sm font-black uppercase truncate">Baleeira Incorreta</h4>
                <p className="text-[8px] font-mono opacity-60">TAG: {invalidScanId}</p>
              </div>
           </div>
        </div>
      )}

      {/* Cabeçalho */}
      <div className="flex justify-between items-start mb-10">
        <div className="flex items-start gap-5">
          <button 
            onClick={onMinimize} 
            className="w-12 h-12 flex items-center justify-center rounded-2xl bg-[#f1f5f9] text-slate-400 shadow-sm transition-all active:scale-90"
          >
            <i className="fa-solid fa-chevron-left"></i>
          </button>
          <div className="mt-1">
            <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight leading-none">{session.lifeboat}</h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.2em] mt-2 opacity-70">{session.trainingType}</p>
          </div>
        </div>
        
        <div className="bg-[#111827] text-white p-3 px-6 rounded-[24px] shadow-2xl flex flex-col items-center min-w-[140px]">
             <span className="text-[8px] font-black opacity-50 uppercase tracking-[0.25em]">CRONÔMETRO</span>
             <span className="text-2xl font-mono font-black mt-1 tracking-tighter tabular-nums">{formatTime(session.seconds)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-8">
        <button 
          onClick={() => setViewTab('present')} 
          className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
            viewTab === 'present' 
            ? 'bg-white border-blue-600 text-blue-600 shadow-xl shadow-blue-600/5' 
            : 'bg-[#f1f5f9] border-transparent text-slate-400'
          }`}
        >
          PRESENTES ({session.tags.length})
        </button>
        <button 
          onClick={() => setViewTab('pending')} 
          className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
            viewTab === 'pending' 
            ? 'bg-white border-blue-600 text-blue-600 shadow-xl shadow-blue-600/5' 
            : 'bg-[#f1f5f9] border-transparent text-slate-400'
          }`}
        >
          FALTANTES ({pendingCrew.length})
        </button>
      </div>

      {/* Lista de Tripulantes */}
      <div className="flex-1 space-y-3 overflow-y-auto pb-10">
        {viewTab === 'present' ? (
          session.tags.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-100 rounded-[40px] p-20 text-center">
              <p className="text-slate-300 text-[10px] font-black uppercase tracking-widest">Aguardando Aproximação...</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {session.tags.map((tag) => (
                <div key={tag.id} className="p-4 py-5 rounded-[32px] bg-white border border-slate-100 shadow-sm flex items-center justify-between transition-all hover:shadow-md animate-in slide-in-from-left-2 duration-300">
                  <div className="flex items-center gap-5 flex-1 min-w-0">
                    <div className="w-14 h-11 bg-[#111827] text-white rounded-[14px] flex items-center justify-center text-[10px] font-black tracking-tighter flex-shrink-0">
                      {tag.leito || 'N/A'}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-black uppercase truncate text-slate-900 tracking-tight">{tag.name}</h4>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">TAG: {tag.id}</span>
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
              ))}
            </div>
          )
        ) : (
          pendingCrew.length === 0 ? (
             <div className="bg-emerald-50 border-2 border-dashed border-emerald-100 rounded-[40px] p-20 text-center">
                <i className="fa-solid fa-check-double text-emerald-400 text-3xl mb-4"></i>
                <p className="text-emerald-500 text-[10px] font-black uppercase tracking-widest">Todos a Bordo</p>
             </div>
          ) : (
            <div className="grid gap-4">
              {pendingCrew.map((berth) => (
                <div key={berth.id} className="p-4 py-5 rounded-[32px] bg-white border border-slate-100 shadow-sm flex items-center justify-between opacity-80 grayscale transition-all">
                  <div className="flex items-center gap-5 flex-1 min-w-0">
                    <div className="w-14 h-11 bg-slate-400 text-white rounded-[14px] flex items-center justify-center text-[10px] font-black tracking-tighter flex-shrink-0">
                      {berth.id}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-black uppercase truncate text-slate-600 tracking-tight">{berth.crewName}</h4>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">NÃO EMBARCADO</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Botões de Ação */}
      <div className="fixed bottom-0 left-0 right-0 p-8 bg-white/60 backdrop-blur-xl border-t border-slate-100 flex gap-4 justify-center z-50">
        <button 
          onClick={onMinimize} 
          className="flex-1 max-w-sm py-5 bg-[#f1f5f9] border border-slate-200 text-slate-600 font-black rounded-[20px] text-[10px] uppercase shadow-sm active:scale-95 transition-all tracking-widest"
        >
          MINIMIZAR
        </button>
        {!session.isAdminView && (
          <button 
            onClick={() => setIsConfirmingFinish(true)} 
            className="flex-1 max-w-sm py-5 bg-[#2563eb] text-white font-black rounded-[20px] text-[10px] uppercase shadow-2xl shadow-blue-600/30 active:scale-95 transition-all tracking-widest"
          >
            FINALIZAR
          </button>
        )}
      </div>

      {/* Modais */}
      {isConfirmingFinish && (
        <div className="fixed inset-0 z-[101] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[48px] max-w-sm w-full p-12 shadow-2xl animate-in zoom-in duration-300">
            <h3 className="text-xl font-black text-slate-900 mb-8 uppercase tracking-tight">Concluir Sessão?</h3>
            <div className="grid gap-3">
              <button onClick={handleFinish} disabled={isFinishing} className="w-full py-5 bg-blue-600 text-white font-black rounded-3xl text-[10px] uppercase shadow-xl flex items-center justify-center gap-2">
                {isFinishing ? <><i className="fa-solid fa-rotate animate-spin"></i> Salvando...</> : 'Sim, Concluir'}
              </button>
              <button onClick={() => setIsConfirmingFinish(false)} disabled={isFinishing} className="w-full py-5 bg-slate-50 text-slate-400 font-black rounded-3xl text-[10px] uppercase">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {tagToDelete && (
        <div className="fixed inset-0 z-[201] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[48px] max-w-sm w-full p-10 shadow-2xl text-center">
            <h3 className="text-xl font-black text-slate-900 mb-8 uppercase tracking-tight">Remover Registro?</h3>
            <div className="grid gap-3">
              <button onClick={() => { onRemoveTag(tagToDelete.id); setTagToDelete(null); }} className="w-full py-5 bg-rose-600 text-white font-black rounded-3xl text-[10px] uppercase shadow-xl">Remover</button>
              <button onClick={() => setTagToDelete(null)} className="w-full py-5 bg-slate-50 text-slate-400 font-black rounded-3xl text-[10px] uppercase">Cancelar</button>
            </div>
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake { animation: shake 0.2s ease-in-out infinite; }
      `}</style>
    </div>
  );
};

export default TrainingSession;

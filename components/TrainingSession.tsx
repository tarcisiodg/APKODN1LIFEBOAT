
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
  const [isFinished, setIsFinished] = useState(false);
  const [lastScannedId, setLastScannedId] = useState<string | null>(null);
  const [lastScannedText, setLastScannedText] = useState<string | null>(null);
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
    return session.expectedCrew.filter(berth => 
      !session.tags.some(tag => tag.id.trim().toLowerCase() === berth.tagId.trim().toLowerCase())
    );
  }, [session.expectedCrew, session.tags]);

  const startNFC = async () => {
    if (!('NDEFReader' in window)) {
      setNfcState('unsupported');
      setNfcError('NFC não suportado.');
      return;
    }
    setNfcState('starting');
    try {
      const reader = new (window as any).NDEFReader();
      nfcReaderRef.current = reader;
      await reader.scan();
      setNfcState('active');
      reader.addEventListener("reading", ({ message, serialNumber }: any) => {
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
        const tagId = serialNumber || `FAKE_${Math.random()}`;
        setLastScannedId(tagId);
        setLastScannedText(dataStr.trim() || tagId);
        onScanTag(tagId, dataStr.trim());
        setTimeout(() => { setLastScannedId(null); setLastScannedText(null); }, 4000);
      });
    } catch (error: any) { setNfcState('error'); }
  };

  useEffect(() => { if (!session.isAdminView) startNFC(); }, [session.isAdminView]);

  const handleFinish = async () => {
    setIsConfirmingFinish(false);
    setIsFinishing(true);
    const durationStr = formatTime(session.seconds);
    const summary = await generateTrainingSummary(session.lifeboat, session.tags.length, durationStr);
    onSaveRecord({ date: new Date().toLocaleString('pt-BR'), lifeboat: session.lifeboat, leaderName: session.leaderName, trainingType: session.trainingType, isRealScenario: session.isRealScenario, crewCount: session.tags.length, duration: durationStr, summary: summary });
    setIsFinished(true);
    setIsFinishing(false);
  };

  const exportToExcel = () => {
    const rows = [
      ["Relatório Lifesafe ODN1"], ["Unidade", session.lifeboat], ["Data", new Date().toLocaleDateString()], [""],
      ["LEITO", "NOME", "ID TAG", "HORÁRIO"]
    ];
    session.tags.forEach(tag => rows.push([tag.leito || "N/A", tag.name || "N/A", tag.id, tag.timestamp]));
    const csvContent = "\uFEFF" + rows.map(e => e.map(cell => `"${cell}"`).join(";")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `EMBARQUE_${session.lifeboat}.csv`;
    link.click();
  };

  return (
    <div className="flex-1 flex flex-col p-6 max-w-4xl mx-auto w-full pb-32">
      {lastScannedText && (
        <div className="fixed top-24 left-6 right-6 z-[100] animate-in slide-in-from-top-10">
           <div className="p-4 rounded-3xl shadow-2xl border bg-slate-900 border-blue-500 text-white flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center animate-bounce"><i className="fa-solid fa-id-card"></i></div>
              <div className="flex-1 overflow-hidden">
                <p className="text-[9px] font-black uppercase text-blue-400">Scan detectado:</p>
                <h4 className="text-sm font-black uppercase truncate">{lastScannedText}</h4>
              </div>
           </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <button onClick={onMinimize} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white border border-slate-200 text-slate-600 shadow-sm"><i className="fa-solid fa-chevron-left"></i></button>
          <div>
            <h2 className="text-2xl font-black text-slate-900 uppercase leading-none">{session.lifeboat}</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{session.trainingType}</p>
          </div>
        </div>
        <div className="bg-slate-900 text-white px-5 py-3 rounded-2xl flex flex-col items-center">
             <span className="text-[8px] font-black opacity-40 uppercase">Cronômetro</span>
             <span className="text-lg font-mono font-bold leading-none mt-1">{formatTime(session.seconds)}</span>
        </div>
      </div>

      <div className="flex bg-slate-100 p-1 rounded-2xl mb-6">
        <button onClick={() => setViewTab('present')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${viewTab === 'present' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>Presentes ({session.tags.length})</button>
        <button onClick={() => setViewTab('pending')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${viewTab === 'pending' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>Faltantes ({pendingCrew.length})</button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pb-10">
        {viewTab === 'present' ? (
          session.tags.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-100 rounded-[32px] p-16 text-center">
              <p className="text-slate-400 text-[10px] font-black uppercase">Aguardando Aproximação...</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {session.tags.map((tag) => (
                <div key={tag.id} className="p-4 rounded-[28px] border bg-white border-slate-100 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center text-[10px] font-mono font-bold flex-shrink-0">{tag.leito || 'N/A'}</div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-black uppercase truncate text-slate-900">{tag.name}</h4>
                      <p className="text-[8px] font-mono text-slate-400 uppercase">TAG: {tag.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-black uppercase text-slate-400">{tag.timestamp}</span>
                    {!session.isAdminView && (
                      <button onClick={() => setTagToDelete(tag)} className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center"><i className="fa-solid fa-trash text-[10px]"></i></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          pendingCrew.map((berth) => (
            <div key={berth.id} className="p-4 rounded-[28px] border bg-white border-slate-100 shadow-sm flex items-center justify-between opacity-60">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center text-[10px] font-mono font-bold border-2 border-dashed border-slate-200">{berth.id}</div>
                <div>
                  <h4 className="text-xs font-black uppercase text-slate-400">{berth.crewName}</h4>
                  <p className="text-[8px] font-bold text-slate-300 uppercase">Pendente</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-50/90 backdrop-blur-md border-t border-slate-200 flex gap-4 justify-center z-50">
        <button onClick={onMinimize} className="flex-1 max-w-xs py-4 bg-white border border-slate-200 text-slate-700 font-black rounded-2xl text-[10px] uppercase">Minimizar</button>
        <button onClick={() => setIsConfirmingFinish(true)} className="flex-1 max-w-xs py-4 bg-blue-600 text-white font-black rounded-2xl text-[10px] uppercase shadow-lg">Finalizar</button>
      </div>

      {isConfirmingFinish && (
        <div className="fixed inset-0 z-[101] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[40px] max-w-sm w-full p-10 shadow-2xl">
            <h3 className="text-xl font-black text-slate-900 mb-8 uppercase">Concluir Sessão?</h3>
            <div className="grid gap-3">
              <button onClick={handleFinish} className="w-full py-4 bg-blue-600 text-white font-black rounded-2xl text-[10px] uppercase shadow-xl">Sim, Concluir</button>
              <button onClick={() => setIsConfirmingFinish(false)} className="w-full py-4 bg-slate-100 text-slate-400 font-black rounded-2xl text-[10px] uppercase">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {isFinished && (
        <div className="fixed inset-0 z-[102] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[40px] max-md w-full p-10 shadow-2xl flex flex-col items-center">
            <h2 className="text-2xl font-black text-slate-900 mb-10 uppercase">SESSÃO ENCERRADA</h2>
            <div className="w-full space-y-3">
              <button onClick={exportToExcel} className="w-full py-5 bg-slate-900 text-white font-black rounded-[24px] text-[10px] uppercase flex items-center justify-center gap-3"><i className="fa-solid fa-file-csv"></i> Baixar Relatório</button>
              <button onClick={onFinish} className="w-full py-5 bg-slate-100 text-slate-900 font-black rounded-[24px] text-[10px] uppercase">Dashboard</button>
            </div>
          </div>
        </div>
      )}

      {tagToDelete && (
        <div className="fixed inset-0 z-[201] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] max-w-sm w-full p-8 shadow-2xl text-center">
            <h3 className="text-xl font-black text-slate-900 mb-8 uppercase">Remover Registro?</h3>
            <div className="grid gap-3">
              {/* Fix: use the correct prop onRemoveTag instead of undefined removeTag */}
              <button onClick={() => { onRemoveTag(tagToDelete.id); setTagToDelete(null); }} className="w-full py-4 bg-rose-600 text-white font-black rounded-2xl text-[10px] uppercase shadow-xl">Remover</button>
              <button onClick={() => setTagToDelete(null)} className="w-full py-4 bg-slate-100 text-slate-400 font-black rounded-2xl text-[10px] uppercase">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingSession;

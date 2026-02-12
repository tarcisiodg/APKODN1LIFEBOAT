
import React, { useState, useEffect, useRef } from 'react';
import { ActiveSession, TrainingRecord } from '../types';
// Import the Gemini service for summary generation
import { generateTrainingSummary } from '../services/geminiService';

interface TrainingSessionProps {
  session: ActiveSession;
  onFinish: () => void;
  onMinimize: () => void;
  onScanTag: (id: string, data: string) => void;
  onTogglePause: (paused: boolean) => void;
  onSaveRecord: (record: Omit<TrainingRecord, 'id' | 'operator'>) => void;
  operatorName: string;
}

const TrainingSession: React.FC<TrainingSessionProps> = ({ 
  session, 
  onFinish, 
  onMinimize, 
  onScanTag,
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
  
  const nfcReaderRef = useRef<any>(null);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const startNFC = async () => {
    if (!('NDEFReader' in window)) {
      setNfcState('unsupported');
      setNfcError('Seu dispositivo não suporta leitura NFC.');
      return;
    }

    setNfcState('starting');
    setNfcError(null);

    try {
      // @ts-ignore
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
                const decodedText = textDecoder.decode(new Uint8Array(record.data.buffer).slice(1 + langCodeLength));
                dataStr += decodedText;
              } catch (e) {
                console.error("Erro NDEF:", e);
              }
            }
          }
        }
        
        const tagId = serialNumber || `ID_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        const finalData = dataStr.trim();
        
        setLastScannedId(tagId);
        setLastScannedText(finalData || "Sem texto gravado");
        
        onScanTag(tagId, finalData);
        
        setTimeout(() => {
          setLastScannedId(null);
          setLastScannedText(null);
        }, 4000);
      });

      reader.addEventListener("readingerror", () => {
        setNfcError("Erro ao ler. Tente aproximar novamente.");
        setTimeout(() => setNfcError(null), 3000);
      });

    } catch (error: any) {
      setNfcState('error');
      setNfcError('Sensor NFC não pôde ser ativado.');
    }
  };

  useEffect(() => {
    if (!session.isAdminView) startNFC();
    return () => { nfcReaderRef.current = null; };
  }, [session.isAdminView]);

  // Fix: Replaced 'seconds' with 'session.seconds' to fix the compilation error
  const handleFinish = async () => {
    setIsConfirmingFinish(false);
    setIsFinishing(true);
    
    const durationStr = formatTime(session.seconds);
    
    // Using Gemini to generate a professional summary based on the actual session data
    const summary = await generateTrainingSummary(
      session.lifeboat, 
      session.tags.length, 
      durationStr
    );

    onSaveRecord({
      date: new Date().toLocaleString('pt-BR'),
      lifeboat: session.lifeboat,
      leaderName: session.leaderName,
      trainingType: session.trainingType,
      isRealScenario: session.isRealScenario,
      crewCount: session.tags.length,
      duration: durationStr,
      summary: summary
    });
    setIsFinished(true);
    setIsFinishing(false);
  };

  const exportToExcel = () => {
    const rows = [
      ["Relatório Lifesafe ODN1"],
      ["Unidade", session.lifeboat],
      ["Data", new Date().toLocaleDateString()],
      [""],
      ["NOME/TEXTO GRAVADO", "NÚMERO DE SÉRIE (ID)", "HORÁRIO"]
    ];
    session.tags.forEach(tag => rows.push([tag.name || "Sem Nome", tag.id, tag.timestamp]));
    const csvContent = "\uFEFF" + rows.map(e => e.map(cell => `"${cell}"`).join(";")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `LISTA_EMBARQUE_${session.lifeboat}.csv`;
    link.click();
  };

  return (
    <div className="flex-1 flex flex-col p-6 max-w-4xl mx-auto w-full pb-32">
      {/* Alerta de Leitura Ativa */}
      {lastScannedText && (
        <div className="fixed top-24 left-6 right-6 z-[100] animate-in slide-in-from-top-10 duration-500">
           <div className="p-4 rounded-3xl shadow-2xl border bg-slate-900 border-blue-500 text-white flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center animate-bounce">
                <i className="fa-solid fa-id-card text-xl"></i>
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-400 mb-1">DADOS LIDOS COM SUCESSO:</p>
                <h4 className="text-sm font-black uppercase truncate">{lastScannedText}</h4>
                <p className="text-[8px] font-mono text-white/40 uppercase">S/N: {lastScannedId}</p>
              </div>
           </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <button onClick={onMinimize} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white border border-slate-200 text-slate-600 shadow-sm"><i className="fa-solid fa-chevron-left"></i></button>
          <div>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">{session.lifeboat}</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Sessão: {session.trainingType}</p>
          </div>
        </div>
        <div className="bg-slate-900 text-white px-5 py-3 rounded-2xl flex flex-col items-center">
          <span className="text-[8px] font-black opacity-40 uppercase tracking-widest">Tempo</span>
          <span className="text-lg font-mono font-bold leading-none mt-1">{formatTime(session.seconds)}</span>
        </div>
      </div>

      {!session.isAdminView && (
        <div className={`p-6 rounded-[32px] border-2 transition-all duration-500 mb-8 flex items-center gap-5 ${nfcState === 'active' ? 'bg-blue-50 border-blue-200 shadow-xl shadow-blue-600/5' : 'bg-slate-50 border-slate-200'}`}>
           <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${nfcState === 'active' ? 'bg-blue-600 text-white animate-pulse' : 'bg-slate-200 text-slate-400'}`}>
              <i className="fa-solid fa-tower-broadcast text-2xl"></i>
           </div>
           <div className="flex-1">
              <h4 className="font-black text-xs uppercase tracking-widest text-slate-900">Leitor NFC Ativo</h4>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight mt-0.5">Aproxime a tag para ler o texto gravado e o número de série.</p>
           </div>
           {nfcState !== 'active' && (
             <button onClick={startNFC} className="bg-slate-900 text-white px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg">Ativar</button>
           )}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto pb-10">
        <div className="flex justify-between items-center px-2 mb-2">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">Lista de Identificação</h3>
          <span className="text-[9px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full uppercase">{session.tags.length} Presentes</span>
        </div>

        {session.tags.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-100 rounded-[32px] p-16 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 mx-auto mb-4">
              <i className="fa-solid fa-id-badge text-3xl"></i>
            </div>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Aguardando Aproximação...</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {session.tags.map((tag) => (
              <div 
                key={tag.id} 
                className={`p-5 rounded-[28px] border transition-all duration-500 flex items-center justify-between group ${
                  lastScannedId === tag.id ? 'bg-blue-600 border-blue-600 text-white scale-[1.03] shadow-2xl shadow-blue-600/20' : 'bg-white border-slate-100 shadow-sm'
                }`}
              >
                <div className="flex items-center gap-5 flex-1 min-w-0">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors ${
                    lastScannedId === tag.id ? 'bg-white/20 text-white' : 'bg-slate-50 text-blue-600'
                  }`}>
                    <i className={`fa-solid ${tag.name && tag.name !== 'Tripulante' ? 'fa-id-card' : 'fa-user-check'} text-lg`}></i>
                  </div>
                  <div className="min-w-0">
                    <h4 className={`text-sm font-black uppercase tracking-tight truncate leading-tight ${lastScannedId === tag.id ? 'text-white' : 'text-slate-900'}`}>
                      {tag.name || "Tripulante Indefinido"}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                       <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded tracking-tighter ${
                         lastScannedId === tag.id ? 'bg-white/10 text-white/70' : 'bg-slate-100 text-slate-400'
                       }`}>
                         S/N: {tag.id}
                       </span>
                       {tag.data && tag.data !== "Sem texto no chip" && (
                         <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded flex items-center gap-1 ${
                            lastScannedId === tag.id ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-500'
                         }`}>
                           <i className="fa-solid fa-check-circle text-[6px]"></i> TEXTO LIDO
                         </span>
                       )}
                    </div>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end flex-shrink-0 ml-4">
                  <span className={`text-[10px] font-black uppercase tabular-nums ${lastScannedId === tag.id ? 'text-white/80' : 'text-slate-400'}`}>
                    {tag.timestamp}
                  </span>
                  {lastScannedId === tag.id && (
                    <span className="text-[7px] font-black bg-white text-blue-600 px-1.5 py-0.5 rounded-full mt-1.5 animate-pulse">LIDO AGORA</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-50/90 backdrop-blur-md border-t border-slate-200 flex gap-4 justify-center z-50">
        <button onClick={onMinimize} className="flex-1 max-w-xs py-4 bg-white border border-slate-200 text-slate-700 font-black rounded-2xl text-[10px] uppercase tracking-widest active:scale-95 transition-all">MINIMIZAR</button>
        <button onClick={() => setIsConfirmingFinish(true)} className={`flex-1 max-w-xs py-4 font-black rounded-2xl text-[10px] uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 active:scale-95 transition-all ${session.isRealScenario ? 'bg-red-700' : 'bg-blue-600'}`}>FINALIZAR</button>
      </div>

      {isConfirmingFinish && (
        <div className="fixed inset-0 z-[101] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] max-w-sm w-full p-10 shadow-2xl animate-in zoom-in duration-200 text-center">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6"><i className="fa-solid fa-circle-check text-3xl"></i></div>
            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Concluir Sessão?</h3>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-10">O relatório final será gerado com todos os dados capturados.</p>
            <div className="grid gap-3">
              <button onClick={handleFinish} className="w-full py-5 bg-blue-600 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl shadow-blue-600/20">SIM, FINALIZAR</button>
              <button onClick={() => setIsConfirmingFinish(false)} className="w-full py-5 bg-slate-100 text-slate-400 font-black rounded-2xl text-[10px] uppercase">CANCELAR</button>
            </div>
          </div>
        </div>
      )}

      {isFinished && (
        <div className="fixed inset-0 z-[102] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] max-md w-full p-10 shadow-2xl animate-in zoom-in duration-300 flex flex-col items-center">
            <div className="w-20 h-20 bg-emerald-600 text-white rounded-[28px] flex items-center justify-center mb-8 shadow-xl shadow-emerald-600/20 animate-bounce"><i className="fa-solid fa-check text-4xl"></i></div>
            <h2 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">REGISTRO CONCLUÍDO</h2>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.3em] mb-10">ODN1 NS-41 MUSTER SYSTEM</p>
            <div className="w-full space-y-3">
              <button onClick={exportToExcel} className="w-full py-5 bg-slate-900 text-white font-black rounded-[24px] text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl"><i className="fa-solid fa-file-excel"></i> BAIXAR RELATÓRIO CSV</button>
              <button onClick={onFinish} className="w-full py-5 bg-slate-100 text-slate-900 font-black rounded-[24px] text-[10px] uppercase tracking-widest">VOLTAR AO DASHBOARD</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingSession;

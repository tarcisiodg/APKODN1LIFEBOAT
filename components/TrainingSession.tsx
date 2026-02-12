
import React, { useState, useEffect, useRef } from 'react';
import { ActiveSession, TrainingRecord } from '../types';

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
      setNfcError('Seu dispositivo ou navegador não suporta leitura NFC.');
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
        
        // Processamento NDEF Preciso (Extraindo texto real sem metadados)
        if (message.records) {
          for (const record of message.records) {
            if (record.recordType === "text") {
              try {
                // O padrão NDEF Text tem o primeiro byte como "Status Byte"
                // Bits 5-0 indicam o tamanho do código do idioma (ex: 'en', 'pt')
                const dataView = new DataView(record.data.buffer);
                const statusByte = dataView.getUint8(0);
                const langCodeLength = statusByte & 0x3F;
                
                // O texto real começa após o statusByte (1) + langCodeLength
                const textDecoder = new TextDecoder();
                const decodedText = textDecoder.decode(new Uint8Array(record.data.buffer).slice(1 + langCodeLength));
                dataStr += decodedText;
              } catch (e) {
                console.error("Erro ao decodificar registro NDEF Text", e);
              }
            }
          }
        }
        
        const tagId = serialNumber || `TAG_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        const finalData = dataStr.trim();
        
        setLastScannedId(tagId);
        setLastScannedText(finalData || "Sem texto no chip");
        
        // Envia para o processamento central (App.tsx)
        onScanTag(tagId, finalData);
        
        setTimeout(() => {
          setLastScannedId(null);
          setLastScannedText(null);
        }, 3500);
      });

      reader.addEventListener("readingerror", () => {
        setNfcError("Falha na leitura. Aproxime a tag novamente.");
        setTimeout(() => setNfcError(null), 3000);
      });

    } catch (error: any) {
      setNfcState('error');
      setNfcError(error.name === 'NotAllowedError' ? 'Permissão NFC negada.' : 'Erro ao ativar sensor NFC.');
    }
  };

  useEffect(() => {
    if (!session.isAdminView) startNFC();
    return () => { nfcReaderRef.current = null; };
  }, [session.isAdminView]);

  const handleFinish = async () => {
    setIsConfirmingFinish(false);
    setIsFinishing(true);
    onSaveRecord({
      date: new Date().toLocaleString('pt-BR'),
      lifeboat: session.lifeboat,
      leaderName: session.leaderName,
      trainingType: session.trainingType,
      isRealScenario: session.isRealScenario,
      crewCount: session.tags.length,
      duration: formatTime(session.seconds),
      summary: session.isAdminView ? "Monitoramento encerrado." : (session.isRealScenario ? "EMERGÊNCIA REAL ENCERRADA." : "Treinamento concluído.")
    });
    setIsFinished(true);
    setIsFinishing(false);
  };

  const exportToExcel = () => {
    const rows = [
      ["Relatório LIFESAFE ODN1 - NS-41"],
      ["Unidade", session.lifeboat.toUpperCase()],
      ["Tipo", session.isRealScenario ? "REAL" : "TREINAMENTO"],
      ["Duração", formatTime(session.seconds)],
      ["Pessoas", session.tags.length.toString()],
      [""],
      ["DADOS CAPTURADOS (TAG/NFC)", "ID FÍSICO", "HORÁRIO"]
    ];
    session.tags.forEach(tag => rows.push([tag.name || "N/A", tag.id, tag.timestamp]));
    const csvContent = "\uFEFF" + rows.map(e => e.map(cell => `"${cell.replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `RELATORIO_${session.lifeboat.replace(/\s/g, '_')}.csv`;
    link.click();
  };

  return (
    <div className={`flex-1 flex flex-col p-6 max-w-4xl mx-auto w-full pb-32 animate-in fade-in duration-500`}>
      {session.isRealScenario && (
        <div className="mb-4 py-3 px-4 bg-red-600 text-white rounded-2xl flex items-center justify-between animate-pulse shadow-lg shadow-red-600/30">
          <div className="flex items-center gap-3">
            <i className="fa-solid fa-triangle-exclamation"></i>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Cenário Real Ativo</span>
          </div>
          <span className="text-[8px] font-bold px-2 py-0.5 bg-white/20 rounded">ODN1 NS-41</span>
        </div>
      )}

      {/* Notificação de Leitura de Texto da Tag */}
      {lastScannedText && (
        <div className="fixed top-24 left-6 right-6 z-[100] animate-in slide-in-from-top-10 duration-500">
           <div className={`p-4 rounded-2xl shadow-2xl border flex items-center gap-4 bg-slate-900 border-blue-500 text-white`}>
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center animate-bounce">
                <i className="fa-solid fa-id-card"></i>
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-0.5">Texto lido na TAG:</p>
                <p className="text-sm font-black truncate uppercase text-blue-400">{lastScannedText}</p>
              </div>
           </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button onClick={onMinimize} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white border border-slate-200 text-slate-600 shadow-sm"><i className="fa-solid fa-chevron-left"></i></button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase text-white ${session.isRealScenario ? 'bg-red-700' : 'bg-blue-600'}`}>{session.trainingType}</span>
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">Líder: {session.leaderName}</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{session.lifeboat}</h2>
          </div>
        </div>

        <div className={`${session.isRealScenario ? 'bg-red-950' : 'bg-slate-900'} text-white px-6 py-4 rounded-3xl flex items-center gap-6 shadow-xl`}>
          <div className="text-center">
            <div className="text-white/40 text-[9px] font-black uppercase tracking-widest mb-1">Tempo</div>
            <div className="text-xl font-mono font-bold">{formatTime(session.seconds)}</div>
          </div>
          <div className="w-px h-8 bg-white/10"></div>
          <div className="text-center">
            <div className="text-white/40 text-[9px] font-black uppercase tracking-widest mb-1">Total</div>
            <div className="text-xl font-mono font-bold">{session.tags.length}</div>
          </div>
        </div>
      </div>

      {!session.isAdminView && (
        <div className={`p-5 rounded-[28px] mb-6 flex flex-col sm:flex-row items-center justify-between border-2 transition-all duration-500 gap-4 ${nfcState === 'active' ? 'bg-blue-50 border-blue-200 shadow-lg shadow-blue-600/5' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className={`w-14 h-14 rounded-[20px] flex items-center justify-center transition-all flex-shrink-0 ${nfcState === 'active' ? 'bg-blue-600 text-white animate-pulse' : 'bg-slate-200 text-slate-400'}`}>
              <i className="fa-solid fa-tower-broadcast text-2xl"></i>
            </div>
            <div>
              <h4 className="font-black text-xs text-slate-900 uppercase tracking-widest">Leitor de Tags Ativo</h4>
              <p className="text-[10px] text-slate-500 font-bold uppercase leading-tight mt-0.5">{nfcError || "Aproxime seu cartão para identificação automática"}</p>
            </div>
          </div>
          {nfcState !== 'active' && (
            <button onClick={startNFC} className="w-full sm:w-auto px-6 py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg">Ativar NFC</button>
          )}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto pr-2 pb-10">
        <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em] mb-2">LISTA DE EMBARQUE</h3>
        {session.tags.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-[32px] p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 mb-4"><i className="fa-solid fa-id-card text-3xl"></i></div>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Aguardando leituras...</p>
          </div>
        ) : (
          <div className="grid gap-2.5">
            {session.tags.map((tag) => (
              <div key={tag.id} className={`p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between shadow-sm ${lastScannedId === tag.id ? 'bg-blue-600 border-blue-600 text-white scale-[1.02]' : 'bg-white border-slate-100'}`}>
                <div className="flex items-center gap-4 flex-1">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${lastScannedId === tag.id ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600'}`}>
                    <i className="fa-solid fa-user-check text-base"></i>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <h4 className={`font-black text-xs uppercase tracking-tight truncate ${lastScannedId === tag.id ? 'text-white' : 'text-slate-900'}`}>
                      {tag.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className={`text-[8px] font-bold font-mono uppercase tracking-widest px-1.5 py-0.5 rounded ${lastScannedId === tag.id ? 'bg-white/10 text-white/70' : 'bg-slate-50 text-slate-400'}`}>{tag.id}</p>
                      {tag.data && tag.data !== "Tag ODN1 Sem Texto" && (
                         <span className={`text-[7px] font-black uppercase ${lastScannedId === tag.id ? 'text-white/60' : 'text-blue-500'}`}>
                           <i className="fa-solid fa-microchip mr-1"></i> DADOS DA TAG
                         </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className={`text-[9px] font-black uppercase flex flex-col items-end ${lastScannedId === tag.id ? 'text-white/90' : 'text-slate-400'}`}>
                  <span>{tag.timestamp}</span>
                  {lastScannedId === tag.id && <span className="text-[7px] bg-white text-blue-600 px-1 rounded animate-pulse mt-1">LIDO AGORA</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-50/95 backdrop-blur-md border-t border-slate-200 flex gap-3 justify-center z-40">
        <button onClick={onMinimize} className="flex-1 py-4 bg-white border border-slate-200 text-slate-700 font-black uppercase text-[10px] rounded-[20px]">MINIMIZAR</button>
        <button onClick={() => setIsConfirmingFinish(true)} className={`flex-1 py-4 font-black uppercase text-[10px] rounded-[20px] text-white shadow-lg ${session.isRealScenario ? 'bg-red-700' : 'bg-blue-600'}`}>FINALIZAR</button>
      </div>

      {isConfirmingFinish && (
        <div className="fixed inset-0 z-[101] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] max-w-sm w-full p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-black text-slate-900 mb-2 text-center uppercase tracking-tight">Finalizar Sessão?</h3>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest text-center mb-8">O relatório será gerado com os dados lidos.</p>
            <div className="grid gap-3">
              <button onClick={handleFinish} className="w-full py-4 bg-blue-600 text-white font-black rounded-2xl text-[10px] uppercase shadow-lg">CONFIRMAR</button>
              <button onClick={() => setIsConfirmingFinish(false)} className="w-full py-4 bg-slate-100 text-slate-400 font-black rounded-2xl text-[10px] uppercase">CANCELAR</button>
            </div>
          </div>
        </div>
      )}

      {isFinished && (
        <div className="fixed inset-0 z-[102] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] max-md w-full p-10 shadow-2xl animate-in zoom-in duration-300 flex flex-col items-center">
            <div className="w-20 h-20 rounded-[28px] bg-emerald-600 flex items-center justify-center text-white mb-6 shadow-xl shadow-emerald-600/20"><i className="fa-solid fa-check text-4xl"></i></div>
            <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">CONCLUÍDO</h3>
            <p className="text-slate-500 text-[9px] font-black mb-8 uppercase tracking-[0.3em]">RELATÓRIO DISPONÍVEL</p>
            <div className="w-full space-y-3">
              <button onClick={exportToExcel} className="w-full py-5 bg-slate-900 text-white font-black rounded-[24px] text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg"><i className="fa-solid fa-file-excel"></i> BAIXAR RELATÓRIO</button>
              <button onClick={onFinish} className="w-full py-5 bg-slate-100 text-slate-900 font-black rounded-[24px] text-[10px] uppercase tracking-widest">VOLTAR AO INÍCIO</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingSession;

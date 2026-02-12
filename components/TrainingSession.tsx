
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
        
        const textDecoder = new TextDecoder();
        let dataStr = "";
        
        // Processamento NDEF aprimorado para extrair texto real
        if (message.records) {
          for (const record of message.records) {
            try {
              if (record.recordType === "text") {
                // Em registros de texto NDEF, os primeiros bytes costumam ser metadados de idioma
                // Tentamos decodificar o conteúdo ignorando metadados se possível, ou pegando o texto bruto
                const text = textDecoder.decode(record.data);
                // Regex simples para limpar prefixos de idioma comuns (ex: 'enHello' -> 'Hello')
                const cleanText = text.replace(/^[a-z]{2,3}/i, '');
                dataStr += cleanText;
              } else {
                dataStr += textDecoder.decode(record.data);
              }
            } catch (e) { 
              console.debug("Erro ao decodificar registro"); 
            }
          }
        }
        
        const tagId = serialNumber || `ID_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        const finalData = dataStr.trim() || "Tag ODN1 Sem Texto";
        
        setLastScannedId(tagId);
        setLastScannedText(finalData);
        onScanTag(tagId, finalData);
        
        // Feedback visual temporário para a última tag lida
        setTimeout(() => {
          setLastScannedId(null);
          setLastScannedText(null);
        }, 4000);
      });

      reader.addEventListener("readingerror", () => {
        console.error("Erro na leitura da tag. Tente novamente.");
        setNfcError("Erro ao ler tag física. Tente aproximar novamente.");
        setTimeout(() => setNfcError(null), 3000);
      });

    } catch (error: any) {
      console.error("NFC Error:", error);
      setNfcState('error');
      if (error.name === 'NotAllowedError') {
        setNfcError('Permissão NFC negada. Ative nas configurações do navegador.');
      } else {
        setNfcError('Não foi possível ativar o sensor. Verifique se o NFC está ligado.');
      }
    }
  };

  useEffect(() => {
    if (session.isAdminView) return;
    startNFC();
    
    return () => {
      nfcReaderRef.current = null;
    };
  }, [session.isAdminView]);

  const handleFinish = async () => {
    setIsConfirmingFinish(false);
    setIsFinishing(true);
    const durationStr = formatTime(session.seconds);
    
    onSaveRecord({
      date: new Date().toLocaleString('pt-BR'),
      lifeboat: session.lifeboat,
      leaderName: session.leaderName,
      trainingType: session.trainingType,
      isRealScenario: session.isRealScenario,
      crewCount: session.tags.length,
      duration: durationStr,
      summary: session.isAdminView 
        ? "Monitoramento encerrado." 
        : (session.isRealScenario ? "EMERGÊNCIA REAL ENCERRADA." : "Treinamento concluído com sucesso.")
    });
    
    setIsFinished(true);
    setIsFinishing(false);
  };

  const exportToExcel = () => {
    const now = new Date();
    const rows = [
      ["Relatório de " + (session.isRealScenario ? "EMERGÊNCIA REAL" : "Treinamento") + " - LIFESAFE ODN1"],
      ["Unidade", "ODN1 / NS-41"],
      ["Data", now.toLocaleDateString('pt-BR')],
      ["Baleeira", session.lifeboat.toUpperCase()],
      ["Líder", session.leaderName],
      ["Duração Total", formatTime(session.seconds)],
      ["Total de Tripulantes", session.tags.length.toString()],
      [""],
      ["LISTA DE TRIPULANTES"],
      ["Nome/Dados NFC", "Tag ID", "Horário"]
    ];

    session.tags.forEach(tag => {
      rows.push([tag.name || "Tripulante", tag.id, tag.timestamp]);
    });

    const csvContent = "\uFEFF" + rows.map(e => e.map(cell => `"${cell.replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    const prefix = session.isRealScenario ? "REAL" : "TREINO";
    const fileName = `${prefix}_${session.lifeboat.replace(/\s+/g, '_')}_${now.toISOString().split('T')[0]}.csv`;
    
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.click();
  };

  return (
    <div className={`flex-1 flex flex-col p-6 max-w-4xl mx-auto w-full pb-32 animate-in fade-in duration-500 ${session.isRealScenario ? 'ring-inset ring-8 ring-red-600/10' : ''}`}>
      {session.isRealScenario && (
        <div className="mb-4 py-3 px-4 bg-red-600 text-white rounded-2xl flex items-center justify-between animate-pulse shadow-lg shadow-red-600/30">
          <div className="flex items-center gap-3">
            <i className="fa-solid fa-triangle-exclamation"></i>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Cenário Real Ativo</span>
          </div>
          <span className="text-[8px] font-bold px-2 py-0.5 bg-white/20 rounded">ODN1 NS-41</span>
        </div>
      )}

      {/* Alerta de Leitura Ativa */}
      {lastScannedText && (
        <div className="fixed top-24 left-6 right-6 z-[100] animate-in slide-in-from-top-10 duration-500">
           <div className={`p-4 rounded-2xl shadow-2xl border flex items-center gap-4 ${session.isRealScenario ? 'bg-red-900 border-red-500 text-white' : 'bg-blue-900 border-blue-500 text-white'}`}>
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center animate-bounce">
                <i className="fa-solid fa-id-card"></i>
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-0.5">Informação Capturada:</p>
                <p className="text-sm font-bold truncate uppercase">{lastScannedText}</p>
              </div>
           </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={onMinimize}
            className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white border border-slate-200 text-slate-600 shadow-sm active:scale-90 transition-transform"
          >
            <i className="fa-solid fa-chevron-left"></i>
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase text-white ${session.isRealScenario ? 'bg-red-700' : 'bg-blue-600'}`}>
                {session.trainingType}
              </span>
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">
                Líder: {session.leaderName}
              </span>
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
            <div className="text-white/40 text-[9px] font-black uppercase tracking-widest mb-1">Pessoas</div>
            <div className="text-xl font-mono font-bold">{session.tags.length}</div>
          </div>
        </div>
      </div>

      {!session.isAdminView && (
        <div className={`p-5 rounded-[28px] mb-6 flex flex-col sm:flex-row items-center justify-between border-2 transition-all duration-500 gap-4 ${
          nfcState === 'error' ? 'bg-rose-50 border-rose-100' : 
          nfcState === 'active' ? (session.isRealScenario ? 'bg-red-50 border-red-200 shadow-red-600/5' : 'bg-blue-50 border-blue-200 shadow-lg shadow-blue-600/5') : 
          'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className={`w-14 h-14 rounded-[20px] flex items-center justify-center transition-all flex-shrink-0 ${
              nfcState === 'error' ? 'bg-rose-100 text-rose-600' : 
              nfcState === 'active' ? (session.isRealScenario ? 'bg-red-600 text-white animate-pulse' : 'bg-blue-600 text-white animate-pulse') : 
              'bg-slate-200 text-slate-400'
            }`}>
              <i className={`fa-solid ${nfcState === 'error' ? 'fa-circle-exclamation' : 'fa-tower-broadcast'} text-2xl`}></i>
            </div>
            <div>
              <h4 className="font-black text-xs text-slate-900 uppercase tracking-widest">
                {nfcState === 'active' ? 'Sensor de Identificação' : nfcState === 'starting' ? 'Ativando...' : nfcState === 'error' ? 'Sensor Desativado' : 'Leitor NFC'}
              </h4>
              <p className="text-[10px] text-slate-500 font-bold uppercase leading-tight mt-0.5">
                {nfcError || (nfcState === 'active' ? 'Aproxime os cartões para ler as informações' : 'O sensor precisa ser ativado para leitura')}
              </p>
            </div>
          </div>
          
          {(nfcState === 'idle' || nfcState === 'error') && (
            <button 
              onClick={startNFC}
              className="w-full sm:w-auto px-6 py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
            >
              Ativar Leitor
            </button>
          )}
          
          {nfcState === 'active' && (
            <div className="flex gap-1.5 px-3">
              <span className={`w-2 h-2 rounded-full animate-bounce ${session.isRealScenario ? 'bg-red-600' : 'bg-blue-600'}`}></span>
              <span className={`w-2 h-2 rounded-full animate-bounce [animation-delay:0.2s] ${session.isRealScenario ? 'bg-red-600' : 'bg-blue-600'}`}></span>
              <span className={`w-2 h-2 rounded-full animate-bounce [animation-delay:0.4s] ${session.isRealScenario ? 'bg-red-600' : 'bg-blue-600'}`}></span>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto pr-2 pb-10">
        <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em] mb-2 flex justify-between">
          <span>LISTA DE EMBARQUE</span>
          <span className="text-slate-300">ORDEM CRONOLÓGICA</span>
        </h3>
        
        {session.tags.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-[32px] p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 mb-4">
              <i className="fa-solid fa-id-card text-3xl"></i>
            </div>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Nenhuma tag registrada</p>
          </div>
        ) : (
          <div className="grid gap-2.5">
            {session.tags.map((tag) => (
              <div 
                key={tag.id} 
                className={`p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between shadow-sm animate-in slide-in-from-right ${
                  lastScannedId === tag.id 
                    ? (session.isRealScenario ? 'bg-red-600 border-red-600 text-white scale-[1.02]' : 'bg-blue-600 border-blue-600 text-white scale-[1.02]')
                    : 'bg-white border-slate-100'
                }`}
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                    lastScannedId === tag.id ? 'bg-white/20 text-white' : (session.isRealScenario ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-blue-600')
                  }`}>
                    <i className="fa-solid fa-user-check text-base"></i>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <h4 className={`font-black text-xs uppercase tracking-tight truncate ${lastScannedId === tag.id ? 'text-white' : 'text-slate-900'}`}>
                      {tag.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className={`text-[8px] font-bold font-mono uppercase tracking-widest px-1.5 py-0.5 rounded ${lastScannedId === tag.id ? 'bg-white/10 text-white/70' : 'bg-slate-50 text-slate-400'}`}>
                        {tag.id}
                      </p>
                      {tag.data && tag.data !== "Tag ODN1" && (
                         <span className={`text-[7px] font-black uppercase tracking-tighter ${lastScannedId === tag.id ? 'text-white/60' : 'text-blue-400'}`}>
                           <i className="fa-solid fa-microchip mr-1"></i> NFC DATA OK
                         </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className={`text-[9px] font-black uppercase flex flex-col items-end gap-1 ${lastScannedId === tag.id ? 'text-white/90' : 'text-slate-400'}`}>
                  <span>{tag.timestamp}</span>
                  {lastScannedId === tag.id && <span className="text-[7px] bg-white text-blue-600 px-1 rounded animate-pulse">NOVO</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-50/95 backdrop-blur-md border-t border-slate-200 flex flex-col sm:flex-row gap-3 justify-center z-40">
        <button 
          onClick={onMinimize}
          className="flex-1 max-w-sm py-4 bg-white border border-slate-200 text-slate-700 font-black uppercase tracking-widest text-[10px] rounded-[20px] shadow-sm active:scale-95 transition-all flex items-center justify-center gap-3"
        >
          <i className="fa-solid fa-layer-group"></i>
          {session.isAdminView ? 'SAIR' : 'MINIMIZAR'}
        </button>
        
        <button 
          onClick={() => { if(!session.isAdminView) onTogglePause(true); setIsConfirmingFinish(true); }}
          disabled={isFinishing}
          className={`flex-1 max-w-sm py-4 font-black uppercase tracking-widest text-[10px] rounded-[20px] shadow-lg transition-all flex items-center justify-center gap-3 active:scale-95 ${
            session.isRealScenario
            ? 'bg-red-700 hover:bg-red-800 text-white shadow-red-600/30'
            : (session.isAdminView ? 'bg-red-600 text-white' : 'bg-blue-600 text-white shadow-blue-600/20')
          }`}
        >
          {isFinishing ? (
            <i className="fa-solid fa-circle-notch animate-spin"></i>
          ) : (
            <>
              <i className={`fa-solid ${session.isAdminView || session.isRealScenario ? 'fa-power-off' : 'fa-circle-check'}`}></i>
              {session.isRealScenario ? 'ENCERRAR REAL' : (session.isAdminView ? 'FECHAR MONITOR' : 'FINALIZAR')}
            </>
          )}
        </button>
      </div>

      {isConfirmingFinish && (
        <div className="fixed inset-0 z-[101] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] max-w-sm w-full p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-black text-slate-900 mb-2 text-center uppercase tracking-tight">
              {session.isRealScenario ? 'Encerrar Emergência?' : 'Finalizar Registro?'}
            </h3>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest text-center mb-8">
              {session.isRealScenario 
                ? 'Confirme o fim da ocorrência real na baleeira.' 
                : 'O relatório de treinamento será gerado.'}
            </p>
            <div className="grid gap-3">
              <button 
                onClick={handleFinish} 
                className={`w-full py-4 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-lg ${
                  session.isRealScenario ? 'bg-red-600 shadow-red-600/20' : 'bg-blue-600 shadow-blue-600/20'
                }`}
              >
                CONFIRMAR
              </button>
              <button 
                onClick={() => { if(!session.isAdminView) onTogglePause(false); setIsConfirmingFinish(false); }} 
                className="w-full py-4 bg-slate-100 text-slate-400 font-black rounded-2xl text-[10px] uppercase tracking-widest"
              >
                CANCELAR
              </button>
            </div>
          </div>
        </div>
      )}

      {isFinished && (
        <div className="fixed inset-0 z-[102] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] max-md w-full p-10 shadow-2xl animate-in fade-in zoom-in duration-300 flex flex-col items-center">
            <div className={`w-20 h-20 rounded-[28px] flex items-center justify-center text-white mb-6 shadow-xl ${
              session.isRealScenario ? 'bg-red-600 shadow-red-600/30' : 'bg-blue-600 shadow-blue-600/30'
            }`}>
              <i className="fa-solid fa-check text-4xl"></i>
            </div>
            
            <h3 className="text-2xl font-black text-slate-900 mb-2 text-center uppercase tracking-tight">
              {session.isRealScenario ? 'OCORRÊNCIA REGISTRADA' : 'CONCLUÍDO'}
            </h3>
            <p className="text-slate-500 text-[9px] font-black mb-8 text-center uppercase tracking-[0.3em]">LIFESAFE ODN1 - NS-41</p>
            
            <div className="w-full space-y-3">
              <button 
                onClick={exportToExcel}
                className={`w-full py-5 text-white font-black rounded-[24px] text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-lg active:scale-95 ${
                  session.isRealScenario ? 'bg-slate-900' : 'bg-emerald-600 shadow-emerald-600/20'
                }`}
              >
                <i className="fa-solid fa-file-excel"></i>
                EXPORTAR RELATÓRIO
              </button>
              
              <button 
                onClick={onFinish}
                className="w-full py-5 bg-slate-100 text-slate-900 font-black rounded-[24px] text-[10px] uppercase tracking-widest active:scale-95 transition-all"
              >
                VOLTAR AO INÍCIO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingSession;

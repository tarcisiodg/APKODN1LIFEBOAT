
import React, { useState } from 'react';

interface NfcEnrollmentProps {
  onBack: () => void;
}

const NfcEnrollment: React.FC<NfcEnrollmentProps> = ({ onBack }) => {
  const [textToGrave, setTextToGrave] = useState('');
  const [status, setStatus] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleWriteTag = async () => {
    if (!textToGrave.trim()) {
      alert("Por favor, digite o nome ou descrição antes de gravar.");
      return;
    }

    if (!('NDEFReader' in window)) {
      alert("NFC não suportado neste dispositivo ou navegador.");
      return;
    }

    setStatus('waiting');
    setErrorMsg('');

    try {
      // @ts-ignore
      const ndef = new (window as any).NDEFReader();
      await ndef.write({
        records: [{ recordType: "text", data: textToGrave.trim() }]
      });
      
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
      setTextToGrave('');
    } catch (error: any) {
      console.error("Erro ao gravar NFC:", error);
      setStatus('error');
      setErrorMsg(error.name === 'NotAllowedError' ? "Permissão negada." : "Falha na gravação. Tente novamente.");
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 max-w-4xl mx-auto w-full pb-40 animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all shadow-sm active:scale-95">
          <i className="fa-solid fa-chevron-left"></i>
        </button>
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Gravação de Tags</h2>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest opacity-60">Personalizar cartões NFC</p>
        </div>
      </div>

      <div className="bg-white rounded-[40px] border border-slate-100 shadow-2xl shadow-slate-200/50 p-8 space-y-8">
        <div className="text-center">
          <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-[28px] flex items-center justify-center mx-auto mb-6 shadow-inner">
            <i className={`fa-solid ${status === 'waiting' ? 'fa-spinner animate-spin' : status === 'success' ? 'fa-check-double text-emerald-500' : 'fa-pen-to-square'} text-3xl`}></i>
          </div>
          <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
            {status === 'waiting' ? 'Aproxime a Tag' : status === 'success' ? 'Gravado com Sucesso!' : 'Preparar Gravação'}
          </h3>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">
            {status === 'waiting' ? 'Mantenha a tag encostada no leitor' : 'O texto abaixo será salvo na memória da tag'}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome ou Descrição (Ex: Nome do Funcionário)</label>
            <input 
              type="text" 
              value={textToGrave}
              disabled={status === 'waiting'}
              onChange={(e) => setTextToGrave(e.target.value)}
              className="w-full px-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-blue-500 outline-none transition-all uppercase"
              placeholder="DIGITE O NOME AQUI..."
            />
          </div>

          <button 
            onClick={handleWriteTag}
            disabled={status === 'waiting' || !textToGrave}
            className={`w-full py-5 rounded-2xl font-black uppercase tracking-widest text-[11px] text-white shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 ${
              status === 'waiting' ? 'bg-slate-400' : status === 'success' ? 'bg-emerald-600' : 'bg-blue-600 shadow-blue-600/20'
            }`}
          >
            <i className="fa-solid fa-bolt"></i>
            {status === 'waiting' ? 'AGUARDANDO APROXIMAÇÃO...' : 'INICIAR GRAVAÇÃO'}
          </button>
        </div>

        {status === 'error' && (
          <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-[10px] font-black uppercase text-center animate-in shake duration-300">
            {errorMsg}
          </div>
        )}
      </div>

      <div className="mt-8 bg-blue-50/50 p-6 rounded-3xl border border-blue-100/50">
        <h4 className="text-[9px] font-black text-blue-800 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
          <i className="fa-solid fa-circle-info"></i> Instruções
        </h4>
        <ul className="text-[9px] font-bold text-blue-700/60 uppercase space-y-1.5 leading-relaxed">
          <li>1. Digite o nome no campo acima.</li>
          <li>2. Clique no botão azul de gravação.</li>
          <li>3. Encoste a tag NFC na parte de trás do seu celular.</li>
          <li>4. Mantenha por 2 segundos até o aviso de sucesso.</li>
        </ul>
      </div>
    </div>
  );
};

export default NfcEnrollment;


import React, { useState, useEffect, useRef } from 'react';
import { Berth, LifeboatType } from '../types';
import { cloudService } from '../services/cloudService';

interface BerthManagementProps {
  onBack: () => void;
}

const LIFEBOATS: LifeboatType[] = [
  'Lifeboat 1', 'Lifeboat 2', 'Lifeboat 3', 
  'Lifeboat 4', 'Lifeboat 5', 'Lifeboat 6'
];

const BerthManagement: React.FC<BerthManagementProps> = ({ onBack }) => {
  const [berths, setBerths] = useState<Berth[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadBerths();
  }, []);

  const loadBerths = async () => {
    setIsLoading(true);
    try {
      const data = await cloudService.getBerths();
      setBerths(data);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  const downloadTemplate = () => {
    const header = "LEITO;ID TAG;NOME;BALEEIRA;BALEEIRA SECUNDÁRIA\n";
    const example = "101-A;04:A1:B2:C3:D4:E5:F6;JOÃO SILVA;Lifeboat 1;Lifeboat 2\n101-B;04:AA:BB:CC:DD:EE:FF;MARIA SOUZA;Lifeboat 1;\n";
    const blob = new Blob(["\uFEFF" + header + example], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "MODELO_POB_LIFESAFE.csv";
    link.click();
  };

  const handleClearAll = async () => {
    setIsLoading(true);
    try {
      await cloudService.clearBerths();
      await loadBerths();
      setIsConfirmingClear(false);
      alert("Toda a base de POB foi excluída.");
    } catch (e) { alert("Erro ao excluir."); }
    finally { setIsLoading(false); }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const newBerths: Berth[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const parts = line.includes(';') ? line.split(';') : line.split(',');
        if (parts.length >= 4) {
          const id = parts[0].trim();
          const tagId = parts[1].trim();
          const crewName = parts[2].trim();
          const lbInput = parts[3].trim();
          const secondaryLbInput = parts[4] ? parts[4].trim() : null;
          
          const lifeboat = LIFEBOATS.find(l => l.toLowerCase().includes(lbInput.toLowerCase())) || 'Lifeboat 1';
          const secondaryLifeboat = secondaryLbInput 
            ? LIFEBOATS.find(l => l.toLowerCase().includes(secondaryLbInput.toLowerCase())) 
            : undefined;
          
          newBerths.push({ 
            id, 
            tagId,
            crewName, 
            lifeboat,
            secondaryLifeboat: secondaryLifeboat as LifeboatType | undefined
          });
        }
      }

      if (newBerths.length > 0) {
        setIsLoading(true);
        await cloudService.saveBerths(newBerths);
        await loadBerths();
        alert(`${newBerths.length} registros importados.`);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filteredBerths = berths.filter(b => 
    b.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
    b.tagId.toLowerCase().includes(searchTerm.toLowerCase()) || 
    b.crewName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col p-6 max-w-6xl mx-auto w-full pb-40 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm active:scale-95">
            <i className="fa-solid fa-chevron-left"></i>
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase leading-none">Gestão de POB</h2>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">Vinculação de TAGS e Leitos</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
           <button onClick={downloadTemplate} className="flex-1 md:flex-none bg-slate-100 text-slate-600 px-4 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 border border-slate-200">
             <i className="fa-solid fa-download"></i> Modelo
           </button>
           <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
           <button onClick={() => fileInputRef.current?.click()} className="flex-1 md:flex-none bg-emerald-600 text-white px-4 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg active:scale-95 flex items-center justify-center gap-2">
             <i className="fa-solid fa-file-import"></i> Importar
           </button>
           <button onClick={() => setIsConfirmingClear(true)} disabled={berths.length === 0} className={`flex-1 md:flex-none px-4 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border ${berths.length > 0 ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-slate-50 text-slate-300'}`}>
             <i className="fa-solid fa-trash-can"></i> Excluir
           </button>
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-100 shadow-xl overflow-hidden flex flex-col flex-1">
        <div className="p-4 border-b border-slate-50 bg-slate-50/50 flex items-center gap-3">
          <i className="fa-solid fa-magnifying-glass text-slate-400"></i>
          <input type="text" placeholder="Filtrar por nome, leito ou ID da Tag..." className="bg-transparent border-none outline-none text-xs font-bold w-full" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <i className="fa-solid fa-rotate animate-spin text-blue-500 text-3xl"></i>
              <p className="text-[10px] font-black text-slate-400 uppercase">Processando...</p>
            </div>
          ) : filteredBerths.length === 0 ? (
            <div className="text-center py-20 opacity-40">
              <i className="fa-solid fa-id-card text-5xl text-slate-200 mb-4"></i>
              <p className="text-[10px] font-black text-slate-400 uppercase">Nenhum vínculo encontrado.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
                <tr>
                  <th className="p-5 text-[9px] font-black text-slate-400 uppercase">Leito</th>
                  <th className="p-5 text-[9px] font-black text-slate-400 uppercase">ID da Tag</th>
                  <th className="p-5 text-[9px] font-black text-slate-400 uppercase">Tripulante</th>
                  <th className="p-5 text-[9px] font-black text-slate-400 uppercase">Primária</th>
                  <th className="p-5 text-[9px] font-black text-slate-400 uppercase">Secundária</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredBerths.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-5"><span className="bg-slate-900 text-white px-2 py-1 rounded text-[10px] font-mono font-bold">{b.id}</span></td>
                    <td className="p-5 font-mono text-[10px] text-blue-600 font-bold">{b.tagId}</td>
                    <td className="p-5 text-xs font-black text-slate-800 uppercase">{b.crewName}</td>
                    <td className="p-5"><span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded uppercase">{b.lifeboat}</span></td>
                    <td className="p-5">{b.secondaryLifeboat ? <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded uppercase">{b.secondaryLifeboat}</span> : <span className="text-[8px] text-slate-300 italic">N/A</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isConfirmingClear && (
        <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] max-w-sm w-full p-10 shadow-2xl text-center">
            <h3 className="text-xl font-black text-slate-900 mb-4 uppercase">Limpar POB?</h3>
            <p className="text-slate-500 text-[10px] font-bold uppercase mb-8">Esta ação removerá todos os {berths.length} registros.</p>
            <div className="grid gap-3">
              <button onClick={handleClearAll} className="w-full py-4 bg-rose-600 text-white font-black rounded-2xl text-[10px] uppercase">Confirmar Exclusão</button>
              <button onClick={() => setIsConfirmingClear(false)} className="w-full py-4 bg-slate-100 text-slate-500 font-black rounded-2xl text-[10px] uppercase">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BerthManagement;

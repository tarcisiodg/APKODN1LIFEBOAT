import React, { useState, useEffect, useRef } from 'react';
import { Berth, LifeboatType } from '../types';
import { cloudService } from '../services/cloudService';
import * as XLSX from 'xlsx';

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isScanning, setIsScanning] = useState<string | null>(null);
  const [isDuplicateWarningOpen, setIsDuplicateWarningOpen] = useState(false);
  const [duplicateBerthId, setDuplicateBerthId] = useState<string | null>(null);
  
  const [newBerth, setNewBerth] = useState<Partial<Berth>>({
    id: '', tagId1: '', tagId2: '', tagId3: '', crewName: '',
    role: '', company: '',
    lifeboat: 'Lifeboat 1', secondaryLifeboat: 'Lifeboat 2'
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const nfcAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadBerths();
    return () => stopNfcScan();
  }, []);

  const loadBerths = async () => {
    setIsLoading(true);
    try {
      const data = await cloudService.getBerths();
      setBerths(data);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  const stopNfcScan = () => {
    if (nfcAbortControllerRef.current) {
      nfcAbortControllerRef.current.abort();
      nfcAbortControllerRef.current = null;
    }
    setIsScanning(null);
  };

  const handleScanTag = async (field: string) => {
    if (!('NDEFReader' in window)) {
      alert("NFC não suportado ou desabilitado.");
      return;
    }
    if (nfcAbortControllerRef.current) nfcAbortControllerRef.current.abort();
    nfcAbortControllerRef.current = new AbortController();
    const signal = nfcAbortControllerRef.current.signal;

    try {
      setIsScanning(field);
      const reader = new (window as any).NDEFReader();
      await reader.scan({ signal });

      reader.addEventListener("reading", ({ serialNumber }: any) => {
        const tagId = serialNumber?.toUpperCase();
        if (tagId) {
          // Check for duplicates in other berths
          const duplicateBerth = berths.find(b => 
            (b.id !== newBerth.id) && (b.tagId1 === tagId || b.tagId2 === tagId || b.tagId3 === tagId)
          );
          
          if (duplicateBerth) {
            setDuplicateBerthId(duplicateBerth.id);
            setIsDuplicateWarningOpen(true);
            stopNfcScan();
            return;
          }

          // Check for duplicates in the same berth (other fields)
          const otherFields = ['tagId1', 'tagId2', 'tagId3'].filter(f => f !== field);
          const isDuplicateInSameBerth = otherFields.some(f => (newBerth as any)[f] === tagId);
          
          if (isDuplicateInSameBerth) {
            setDuplicateBerthId(newBerth.id || 'ATUAL');
            setIsDuplicateWarningOpen(true);
            stopNfcScan();
            return;
          }

          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          setNewBerth(prev => ({ ...prev, [field]: tagId }));
          stopNfcScan();
        }
      }, { once: true });
    } catch (error: any) {
      if (error.name !== 'AbortError') stopNfcScan();
    }
  };

  const handleEditClick = (berth: Berth) => {
    setIsEditing(true);
    setNewBerth(berth);
    setIsModalOpen(true);
  };

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBerth.id) return;
    setIsLoading(true);
    try {
      await cloudService.saveBerth(newBerth as Berth);
      await loadBerths();
      setIsModalOpen(false);
    } catch (err) { alert("Erro ao salvar."); } 
    finally { setIsLoading(false); }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const detailsMap: Record<string, any> = {};
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          const id = String(row[2] || '').trim().toUpperCase();
          if (id) detailsMap[id] = { crewName: String(row[8] || '').toUpperCase(), role: String(row[9] || '').toUpperCase(), company: String(row[12] || '').toUpperCase() };
        }
        await cloudService.saveBerthNames(detailsMap);
        await loadBerths();
      } catch (err) { alert("Erro na importação."); } finally { setIsLoading(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  const filteredBerths = berths.filter(b => 
    b.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
    b.crewName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 2xl:max-w-[1600px] max-w-full mx-auto w-full pb-40 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-100 text-slate-600 shadow-sm active:scale-90">
            <i className="fa-solid fa-chevron-left"></i>
          </button>
          <div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 uppercase">Gestão de POB</h2>
            <p className="text-slate-400 text-[9px] font-bold uppercase mt-1">Mapeamento de Leitos</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
           <button onClick={() => { setIsEditing(false); setNewBerth({ id: '', tagId1: '', tagId2: '', tagId3: '', crewName: '', role: '', company: '', lifeboat: 'Lifeboat 1', secondaryLifeboat: 'Lifeboat 2' }); setIsModalOpen(true); }} className="flex-1 md:flex-none bg-emerald-600 text-white px-4 py-3 rounded-xl text-[9px] font-bold uppercase shadow-sm active:scale-95"><i className="fa-solid fa-plus"></i> Novo</button>
           <button onClick={() => fileInputRef.current?.click()} className="flex-1 md:flex-none bg-blue-600 text-white px-4 py-3 rounded-xl text-[9px] font-bold uppercase shadow-sm active:scale-95"><i className="fa-solid fa-file-excel"></i> Importar</button>
           <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv, .xlsx, .xlsm" className="hidden" />
           <button onClick={() => setIsConfirmingClear(true)} className="flex-1 md:flex-none bg-rose-50 text-rose-600 px-4 py-3 rounded-xl text-[9px] font-bold uppercase border border-rose-100 active:scale-95 shadow-sm"><i className="fa-solid fa-user-minus"></i> Limpar</button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col flex-1 min-h-[400px]">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <i className="fa-solid fa-magnifying-glass text-slate-400"></i>
          <input type="text" placeholder="Filtrar leitos ou nomes..." className="bg-transparent border-none outline-none text-xs font-bold w-full uppercase" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <i className="fa-solid fa-rotate animate-spin text-blue-500 text-3xl"></i>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sincronizando...</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-full lg:min-w-0">
              <thead className="sticky top-0 bg-white z-10 border-b border-slate-200">
                <tr>
                  <th className="p-3 xl:p-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Ação</th>
                  <th className="p-3 xl:p-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Leito</th>
                  <th className="p-3 xl:p-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Tripulante</th>
                  <th className="p-3 xl:p-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Função</th>
                  <th className="p-3 xl:p-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Empresa</th>
                  <th className="p-3 xl:p-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Helideck</th>
                  <th className="p-3 xl:p-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Proa</th>
                  <th className="p-3 xl:p-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Popa</th>
                  <th className="p-3 xl:p-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">Primária</th>
                  <th className="p-3 xl:p-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">Secundária</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBerths.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 xl:p-4">
                      <button onClick={() => handleEditClick(b)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-blue-600 hover:text-white flex items-center justify-center transition-all shadow-sm">
                        <i className="fa-solid fa-pencil text-[10px]"></i>
                      </button>
                    </td>
                    <td className="p-3 xl:p-4">
                      <span className="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold shadow-sm whitespace-nowrap inline-block">
                        {b.id}
                      </span>
                    </td>
                    <td className="p-3 xl:p-4"><span className={`text-xs font-bold uppercase tracking-tight ${b.crewName ? 'text-slate-800' : 'text-slate-200 italic opacity-50'}`}>{b.crewName || 'VAZIO'}</span></td>
                    <td className="p-3 xl:p-4 text-[10px] font-medium text-slate-500 uppercase">{b.role || '-'}</td>
                    <td className="p-3 xl:p-4 text-[10px] font-bold text-blue-600 uppercase">{b.company || '-'}</td>
                    <td className="p-3 xl:p-4 font-mono text-[9px] text-blue-600 font-bold">{b.tagId1 || '-'}</td>
                    <td className="p-3 xl:p-4 font-mono text-[9px] text-slate-400 font-bold">{b.tagId2 || '-'}</td>
                    <td className="p-3 xl:p-4 font-mono text-[9px] text-slate-400 font-bold">{b.tagId3 || '-'}</td>
                    <td className="p-3 xl:p-4 text-center"><span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full uppercase">{b.lifeboat}</span></td>
                    <td className="p-3 xl:p-4 text-center"><span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full uppercase">{b.secondaryLifeboat || '-'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] max-w-2xl w-full p-8 shadow-md animate-in zoom-in duration-300 overflow-y-auto max-h-[90vh] custom-scrollbar">
            {isScanning && (
              <div className="absolute inset-0 bg-blue-600/95 backdrop-blur-md z-[120] flex flex-col items-center justify-center p-10 text-center text-white">
                <i className="fa-solid fa-rss text-5xl mb-6 animate-pulse"></i>
                <h4 className="text-xl font-bold uppercase mb-2">Aproxime a TAG</h4>
                <p className="text-xs font-bold text-blue-100 uppercase mb-8">Campo: {isScanning.toUpperCase()}</p>
                <button onClick={stopNfcScan} className="px-8 py-3 bg-white text-blue-600 rounded-xl font-bold uppercase text-[10px] shadow-sm">Cancelar</button>
              </div>
            )}
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 uppercase">EDITAR LEITO</h3>
              <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 active:scale-95"><i className="fa-solid fa-xmark text-lg"></i></button>
            </div>
            <form onSubmit={handleAddManual} className="space-y-4">
              <div className="grid grid-cols-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">ID DO LEITO</label>
                <input type="text" required disabled={isEditing} value={newBerth.id} onChange={e => setNewBerth({...newBerth, id: e.target.value.toUpperCase()})} className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold uppercase outline-none focus:ring-1 focus:ring-blue-100" placeholder="301-A" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">TAG HELIDECK</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input type="text" value={newBerth.tagId1 || ''} readOnly className="w-full px-5 py-3 bg-slate-100 border border-slate-100 rounded-xl text-[10px] font-mono font-bold uppercase pr-10" />
                      {newBerth.tagId1 && (
                        <button type="button" onClick={() => setNewBerth({...newBerth, tagId1: ''})} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors">
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      )}
                    </div>
                    <button 
                      type="button" 
                      onClick={() => handleScanTag('tagId1')} 
                      className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm active:scale-90 transition-all ${newBerth.tagId1 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}
                    >
                      {newBerth.tagId1 ? <i className="fa-solid fa-id-card"></i> : <i className="fa-solid fa-rss"></i>}
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">TAG PROA</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input type="text" value={newBerth.tagId2 || ''} readOnly className="w-full px-5 py-3 bg-slate-100 border border-slate-100 rounded-xl text-[10px] font-mono font-bold uppercase pr-10" />
                      {newBerth.tagId2 && (
                        <button type="button" onClick={() => setNewBerth({...newBerth, tagId2: ''})} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors">
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      )}
                    </div>
                    <button 
                      type="button" 
                      onClick={() => handleScanTag('tagId2')} 
                      className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm active:scale-90 transition-all ${newBerth.tagId2 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}
                    >
                      {newBerth.tagId2 ? <i className="fa-solid fa-id-card"></i> : <i className="fa-solid fa-rss"></i>}
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">TRIPULANTE</label>
                  <input type="text" value={newBerth.crewName} onChange={e => setNewBerth({...newBerth, crewName: e.target.value.toUpperCase()})} className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold uppercase outline-none focus:ring-1 focus:ring-blue-100" placeholder="NOME COMPLETO" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">TAG POPA</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input type="text" value={newBerth.tagId3 || ''} readOnly className="w-full px-5 py-3 bg-slate-100 border border-slate-100 rounded-xl text-[10px] font-mono font-bold uppercase pr-10" />
                      {newBerth.tagId3 && (
                        <button type="button" onClick={() => setNewBerth({...newBerth, tagId3: ''})} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors">
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      )}
                    </div>
                    <button 
                      type="button" 
                      onClick={() => handleScanTag('tagId3')} 
                      className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm active:scale-90 transition-all ${newBerth.tagId3 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}
                    >
                      {newBerth.tagId3 ? <i className="fa-solid fa-id-card"></i> : <i className="fa-solid fa-rss"></i>}
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">FUNÇÃO</label>
                  <input type="text" value={newBerth.role} onChange={e => setNewBerth({...newBerth, role: e.target.value.toUpperCase()})} className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold uppercase outline-none focus:ring-1 focus:ring-blue-100" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">EMPRESA</label>
                  <input type="text" value={newBerth.company} onChange={e => setNewBerth({...newBerth, company: e.target.value.toUpperCase()})} className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold uppercase outline-none focus:ring-1 focus:ring-blue-100" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">BALEIRA PRIMÁRIA</label>
                  <select value={newBerth.lifeboat} onChange={e => setNewBerth({...newBerth, lifeboat: e.target.value as LifeboatType})} className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-bold uppercase focus:ring-1 focus:ring-blue-100">
                    {LIFEBOATS.map(lb => <option key={lb} value={lb}>{lb}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">BALEIRA SECUNDÁRIA</label>
                  <select value={newBerth.secondaryLifeboat} onChange={e => setNewBerth({...newBerth, secondaryLifeboat: e.target.value as LifeboatType})} className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-bold uppercase focus:ring-1 focus:ring-blue-100">
                    {LIFEBOATS.map(lb => <option key={lb} value={lb}>{lb}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-2 pt-4 border-t border-slate-100">
                <button type="submit" disabled={isLoading} className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl text-[10px] uppercase shadow-sm active:scale-95">{isLoading ? 'SALVANDO...' : 'SALVAR ALTERAÇÕES'}</button>
                <button type="button" onClick={() => setIsModalOpen(false)} className="w-full py-4 bg-slate-100 text-slate-500 font-bold rounded-xl text-[10px] uppercase">CANCELAR</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isConfirmingClear && (
        <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[32px] max-sm w-full p-8 shadow-md animate-in zoom-in duration-300">
            <h3 className="text-xl font-bold text-slate-900 mb-4 uppercase">Limpar Tripulantes?</h3>
            <p className="text-slate-500 text-[10px] font-bold uppercase mb-8 leading-relaxed">Removerá nomes e funções de todos os leitos, mantendo apenas o mapeamento básico.</p>
            <div className="grid gap-3">
              <button onClick={async () => { await cloudService.clearBerthNames(); await loadBerths(); setIsConfirmingClear(false); }} className="w-full py-4 bg-rose-600 text-white font-bold rounded-xl text-xs uppercase active:scale-95 shadow-sm">Sim, Limpar</button>
              <button onClick={() => setIsConfirmingClear(false)} className="w-full py-4 bg-slate-100 text-slate-400 font-bold rounded-xl text-xs uppercase">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {isDuplicateWarningOpen && (
        <div className="fixed inset-0 z-[300] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[40px] max-w-sm w-full p-10 shadow-2xl animate-in zoom-in duration-300 border border-slate-100">
            <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fa-solid fa-triangle-exclamation text-3xl"></i>
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">TAG JÁ CADASTRADA</h3>
            <p className="text-slate-500 text-[11px] font-bold uppercase mb-8 leading-relaxed">
              Este cartão já está vinculado ao leito <span className="text-rose-600 font-black">{duplicateBerthId}</span>.
              <br/>Utilize outro cartão ou remova o vínculo anterior.
            </p>
            <button 
              onClick={() => setIsDuplicateWarningOpen(false)} 
              className="w-full py-5 bg-slate-900 text-white font-bold rounded-2xl text-xs uppercase active:scale-95 shadow-lg shadow-slate-200 transition-all"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BerthManagement;
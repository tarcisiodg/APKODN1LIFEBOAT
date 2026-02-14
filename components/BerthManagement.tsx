
import React, { useState, useEffect, useRef } from 'react';
import { Berth, LifeboatType } from '../types';
import { cloudService } from '../services/cloudService';
import * as XLSX from 'https://esm.sh/xlsx';

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
  
  const [newBerth, setNewBerth] = useState<Partial<Berth>>({
    id: '', tagId1: '', tagId2: '', tagId3: '', crewName: '',
    role: '', company: '',
    lifeboat: 'Lifeboat 1', secondaryLifeboat: 'Lifeboat 2'
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const nfcReaderRef = useRef<any>(null);

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
    setIsScanning(null);
    if (nfcReaderRef.current) {
      nfcReaderRef.current = null;
    }
  };

  const handleScanTag = async (field: string) => {
    if (!('NDEFReader' in window)) {
      alert("NFC não suportado ou desabilitado neste navegador.");
      return;
    }

    try {
      setIsScanning(field);
      const reader = new (window as any).NDEFReader();
      nfcReaderRef.current = reader;
      await reader.scan();

      reader.addEventListener("reading", ({ serialNumber }: any) => {
        const tagId = serialNumber?.toUpperCase();
        if (tagId) {
          // Validação de Duplicidade
          // 1. Verificar no formulário atual
          const otherFields = ['tagId1', 'tagId2', 'tagId3'].filter(f => f !== field);
          const existsInCurrentForm = otherFields.some(f => (newBerth as any)[f] === tagId);
          
          // 2. Verificar em outros leitos do sistema
          const existsInSystem = berths.some(b => 
            (b.id !== newBerth.id) && (b.tagId1 === tagId || b.tagId2 === tagId || b.tagId3 === tagId)
          );

          if (existsInCurrentForm || existsInSystem) {
            if (navigator.vibrate) navigator.vibrate([500]);
            alert("Cartão já cadastrado em outro campo ou leito!");
            stopNfcScan();
            return;
          }

          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          setNewBerth(prev => ({ ...prev, [field]: tagId }));
          stopNfcScan();
        }
      });

      reader.addEventListener("readingerror", () => {
        alert("Erro ao ler TAG. Aproxime novamente.");
        stopNfcScan();
      });

    } catch (error) {
      console.error("NFC Error:", error);
      alert("Não foi possível iniciar o scanner NFC.");
      stopNfcScan();
    }
  };

  const handleOpenAdd = () => {
    setIsEditing(false);
    setNewBerth({ id: '', tagId1: '', tagId2: '', tagId3: '', crewName: '', role: '', company: '', lifeboat: 'Lifeboat 1', secondaryLifeboat: 'Lifeboat 2' });
    setIsModalOpen(true);
  };

  const handleEditClick = (berth: Berth) => {
    setIsEditing(true);
    setNewBerth(berth);
    setIsModalOpen(true);
  };

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBerth.id) {
      alert("O ID do Leito é obrigatório.");
      return;
    }

    setIsLoading(true);
    try {
      await cloudService.saveBerth(newBerth as Berth);
      await loadBerths();
      setIsModalOpen(false);
    } catch (err) {
      alert("Erro ao salvar leito.");
    } finally {
      setIsLoading(false);
    }
  };

  const downloadTemplate = () => {
    const header = "COLUNA A;COLUNA B;LEITO (C);COLUNA D;COLUNA E;COLUNA F;COLUNA G;COLUNA H;NOME (I);FUNÇÃO (J);COLUNA K;COLUNA L;EMPRESA (M)\n";
    const example = ";;101-A;;;;;;JOÃO SILVA;RADIO OPERADOR;;;FORESEA\n;;101-B;;;;;;MARIA SOUZA;TECNICO;;;FORESEA";
    const blob = new Blob(["\uFEFF" + header + example], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "MODELO_IMPORTACAO_POB.csv";
    link.click();
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
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length < 1) {
          alert("O arquivo está vazio.");
          setIsLoading(false);
          return;
        }

        const LEITO_COL_IDX = 2; 
        const NOME_COL_IDX = 8;
        const FUNCAO_COL_IDX = 9;
        const EMPRESA_COL_IDX = 12;

        const detailsMap: Record<string, { crewName: string, role: string, company: string }> = {};
        let updatedCount = 0;

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length <= LEITO_COL_IDX) continue;

          const leitoId = String(row[LEITO_COL_IDX] || '').trim().toUpperCase();
          const crewName = String(row[NOME_COL_IDX] || '').trim().toUpperCase();
          const role = String(row[FUNCAO_COL_IDX] || '').trim().toUpperCase();
          const company = String(row[EMPRESA_COL_IDX] || '').trim().toUpperCase();

          if (leitoId) {
            detailsMap[leitoId] = { crewName, role, company };
            updatedCount++;
          }
        }

        if (updatedCount > 0) {
          await cloudService.saveBerthNames(detailsMap);
          await loadBerths();
          alert(`${updatedCount} leitos atualizados com sucesso.`);
        } else {
          alert("Nenhum leito encontrado para importar.");
        }
      } catch (err) {
        console.error("Erro importação:", err);
        alert("Erro ao ler o arquivo Excel.");
      } finally {
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const filteredBerths = berths.filter(b => 
    b.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
    b.crewName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (b.company && b.company.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="flex-1 flex flex-col p-6 max-w-7xl mx-auto w-full pb-40 animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm transition-all">
            <i className="fa-solid fa-chevron-left"></i>
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase leading-none">Gestão de POB</h2>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">Sincronização Avançada de Tripulantes</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
           <button onClick={handleOpenAdd} className="flex-1 md:flex-none bg-emerald-600 text-white px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg active:scale-95 flex items-center justify-center gap-2 transition-all">
             <i className="fa-solid fa-plus"></i> Novo Leito
           </button>
           <button onClick={downloadTemplate} className="flex-1 md:flex-none bg-white text-slate-600 px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest border border-slate-200 active:scale-95 transition-all flex items-center justify-center gap-2">
             <i className="fa-solid fa-download"></i> Baixar Modelo
           </button>
           <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv, .xlsx, .xlsm" className="hidden" />
           <button 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isLoading}
            className="flex-1 md:flex-none bg-blue-600 text-white px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
           >
             <i className="fa-solid fa-file-excel"></i> {isLoading ? 'Processando...' : 'Importar XLSM'}
           </button>
           <button onClick={() => setIsConfirmingClear(true)} className="flex-1 md:flex-none bg-rose-50 text-rose-600 px-4 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest border border-rose-100 active:scale-95 flex items-center justify-center gap-2">
             <i className="fa-solid fa-user-minus"></i> Limpar Tripulantes
           </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-[32px] border border-slate-100 shadow-xl overflow-hidden flex flex-col flex-1 min-h-[400px]">
        <div className="p-4 border-b border-slate-50 bg-slate-50/50 flex items-center gap-3">
          <i className="fa-solid fa-magnifying-glass text-slate-400"></i>
          <input type="text" placeholder="Filtrar por Leito, Tripulante ou Empresa..." className="bg-transparent border-none outline-none text-xs font-bold w-full uppercase" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <i className="fa-solid fa-rotate animate-spin text-blue-500 text-3xl"></i>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Processando...</p>
            </div>
          ) : filteredBerths.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-32 opacity-30">
               <i className="fa-solid fa-inbox text-5xl mb-4"></i>
               <p className="text-[10px] font-black uppercase tracking-widest">Nenhum leito cadastrado</p>
             </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[1500px]">
              <thead className="sticky top-0 bg-white z-10 border-b border-slate-100 shadow-sm">
                <tr>
                  <th className="p-5 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-white">Ação</th>
                  <th className="p-5 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-white">Leito</th>
                  <th className="p-5 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-white">Tripulante</th>
                  <th className="p-5 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-white">Função</th>
                  <th className="p-5 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-white">Empresa</th>
                  <th className="p-5 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-white">Tag Helideck</th>
                  <th className="p-5 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-white">Tag Proa</th>
                  <th className="p-5 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-white">Tag Popa</th>
                  <th className="p-5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center bg-white">Primária</th>
                  <th className="p-5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center bg-white">Secundária</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredBerths.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="p-5">
                      <button 
                        onClick={() => handleEditClick(b)}
                        className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-blue-600 hover:text-white flex items-center justify-center transition-all active:scale-90"
                      >
                        <i className="fa-solid fa-pencil text-[10px]"></i>
                      </button>
                    </td>
                    <td className="p-5"><span className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold">{b.id}</span></td>
                    <td className="p-5 truncate max-w-[200px]">
                      <span className={`text-xs font-black uppercase tracking-tight ${b.crewName ? 'text-slate-800' : 'text-slate-200 italic opacity-50'}`}>
                        {b.crewName || 'VAZIO'}
                      </span>
                    </td>
                    <td className="p-5 text-[10px] font-bold text-slate-500 uppercase">{b.role || '-'}</td>
                    <td className="p-5 text-[10px] font-black text-blue-600 uppercase">{b.company || '-'}</td>
                    <td className="p-5 font-mono text-[9px] text-blue-600 font-bold">{b.tagId1 || '-'}</td>
                    <td className="p-5 font-mono text-[9px] text-slate-400 font-bold">{b.tagId2 || '-'}</td>
                    <td className="p-5 font-mono text-[9px] text-slate-400 font-bold">{b.tagId3 || '-'}</td>
                    <td className="p-5 text-center"><span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full uppercase">{b.lifeboat}</span></td>
                    <td className="p-5 text-center"><span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full uppercase">{b.secondaryLifeboat}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* MODAL EDITAR LEITO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[48px] max-w-2xl w-full p-10 shadow-2xl animate-in zoom-in duration-300 relative overflow-hidden border-8 border-white">
            
            {isScanning && (
              <div className="absolute inset-0 bg-blue-600/95 backdrop-blur-md z-[120] flex flex-col items-center justify-center p-10 text-center animate-in fade-in duration-300">
                <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mb-6 animate-pulse">
                  <i className="fa-solid fa-nfc text-5xl text-white"></i>
                </div>
                <h4 className="text-xl font-black text-white uppercase mb-2">Aproxime a TAG agora</h4>
                <p className="text-white/60 text-[10px] uppercase font-bold tracking-widest">Digitalizando campo específico</p>
                <button onClick={stopNfcScan} className="mt-10 px-8 py-3 bg-white text-blue-600 rounded-2xl font-black text-[10px] uppercase shadow-lg">Cancelar Leitura</button>
              </div>
            )}

            <div className="flex justify-between items-center mb-10">
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">EDITAR LEITO</h3>
              <button onClick={() => setIsModalOpen(false)} className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-600 transition-all">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            
            <form onSubmit={handleAddManual} className="space-y-6">
              <div className="grid grid-cols-1 gap-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ID DO LEITO (OBRIGATÓRIO)</label>
                <input type="text" required disabled={isEditing} value={newBerth.id} onChange={e => setNewBerth({...newBerth, id: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black uppercase outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="301-A" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">TAG HELIDECK (PRINCIPAL)</label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input type="text" value={newBerth.tagId1 || ''} onChange={e => setNewBerth({...newBerth, tagId1: e.target.value.toUpperCase()})} className="w-full pl-6 pr-10 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-mono font-bold uppercase outline-none" placeholder="04:XX:XX:..." />
                      {newBerth.tagId1 && (
                        <button type="button" onClick={() => setNewBerth({...newBerth, tagId1: ''})} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-rose-500"><i className="fa-solid fa-circle-xmark"></i></button>
                      )}
                    </div>
                    <button type="button" onClick={() => handleScanTag('tagId1')} className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20 active:scale-90 transition-all">
                      <i className="fa-solid fa-wifi text-xl"></i>
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">TAG PROA</label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input type="text" value={newBerth.tagId2 || ''} onChange={e => setNewBerth({...newBerth, tagId2: e.target.value.toUpperCase()})} className="w-full pl-6 pr-10 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-mono font-bold uppercase outline-none" placeholder="Opcional" />
                      {newBerth.tagId2 && (
                        <button type="button" onClick={() => setNewBerth({...newBerth, tagId2: ''})} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-rose-500"><i className="fa-solid fa-circle-xmark"></i></button>
                      )}
                    </div>
                    <button type="button" onClick={() => handleScanTag('tagId2')} className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all active:scale-90">
                      <i className="fa-solid fa-wifi text-xl"></i>
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">TAG POPA</label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input type="text" value={newBerth.tagId3 || ''} onChange={e => setNewBerth({...newBerth, tagId3: e.target.value.toUpperCase()})} className="w-full pl-6 pr-10 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-mono font-bold uppercase outline-none" placeholder="Opcional" />
                      {newBerth.tagId3 && (
                        <button type="button" onClick={() => setNewBerth({...newBerth, tagId3: ''})} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-rose-500"><i className="fa-solid fa-circle-xmark"></i></button>
                      )}
                    </div>
                    <button type="button" onClick={() => handleScanTag('tagId3')} className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all active:scale-90">
                      <i className="fa-solid fa-wifi text-xl"></i>
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">TRIPULANTE</label>
                  <input type="text" value={newBerth.crewName} onChange={e => setNewBerth({...newBerth, crewName: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black uppercase outline-none" placeholder="NOME COMPLETO" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">FUNÇÃO</label>
                  <input type="text" value={newBerth.role} onChange={e => setNewBerth({...newBerth, role: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black uppercase outline-none" placeholder="EX: RADIO OPERADOR" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">EMPRESA</label>
                  <input type="text" value={newBerth.company} onChange={e => setNewBerth({...newBerth, company: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black uppercase outline-none" placeholder="EX: SOLSTAT" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">BALEEIRA PRIMÁRIA</label>
                  <select value={newBerth.lifeboat} onChange={e => setNewBerth({...newBerth, lifeboat: e.target.value as LifeboatType})} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-black uppercase outline-none">
                    {LIFEBOATS.map(lb => <option key={lb} value={lb}>{lb}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">BALEEIRA SECUNDÁRIA</label>
                  <select value={newBerth.secondaryLifeboat} onChange={e => setNewBerth({...newBerth, secondaryLifeboat: e.target.value as LifeboatType})} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-black uppercase outline-none">
                    {LIFEBOATS.map(lb => <option key={lb} value={lb}>{lb}</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-8 flex flex-col md:flex-row gap-4">
                <button type="submit" disabled={isLoading} className="flex-1 py-5 bg-blue-600 text-white font-black rounded-3xl text-[11px] uppercase tracking-widest shadow-2xl shadow-blue-600/30 active:scale-95 transition-all">
                  {isLoading ? 'SALVANDO...' : 'SALVAR ALTERAÇÕES'}
                </button>
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-10 py-5 bg-slate-100 text-slate-500 font-black rounded-3xl text-[11px] uppercase tracking-widest active:scale-95 transition-all">
                  CANCELAR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMAÇÃO CLEAR */}
      {isConfirmingClear && (
        <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[40px] max-w-sm w-full p-12 shadow-2xl animate-in zoom-in duration-300">
            <h3 className="text-xl font-black text-slate-900 mb-4 uppercase">Limpar Tripulantes?</h3>
            <p className="text-slate-500 text-[10px] font-bold uppercase mb-10 leading-relaxed tracking-wide">
              Esta ação removerá <span className="text-rose-600 font-black">NOMES, FUNÇÕES E EMPRESAS</span> de todos os leitos. As TAGs físicas serão mantidas nos registros.
            </p>
            <div className="grid gap-3">
              <button onClick={async () => { await cloudService.clearBerthNames(); await loadBerths(); setIsConfirmingClear(false); }} className="w-full py-5 bg-rose-600 text-white font-black rounded-3xl text-[10px] uppercase shadow-xl shadow-rose-600/20 active:scale-95 transition-all">Sim, Limpar</button>
              <button onClick={() => setIsConfirmingClear(false)} className="w-full py-5 bg-slate-100 text-slate-400 font-black rounded-3xl text-[10px] uppercase">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BerthManagement;

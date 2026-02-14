
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
        if (serialNumber) {
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          setNewBerth(prev => ({ ...prev, [field]: serialNumber.toUpperCase() }));
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
    setNewBerth({ id: '', tagId1: '', tagId2: '', tagId3: '', crewName: '', lifeboat: 'Lifeboat 1', secondaryLifeboat: 'Lifeboat 2' });
    setIsModalOpen(true);
  };

  const handleEditClick = (berth: Berth) => {
    setIsEditing(true);
    setNewBerth(berth);
    setIsModalOpen(true);
  };

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBerth.id || !newBerth.tagId1) {
      alert("Leito e Tag Helideck são obrigatórios.");
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
    const header = "COLUNA A;COLUNA B;LEITO (C);COLUNA D;COLUNA E;COLUNA F;COLUNA G;COLUNA H;NOME (I)\n";
    const example = ";;101-A;;;;;;JOÃO SILVA\n;;101-B;;;;;;MARIA SOUZA";
    const blob = new Blob(["\uFEFF" + header + example], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "MODELO_IMPORTACAO_COLUNAS.csv";
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
        
        // header: 1 retorna um array de arrays (linhas)
        const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length < 1) {
          alert("O arquivo está vazio ou não pôde ser lido.");
          setIsLoading(false);
          return;
        }

        // Conforme solicitado:
        // Coluna C é o Leito -> Índice 2
        // Coluna I é o Nome -> Índice 8
        const LEITO_COL_IDX = 2; 
        const NOME_COL_IDX = 8;

        const nameMap: Record<string, string> = {};
        let updatedCount = 0;

        // Itera a partir da segunda linha (i=1) para pular cabeçalhos se existirem
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length <= Math.max(LEITO_COL_IDX, NOME_COL_IDX)) continue;

          const leitoId = String(row[LEITO_COL_IDX] || '').trim().toUpperCase();
          const crewName = String(row[NOME_COL_IDX] || '').trim().toUpperCase();

          if (leitoId && crewName) {
            nameMap[leitoId] = crewName;
            updatedCount++;
          }
        }

        if (updatedCount > 0) {
          await cloudService.saveBerthNames(nameMap);
          await loadBerths();
          alert(`Sucesso! Foram encontrados ${updatedCount} vínculos de tripulantes processando as colunas C e I.`);
        } else {
          alert("Nenhum dado válido encontrado nas colunas C (Leito) e I (Nome). Verifique o arquivo.");
        }
      } catch (err) {
        console.error("Erro importação:", err);
        alert("Erro ao ler o arquivo Excel. Certifique-se de que é um formato válido (.xlsm, .xlsx ou .csv).");
      } finally {
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const filteredBerths = berths.filter(b => 
    b.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
    b.crewName.toLowerCase().includes(searchTerm.toLowerCase())
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
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">Sincronização de Leitos e Tripulantes</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
           <button onClick={handleOpenAdd} className="flex-1 md:flex-none bg-emerald-600 text-white px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg active:scale-95 flex items-center justify-center gap-2 transition-all">
             <i className="fa-solid fa-plus"></i> Novo Leito
           </button>
           <button onClick={downloadTemplate} className="flex-1 md:flex-none bg-white text-slate-600 px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest border border-slate-200 active:scale-95 transition-all flex items-center justify-center gap-2">
             <i className="fa-solid fa-download"></i> Baixar Modelo
           </button>
           <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept=".csv, .xlsx, .xlsm" 
            className="hidden" 
           />
           <button 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isLoading}
            className="flex-1 md:flex-none bg-blue-600 text-white px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
           >
             <i className="fa-solid fa-file-excel"></i> {isLoading ? 'Processando...' : 'Importar XLSM / XLSX'}
           </button>
           <button onClick={() => setIsConfirmingClear(true)} className="flex-1 md:flex-none bg-rose-50 text-rose-600 px-4 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest border border-rose-100 active:scale-95 flex items-center justify-center gap-2">
             <i className="fa-solid fa-user-minus"></i> Limpar Tripulantes
           </button>
        </div>
      </div>

      {/* INFO BOX */}
      <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top-2">
        <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-indigo-600/20">
          <i className="fa-solid fa-database"></i>
        </div>
        <div>
          <p className="text-[10px] font-black text-indigo-700 uppercase tracking-tight leading-none mb-1">Motor de Importação Ativo</p>
          <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-tight leading-relaxed">
            O sistema está configurado para ler nomes na <span className="text-indigo-700 underline font-black">Coluna I</span> e leitos na <span className="text-indigo-700 underline font-black">Coluna C</span> de arquivos Excel.
          </p>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-[32px] border border-slate-100 shadow-xl overflow-hidden flex flex-col flex-1 min-h-[400px]">
        <div className="p-4 border-b border-slate-50 bg-slate-50/50 flex items-center gap-3">
          <i className="fa-solid fa-magnifying-glass text-slate-400"></i>
          <input type="text" placeholder="Filtrar por Leito ou Tripulante..." className="bg-transparent border-none outline-none text-xs font-bold w-full uppercase" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <i className="fa-solid fa-rotate animate-spin text-blue-500 text-3xl"></i>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Analizando planilhas e <br/> mapeando colunas C e I...</p>
            </div>
          ) : filteredBerths.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-32 opacity-30">
               <i className="fa-solid fa-inbox text-5xl mb-4"></i>
               <p className="text-[10px] font-black uppercase tracking-widest">Nenhum leito cadastrado</p>
               <p className="text-[8px] font-bold uppercase mt-2">Clique em "+ Novo Leito" ou importe um arquivo .XLSM</p>
             </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[1200px]">
              <thead className="sticky top-0 bg-white z-10 border-b border-slate-100 shadow-sm">
                <tr>
                  <th className="p-5 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-white">Ação</th>
                  <th className="p-5 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-white">Leito</th>
                  <th className="p-5 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-white">Tripulante</th>
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
                        title="Editar Leito"
                      >
                        <i className="fa-solid fa-pencil text-[10px]"></i>
                      </button>
                    </td>
                    <td className="p-5"><span className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold">{b.id}</span></td>
                    <td className="p-5">
                      <span className={`text-xs font-black uppercase tracking-tight ${b.crewName ? 'text-slate-800' : 'text-slate-200 italic opacity-50'}`}>
                        {b.crewName || 'AGUARDANDO IMPORTAÇÃO'}
                      </span>
                    </td>
                    <td className="p-5 font-mono text-[9px] text-blue-600 font-bold">{b.tagId1}</td>
                    <td className="p-5 font-mono text-[9px] text-slate-400 font-bold">{b.tagId2 || '-'}</td>
                    <td className="p-5 font-mono text-[9px] text-slate-400 font-bold">{b.tagId3 || '-'}</td>
                    <td className="p-5 text-center"><span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full uppercase">{b.lifeboat}</span></td>
                    <td className="p-5 text-center"><span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full uppercase">{b.secondaryLifeboat}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* MODAL CADASTRO / EDIÇÃO MANUAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] max-w-xl w-full p-8 shadow-2xl animate-in zoom-in duration-300 relative overflow-hidden">
            
            {/* Overlay de Scanner NFC */}
            {isScanning && (
              <div className="absolute inset-0 bg-blue-600/95 backdrop-blur-md z-[120] flex flex-col items-center justify-center p-10 text-center animate-in fade-in duration-300">
                <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mb-6 animate-pulse">
                  <i className="fa-solid fa-nfc text-5xl text-white"></i>
                </div>
                <h4 className="text-xl font-black text-white uppercase tracking-tight mb-2">Aproxime a TAG agora</h4>
                <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest max-w-[200px]">
                  Posicione a TAG na parte traseira do dispositivo para capturar o ID automaticamente
                </p>
                <button 
                  onClick={stopNfcScan}
                  className="mt-10 px-8 py-3 bg-white text-blue-600 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
                >
                  Cancelar Leitura
                </button>
              </div>
            )}

            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                {isEditing ? 'Editar Leito' : 'Novo Cadastro de Leito'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            
            <form onSubmit={handleAddManual} className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">ID do Leito (Ex: 101-A)</label>
                <input 
                  type="text" 
                  required 
                  disabled={isEditing}
                  value={newBerth.id} 
                  onChange={e => setNewBerth({...newBerth, id: e.target.value.toUpperCase()})} 
                  className={`w-full px-4 py-3 border border-slate-200 rounded-xl text-xs font-bold uppercase focus:border-blue-500 outline-none ${isEditing ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-50'}`} 
                  placeholder="Digite o ID do Leito" 
                />
              </div>
              
              <div className="relative">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Tag Helideck (Obrigatória)</label>
                <div className="flex gap-2">
                  <input type="text" required value={newBerth.tagId1} onChange={e => setNewBerth({...newBerth, tagId1: e.target.value.toUpperCase()})} className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-mono font-bold uppercase focus:border-blue-500 outline-none" placeholder="04:XX:XX:..." />
                  <button type="button" onClick={() => handleScanTag('tagId1')} className="w-11 h-11 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all active:scale-90 shadow-sm shadow-blue-600/10">
                    <i className="fa-solid fa-wifi text-[12px]"></i>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Tag Proa</label>
                <div className="flex gap-2">
                  <input type="text" value={newBerth.tagId2} onChange={e => setNewBerth({...newBerth, tagId2: e.target.value.toUpperCase()})} className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-mono font-bold uppercase focus:border-blue-500 outline-none" placeholder="Opcional" />
                  <button type="button" onClick={() => handleScanTag('tagId2')} className="w-11 h-11 bg-slate-100 text-slate-500 rounded-xl flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all active:scale-90">
                    <i className="fa-solid fa-wifi text-[12px]"></i>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Tag Popa</label>
                <div className="flex gap-2">
                  <input type="text" value={newBerth.tagId3} onChange={e => setNewBerth({...newBerth, tagId3: e.target.value.toUpperCase()})} className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-mono font-bold uppercase focus:border-blue-500 outline-none" placeholder="Opcional" />
                  <button type="button" onClick={() => handleScanTag('tagId3')} className="w-11 h-11 bg-slate-100 text-slate-500 rounded-xl flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all active:scale-90">
                    <i className="fa-solid fa-wifi text-[12px]"></i>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Tripulante (Opcional)</label>
                <input type="text" value={newBerth.crewName} onChange={e => setNewBerth({...newBerth, crewName: e.target.value.toUpperCase()})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase focus:border-blue-500 outline-none" placeholder="Nome do integrante" />
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Baleeira Primária</label>
                <select value={newBerth.lifeboat} onChange={e => setNewBerth({...newBerth, lifeboat: e.target.value as LifeboatType})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none">
                  {LIFEBOATS.map(lb => <option key={lb} value={lb}>{lb}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Baleeira Secundária</label>
                <select value={newBerth.secondaryLifeboat} onChange={e => setNewBerth({...newBerth, secondaryLifeboat: e.target.value as LifeboatType})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none">
                  {LIFEBOATS.map(lb => <option key={lb} value={lb}>{lb}</option>)}
                </select>
              </div>

              <div className="md:col-span-2 pt-4">
                <button type="submit" disabled={isLoading} className="w-full py-4 bg-blue-600 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl active:scale-95 transition-all">
                  {isLoading ? 'Salvando...' : isEditing ? 'Atualizar Leito' : 'Cadastrar Leito'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMAÇÃO CLEAR */}
      {isConfirmingClear && (
        <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[40px] max-w-sm w-full p-10 shadow-2xl">
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <i className="fa-solid fa-user-xmark text-2xl"></i>
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-4 uppercase tracking-tight">Limpar Integrantes?</h3>
            <p className="text-slate-500 text-[10px] font-bold uppercase mb-8 leading-relaxed">
              Isso removerá apenas os <span className="text-rose-600">NOMES DOS TRIPULANTES</span> de todos os leitos. 
              A estrutura de Leitos, TAGs e Baleeiras será preservada.
            </p>
            <div className="grid gap-3">
              <button onClick={async () => { await cloudService.clearBerthNames(); await loadBerths(); setIsConfirmingClear(false); }} className="w-full py-4 bg-rose-600 text-white font-black rounded-2xl text-[10px] uppercase shadow-xl transition-all active:scale-95">Sim, Limpar Nomes</button>
              <button onClick={() => setIsConfirmingClear(false)} className="w-full py-4 bg-slate-100 text-slate-500 font-black rounded-2xl text-[10px] uppercase">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BerthManagement;

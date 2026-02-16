
import React, { useState, useMemo } from 'react';
import { TrainingRecord, LifeboatType } from '../types';
import { cloudService } from '../services/cloudService';

interface HistoryProps {
  records: TrainingRecord[];
  onBack: () => void;
  isAdmin?: boolean;
  onRefresh?: () => void;
}

const LIFEBOATS: (LifeboatType | 'Todas')[] = [
  'Todas', 'Lifeboat 1', 'Lifeboat 2', 'Lifeboat 3', 
  'Lifeboat 4', 'Lifeboat 5', 'Lifeboat 6'
];

const History: React.FC<HistoryProps> = ({ records, onBack, isAdmin, onRefresh }) => {
  const getTodayDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [lifeboatFilter, setLifeboatFilter] = useState<LifeboatType | 'Todas'>('Todas');
  const [dateFilter, setDateFilter] = useState<string>(getTodayDateString());
  const [recordToDelete, setRecordToDelete] = useState<TrainingRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  const filteredRecords = useMemo(() => {
    return records.filter(record => {
      const matchLifeboat = lifeboatFilter === 'Todas' || record.lifeboat === lifeboatFilter;
      
      let matchDate = true;
      if (dateFilter) {
        const [year, month, day] = dateFilter.split('-');
        const formattedFilterDate = `${day}/${month}/${year}`;
        matchDate = record.date.includes(formattedFilterDate);
      }
      
      return matchLifeboat && matchDate;
    });
  }, [records, lifeboatFilter, dateFilter]);

  const clearFilters = () => {
    setLifeboatFilter('Todas');
    setDateFilter('');
    setSelectedIds(new Set());
  };

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map(r => r.id)));
    }
  };

  const handleDeleteRecord = async () => {
    if (!recordToDelete) return;
    setIsDeleting(true);
    try {
      await cloudService.deleteHistoryRecord(recordToDelete.id);
      if (onRefresh) onRefresh();
      setRecordToDelete(null);
      // Remove da seleção se estivesse lá
      const next = new Set(selectedIds);
      next.delete(recordToDelete.id);
      setSelectedIds(next);
    } catch (e) {
      alert("Erro ao excluir registro.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    setIsBulkDeleting(true);
    try {
      await cloudService.deleteHistoryRecordsBulk(Array.from(selectedIds));
      if (onRefresh) onRefresh();
      setSelectedIds(new Set());
      setShowBulkConfirm(false);
    } catch (e) {
      alert("Erro ao excluir registros selecionados.");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const downloadCSV = (rows: string[][], fileName: string) => {
    const csvContent = "\uFEFF" + rows.map(e => e.map(cell => `"${cell.replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportFilteredToCSV = () => {
    if (filteredRecords.length === 0) return;

    const rows = [
      ["Relatório Geral de Tripulação - LIFEBOAT MUSTER"],
      ["Filtro Baleeira", lifeboatFilter.toUpperCase()],
      ["Filtro Data", dateFilter || "Todas"],
      ["Gerado em", new Date().toLocaleString('pt-BR')],
      [""],
      ["ID (Tag)", "Nome", "Data", "Hora", "Baleeira", "Líder", "Tipo", "Duração Sessão", "Operador"]
    ];

    filteredRecords.forEach(record => {
      const dateParts = record.date.split(', ');
      const dateOnly = dateParts[0] || record.date;
      const timeOnly = dateParts[1] || "";

      if (record.tags && record.tags.length > 0) {
        record.tags.forEach(tag => {
          rows.push([
            tag.id,
            tag.name || "N/A",
            dateOnly,
            timeOnly,
            record.lifeboat.toUpperCase(),
            record.leaderName,
            record.trainingType,
            record.duration,
            record.operator
          ]);
        });
      } else {
        rows.push([
          "Sem Tags",
          "N/A",
          dateOnly,
          timeOnly,
          record.lifeboat.toUpperCase(),
          record.leaderName,
          record.trainingType,
          record.duration,
          record.operator
        ]);
      }
    });

    const dateStr = dateFilter ? `_${dateFilter}` : '';
    const lbStr = lifeboatFilter !== 'Todas' ? `_${lifeboatFilter.replace(/\s+/g, '_').toUpperCase()}` : '_Geral';
    downloadCSV(rows, `LIFEBOAT_MUSTER${lbStr}${dateStr}.csv`);
  };

  const exportSingleRecordToCSV = (record: TrainingRecord) => {
    const dateParts = record.date.split(', ');
    const dateOnly = dateParts[0] || record.date;
    const timeOnly = dateParts[1] || "";

    const rows = [
      ["Relatório de Treinamento - LIFEBOAT MUSTER"],
      ["Data", dateOnly],
      ["Hora", timeOnly],
      ["Baleeira", record.lifeboat.toUpperCase()],
      ["Líder", record.leaderName],
      ["Tipo", record.trainingType],
      ["Duração Total", record.duration],
      ["Total de Tripulantes", record.crewCount.toString()],
      ["Operador Responsável", record.operator],
      [""],
    ];

    if (record.tags && record.tags.length > 0) {
      rows.push(["LISTA DE TRIPULANTES"]);
      rows.push(["ID (Tag)", "Nome", "Hora de Registro"]);
      record.tags.forEach(tag => {
        rows.push([tag.id, tag.name || "", tag.timestamp]);
      });
    } else {
      rows.push(["LISTA DE TRIPULANTES NÃO DISPONÍVEL"]);
    }

    const fileName = `Treinamento_${record.lifeboat.replace(/\s+/g, '_').toUpperCase()}_${record.id.slice(0, 8)}.csv`;
    downloadCSV(rows, fileName);
  };

  return (
    <div className="flex-1 flex flex-col p-6 max-w-4xl mx-auto w-full pb-32">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-100 text-slate-600 hover:bg-slate-50 transition-colors shadow-sm active:scale-95"
          >
            <i className="fa-solid fa-chevron-left"></i>
          </button>
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">Histórico</h2>
            <p className="text-slate-500 text-sm font-medium">LIFEBOAT MUSTER</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
            <i className="fa-solid fa-filter"></i>
            Filtros de Busca
          </div>
          {(lifeboatFilter !== 'Todas' || dateFilter !== '') && (
            <button 
              onClick={clearFilters}
              className="text-[10px] font-bold text-blue-600 uppercase tracking-wider hover:text-blue-800 transition-colors flex items-center gap-1.5"
            >
              <i className="fa-solid fa-eraser"></i>
              Limpar Filtros
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Baleeira</label>
            <select 
              value={lifeboatFilter}
              onChange={(e) => setLifeboatFilter(e.target.value as any)}
              className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-1 focus:ring-blue-100 outline-none"
            >
              {LIFEBOATS.map(lb => (
                <option key={lb} value={lb}>{lb.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Data</label>
            <input 
              type="date" 
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-1 focus:ring-blue-100 outline-none"
            />
          </div>
        </div>

        {filteredRecords.length > 0 && (
          <div className="flex justify-center border-t border-slate-100 pt-6">
            <button 
              onClick={exportFilteredToCSV}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-md shadow-green-600/10 flex items-center justify-center gap-2 transition-all active:scale-95 text-xs uppercase tracking-wider"
            >
              <i className="fa-solid fa-file-excel text-sm"></i>
              Exportar
            </button>
          </div>
        )}
      </div>

      {filteredRecords.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-100 rounded-[32px] p-12 text-center flex flex-col items-center shadow-sm">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-4">
             <i className="fa-solid fa-magnifying-glass text-2xl"></i>
          </div>
          <p className="text-slate-400 font-medium">Nenhum registro para esta data.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2 px-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Mostrando {filteredRecords.length} {filteredRecords.length === 1 ? 'registro' : 'registros'}
              </span>
            </div>
            {isAdmin && (
              <button 
                onClick={handleSelectAll}
                className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-800"
              >
                {selectedIds.size === filteredRecords.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
              </button>
            )}
          </div>
          
          {filteredRecords.map((record) => {
            const isSelected = selectedIds.has(record.id);
            return (
              <div 
                key={record.id} 
                className={`bg-white rounded-3xl border transition-all p-6 shadow-sm hover:shadow-md group relative flex items-start gap-4 ${isSelected ? 'border-blue-500 ring-1 ring-blue-50' : 'border-slate-100'}`}
              >
                {isAdmin && (
                  <button 
                    onClick={() => handleToggleSelect(record.id)}
                    className={`mt-2 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 bg-white'}`}
                  >
                    {isSelected && <i className="fa-solid fa-check text-[10px]"></i>}
                  </button>
                )}

                <div className="flex-1">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <i className="fa-solid fa-anchor"></i>
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 uppercase tracking-tight">{record.lifeboat}</h3>
                        <div className="flex items-center gap-2">
                           <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase text-white ${record.trainingType === 'Gás' ? 'bg-blue-600' : 'bg-red-600'}`}>
                            {record.trainingType}
                          </span>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{record.date}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right mr-2">
                        <div className="text-sm font-black text-slate-800">
                          {record.crewCount} {record.crewCount === 1 ? 'Tripulante' : 'Tripulantes'}
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Líder: {record.leaderName}</div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => exportSingleRecordToCSV(record)}
                          title="Exportar CSV"
                          className="w-10 h-10 bg-green-100 text-green-700 hover:bg-green-600 hover:text-white rounded-xl flex items-center justify-center transition-all active:scale-90"
                        >
                          <i className="fa-solid fa-file-excel text-lg"></i>
                        </button>
                        
                        {isAdmin && (
                          <button 
                            onClick={() => setRecordToDelete(record)}
                            title="Excluir Registro"
                            className="w-10 h-10 bg-rose-50 text-rose-500 hover:bg-rose-600 hover:text-white rounded-xl flex items-center justify-center transition-all active:scale-90"
                          >
                            <i className="fa-solid fa-trash-can text-lg"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <div className="flex items-center gap-2">
                      <i className="fa-solid fa-user-pen"></i>
                      Operador: {record.operator}
                    </div>
                    <div className="text-slate-400 font-mono">Duração: {record.duration}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Barra de Ação de Seleção em Massa */}
      {isAdmin && selectedIds.size > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[150] w-[calc(100%-3rem)] max-w-lg bg-slate-900 text-white p-4 rounded-3xl shadow-2xl animate-in slide-in-from-bottom-10 flex items-center justify-between px-6 border border-slate-700 backdrop-blur-md bg-opacity-95">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-lg">
              {selectedIds.size}
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest">Itens Selecionados</span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setSelectedIds(new Set())}
              className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white px-4 py-2"
            >
              Cancelar
            </button>
            <button 
              onClick={() => setShowBulkConfirm(true)}
              className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center gap-2"
            >
              <i className="fa-solid fa-trash-can"></i>
              Excluir Tudo
            </button>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão Individual */}
      {recordToDelete && (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[32px] max-w-sm w-full p-8 shadow-md animate-in zoom-in duration-300">
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <i className="fa-solid fa-trash-can text-2xl"></i>
            </div>
            <h3 className="text-xl font-bold mb-2">Excluir Registro?</h3>
            <p className="text-slate-500 text-xs mb-8 leading-relaxed font-medium">
              Deseja remover permanentemente o registro de <span className="font-bold text-slate-900 uppercase">{recordToDelete.lifeboat}</span> do dia <span className="font-bold text-slate-900">{recordToDelete.date}</span>?
            </p>
            <div className="grid gap-3">
              <button 
                onClick={handleDeleteRecord} 
                disabled={isDeleting}
                className="w-full py-4 bg-rose-600 text-white font-bold rounded-xl text-xs uppercase shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {isDeleting ? <i className="fa-solid fa-rotate animate-spin"></i> : "Sim, Excluir"}
              </button>
              <button 
                onClick={() => setRecordToDelete(null)} 
                disabled={isDeleting}
                className="w-full py-4 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs uppercase"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão em Massa */}
      {showBulkConfirm && (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[32px] max-w-sm w-full p-8 shadow-md animate-in zoom-in duration-300">
            <div className="w-16 h-16 bg-rose-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl">
              <i className="fa-solid fa-triangle-exclamation text-2xl"></i>
            </div>
            <h3 className="text-xl font-bold mb-2">Excluir em Massa?</h3>
            <p className="text-slate-500 text-xs mb-8 leading-relaxed font-medium">
              Você está prestes a excluir <span className="font-bold text-slate-900">{selectedIds.size} registros</span> permanentemente. Esta ação não poderá ser desfeita.
            </p>
            <div className="grid gap-3">
              <button 
                onClick={handleBulkDelete} 
                disabled={isBulkDeleting}
                className="w-full py-4 bg-rose-600 text-white font-bold rounded-xl text-xs uppercase shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {isBulkDeleting ? <i className="fa-solid fa-rotate animate-spin"></i> : "Confirmar Exclusão Total"}
              </button>
              <button 
                onClick={() => setShowBulkConfirm(false)} 
                disabled={isBulkDeleting}
                className="w-full py-4 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs uppercase"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default History;

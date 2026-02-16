
import React, { useState, useMemo } from 'react';
import { TrainingRecord, LifeboatType, ScannedTag } from '../types';
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

  const exportSingleRecordToCSV = (record: TrainingRecord) => {
    const dateParts = record.date.split(', ');
    const dateOnly = dateParts[0] || record.date;
    const timeOnly = dateParts[1] || "";

    const rows = [
      ["RELATÓRIO DE TREINAMENTO / EMERGÊNCIA - ODN I"],
      ["Data", dateOnly],
      ["Hora de Início", record.startTime || timeOnly],
      ["Hora de Término", record.endTime || timeOnly],
      ["Unidade", record.lifeboat === 'FROTA COMPLETA' ? 'ODN I - NS41' : record.lifeboat.toUpperCase()],
      ["Tipo de Evento", record.trainingType],
      ["Duração Total", record.duration],
      ["POB Total", record.crewCount.toString()],
      ["Operador do Sistema", record.operator],
      [""],
    ];

    // Se for Contagem Geral, listar ERT
    if (record.lifeboat === 'FROTA COMPLETA' && record.ertCounts) {
      rows.push(["EQUIPES DE RESPOSTA A EMERGÊNCIAS (ERT)"]);
      rows.push(["Categoria", "Quantidade"]);
      Object.entries(record.ertCounts).forEach(([cat, val]) => {
        rows.push([cat, val.toString()]);
      });
      rows.push([""]);
    }

    // Listagem por Baleeira (Breakdown)
    if (record.lifeboatBreakdown) {
      rows.push(["DETALHAMENTO POR BALEEIRA"]);
      Object.entries(record.lifeboatBreakdown).forEach(([lb, data]) => {
        rows.push([`${lb.toUpperCase()} (Total: ${data.count})`]);
        rows.push(["Nome", "Função", "Empresa", "Tag / ID", "Hora de Registro"]);
        data.tags.forEach(tag => {
          rows.push([
            tag.name || "N/A",
            tag.role || "N/A",
            tag.company || "N/A",
            tag.id,
            tag.timestamp
          ]);
        });
        rows.push([""]);
      });
    } else if (record.tags && record.tags.length > 0) {
      // Caso seja uma baleeira individual
      rows.push(["LISTA DE TRIPULANTES EMBARCADOS"]);
      rows.push(["Nome", "Função", "Empresa", "Tag / ID", "Hora de Registro"]);
      record.tags.forEach(tag => {
        rows.push([
          tag.name || "N/A",
          tag.role || "N/A",
          tag.company || "N/A",
          tag.id,
          tag.timestamp
        ]);
      });
    }

    const fileName = `Relatorio_${record.lifeboat.replace(/\s+/g, '_').toUpperCase()}_${record.id.slice(0, 8)}.csv`;
    downloadCSV(rows, fileName);
  };

  const exportFilteredToCSV = () => {
    if (filteredRecords.length === 0) return;

    const rows = [
      ["Resumo Geral do Histórico - ODN I"],
      ["Filtro Baleeira", lifeboatFilter.toUpperCase()],
      ["Filtro Data", dateFilter || "Todas"],
      ["Gerado em", new Date().toLocaleString('pt-BR')],
      [""],
      ["Data", "Hora", "Baleeira", "Líder", "Tipo", "Duração", "Total Lidos", "Operador"]
    ];

    filteredRecords.forEach(record => {
      const dateParts = record.date.split(', ');
      rows.push([
        dateParts[0] || record.date,
        dateParts[1] || "",
        record.lifeboat.toUpperCase(),
        record.leaderName,
        record.trainingType,
        record.duration,
        record.crewCount.toString(),
        record.operator
      ]);
    });

    const dateStr = dateFilter ? `_${dateFilter}` : '';
    const lbStr = lifeboatFilter !== 'Todas' ? `_${lifeboatFilter.replace(/\s+/g, '_').toUpperCase()}` : '_Geral';
    downloadCSV(rows, `LOG_HISTORICO${lbStr}${dateStr}.csv`);
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
            <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight leading-none">Histórico de Eventos</h2>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
            <i className="fa-solid fa-filter"></i>
            Filtros
          </div>
          {(lifeboatFilter !== 'Todas' || dateFilter !== '') && (
            <button 
              onClick={clearFilters}
              className="text-[10px] font-bold text-blue-600 uppercase tracking-wider hover:text-blue-800 transition-colors"
            >
              Limpar Filtros
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Baleeira / Grupo</label>
            <select 
              value={lifeboatFilter}
              onChange={(e) => setLifeboatFilter(e.target.value as any)}
              className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-1 focus:ring-blue-100 outline-none"
            >
              {LIFEBOATS.map(lb => (
                <option key={lb} value={lb}>{lb.toUpperCase()}</option>
              ))}
              <option value="FROTA COMPLETA">FROTA COMPLETA</option>
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
      </div>

      {filteredRecords.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-100 rounded-[32px] p-12 text-center flex flex-col items-center shadow-sm">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-4">
             <i className="fa-solid fa-clock-rotate-left text-2xl"></i>
          </div>
          <p className="text-slate-400 font-medium">Nenhum registro encontrado para estes filtros.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRecords.map((record) => {
            const isSelected = selectedIds.has(record.id);
            return (
              <div 
                key={record.id} 
                className={`bg-white rounded-3xl border transition-all p-6 shadow-sm hover:shadow-md group flex items-start gap-4 ${isSelected ? 'border-blue-500 ring-1 ring-blue-50' : 'border-slate-100'}`}
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
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-0">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${record.lifeboat === 'FROTA COMPLETA' ? 'bg-slate-900 text-white' : 'bg-blue-50 text-blue-600'}`}>
                        <i className={`fa-solid ${record.lifeboat === 'FROTA COMPLETA' ? 'fa-tower-observation' : 'fa-anchor'}`}></i>
                      </div>
                      <div>
                        {/* SUBSTITUIÇÃO SOLICITADA: FROTA COMPLETA POR RELATÓRIO NO TÍTULO DO CARD */}
                        <h3 className="font-bold text-slate-900 uppercase tracking-tight">{record.lifeboat === 'FROTA COMPLETA' ? 'RELATÓRIO' : record.lifeboat}</h3>
                        <div className="flex items-center gap-2">
                           <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase text-white ${record.trainingType.includes('EMERGÊNCIA') ? 'bg-rose-600' : 'bg-blue-600'}`}>
                            {record.trainingType}
                          </span>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{record.date}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right mr-2">
                        <div className="text-sm font-black text-slate-800">
                          {record.crewCount} Lidos
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Duração: {record.duration}</div>
                      </div>
                      
                      <button 
                        onClick={() => exportSingleRecordToCSV(record)}
                        className="w-10 h-10 bg-green-100 text-green-700 hover:bg-green-600 hover:text-white rounded-xl flex items-center justify-center transition-all active:scale-90 shadow-sm"
                        title="Exportar Relatório Detalhado"
                      >
                        <i className="fa-solid fa-file-excel text-lg"></i>
                      </button>
                      
                      {isAdmin && (
                        <button 
                          onClick={() => setRecordToDelete(record)}
                          className="w-10 h-10 bg-rose-50 text-rose-500 hover:bg-rose-600 hover:text-white rounded-xl flex items-center justify-center transition-all active:scale-90 shadow-sm"
                        >
                          <i className="fa-solid fa-trash-can text-lg"></i>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Exclusão Individual */}
      {recordToDelete && (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[32px] max-sm w-full p-8 shadow-md animate-in zoom-in duration-300">
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <i className="fa-solid fa-trash-can text-2xl"></i>
            </div>
            <h3 className="text-xl font-bold mb-2 uppercase">Excluir Relatório?</h3>
            <p className="text-slate-500 text-xs mb-8 leading-relaxed font-medium">
              Esta ação removerá permanentemente o relatório de auditoria do dia {recordToDelete.date}.
            </p>
            <div className="grid gap-3">
              <button 
                onClick={handleDeleteRecord} 
                disabled={isDeleting}
                className="w-full py-4 bg-rose-600 text-white font-bold rounded-xl text-xs uppercase shadow-sm"
              >
                {isDeleting ? "Excluindo..." : "Confirmar Exclusão"}
              </button>
              <button onClick={() => setRecordToDelete(null)} className="w-full py-4 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs uppercase">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default History;

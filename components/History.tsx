
import React, { useState, useMemo } from 'react';
import { TrainingRecord, LifeboatType } from '../types';

interface HistoryProps {
  records: TrainingRecord[];
  onBack: () => void;
}

const LIFEBOATS: (LifeboatType | 'Todas')[] = [
  'Todas', 'Lifeboat 1', 'Lifeboat 2', 'Lifeboat 3', 
  'Lifeboat 4', 'Lifeboat 5', 'Lifeboat 6'
];

const History: React.FC<HistoryProps> = ({ records, onBack }) => {
  const getTodayDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [lifeboatFilter, setLifeboatFilter] = useState<LifeboatType | 'Todas'>('Todas');
  const [dateFilter, setDateFilter] = useState<string>(getTodayDateString());

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
    <div className="flex-1 flex flex-col p-6 max-w-4xl mx-auto w-full pb-20">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <i className="fa-solid fa-chevron-left"></i>
          </button>
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">Histórico</h2>
            <p className="text-slate-500 text-sm font-medium">LIFEBOAT MUSTER</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mb-6">
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
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
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
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        {filteredRecords.length > 0 && (
          <div className="flex justify-center border-t border-slate-100 pt-6">
            <button 
              onClick={exportFilteredToCSV}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg shadow-green-600/20 flex items-center justify-center gap-2 transition-all active:scale-95 text-xs uppercase tracking-wider"
            >
              <i className="fa-solid fa-file-excel text-sm"></i>
              Exportar
            </button>
          </div>
        )}
      </div>

      {filteredRecords.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-[32px] p-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-4">
             <i className="fa-solid fa-magnifying-glass text-2xl"></i>
          </div>
          <p className="text-slate-400 font-medium">Nenhum registro para esta data.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2 px-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Mostrando {filteredRecords.length} {filteredRecords.length === 1 ? 'registro' : 'registros'}
            </span>
          </div>
          
          {filteredRecords.map((record) => (
            <div key={record.id} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow group">
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
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-sm font-black text-slate-800">
                      {record.crewCount} {record.crewCount === 1 ? 'Tripulante' : 'Tripulantes'}
                    </div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Líder: {record.leaderName}</div>
                  </div>
                  <button 
                    onClick={() => exportSingleRecordToCSV(record)}
                    title="Exportar este registro detalhado para Excel"
                    className="w-10 h-10 bg-green-100 text-green-700 hover:bg-green-600 hover:text-white rounded-xl flex items-center justify-center transition-all active:scale-90"
                  >
                    <i className="fa-solid fa-file-excel text-lg"></i>
                  </button>
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
          ))}
        </div>
      )}
    </div>
  );
};

export default History;

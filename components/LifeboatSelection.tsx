
import React, { useState } from 'react';
import { LifeboatType, LifeboatStatus } from '../types';

interface LifeboatSelectionProps {
  onSelect: (lb: LifeboatType) => void;
  onBack: () => void;
  fleetStatus: Record<LifeboatType, LifeboatStatus>;
}

const LIFEBOATS: LifeboatType[] = [
  'Lifeboat 1', 'Lifeboat 2', 'Lifeboat 3', 
  'Lifeboat 4', 'Lifeboat 5', 'Lifeboat 6'
];

const LifeboatSelection: React.FC<LifeboatSelectionProps> = ({ onSelect, onBack, fleetStatus }) => {
  const [confirmingLb, setConfirmingLb] = useState<LifeboatType | null>(null);

  const handleInitialClick = (lb: LifeboatType) => {
    if (fleetStatus[lb]?.isActive) return; 
    setConfirmingLb(lb);
  };

  const handleCancel = () => {
    setConfirmingLb(null);
  };

  const handleConfirm = () => {
    if (confirmingLb) {
      onSelect(confirmingLb);
      setConfirmingLb(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 max-w-4xl mx-auto w-full relative">
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={onBack}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <i className="fa-solid fa-chevron-left"></i>
        </button>
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Seleção de Baleeira</h2>
          <p className="text-slate-500 text-sm font-medium">Escolha uma unidade disponível</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {LIFEBOATS.map((lb) => {
          const status = fleetStatus[lb] || { count: 0, isActive: false };
          const isBusy = status.isActive;

          return (
            <button
              key={lb}
              onClick={() => handleInitialClick(lb)}
              disabled={isBusy}
              className={`relative overflow-hidden p-6 rounded-3xl border transition-all text-left group ${
                isBusy 
                ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed' 
                : 'bg-white border-slate-200 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/5 cursor-pointer'
              }`}
            >
              {isBusy && (
                <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2 py-1 bg-red-100 text-red-600 rounded-lg">
                  <i className="fa-solid fa-lock text-[8px]"></i>
                  <span className="text-[8px] font-black uppercase tracking-tighter">Ocupada</span>
                </div>
              )}

              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
                isBusy 
                ? 'bg-slate-200 text-slate-400' 
                : 'bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600'
              }`}>
                <i className="fa-solid fa-ship"></i>
              </div>
              
              <h3 className={`text-lg font-bold uppercase tracking-tight ${isBusy ? 'text-slate-400' : 'text-slate-800'}`}>
                {lb}
              </h3>
              
              <p className={`text-xs font-medium uppercase tracking-wider mt-1 ${isBusy ? 'text-red-400' : 'text-slate-400'}`}>
                {isBusy ? `Em uso por: ${status.operatorName || 'Operador'}` : 'Pronta para embarque'}
              </p>
            </button>
          );
        })}
      </div>

      {confirmingLb && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] max-w-sm w-full p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-6">
              <i className="fa-solid fa-circle-info text-3xl"></i>
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-3 tracking-tight">Iniciar Treinamento?</h3>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed">
              Você deseja iniciar o exercício de embarque para a <span className="font-bold text-slate-900 uppercase">{confirmingLb}</span>?
            </p>
            
            <div className="grid gap-3">
              <button 
                onClick={handleConfirm}
                className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 text-[11px] uppercase tracking-widest"
              >
                Sim, Prosseguir
              </button>
              <button 
                onClick={handleCancel}
                className="w-full py-4 bg-slate-100 text-slate-700 font-bold rounded-2xl hover:bg-slate-200 transition-colors text-[11px] uppercase tracking-widest"
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

export default LifeboatSelection;

import React, { useState } from 'react';

interface TrainingConfigProps {
  onSubmit: (type: 'Gás' | 'Fogo/Abandono', isReal: boolean) => void;
  onBack: () => void;
}

const TrainingConfig: React.FC<TrainingConfigProps> = ({ onSubmit, onBack }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [isRealScenario, setIsRealScenario] = useState<boolean>(false);
  const [trainingType, setTrainingType] = useState<'Gás' | 'Fogo/Abandono'>('Fogo/Abandono');

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else {
      onSubmit(trainingType, isRealScenario);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 max-w-4xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={step === 1 ? onBack : () => setStep(1)}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-100 text-slate-600 hover:bg-slate-50 transition-all shadow-sm active:scale-90"
        >
          <i className="fa-solid fa-chevron-left"></i>
        </button>
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-none">
            {step === 1 ? 'Tipo de Evento' : 'Configuração'}
          </h2>
          <p className="text-slate-500 text-xs font-semibold mt-1 uppercase tracking-widest opacity-60">
            Passo {step} de 2
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center w-full">
        <div className="w-full max-w-md">
          <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-md space-y-8">
            
            {step === 1 ? (
              <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] ml-1 text-center">
                  O QUE ESTÁ ACONTECENDO?
                </label>
                
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => setIsRealScenario(false)}
                    className={`group flex items-center gap-4 p-5 rounded-[28px] border-2 transition-all duration-300 shadow-sm ${
                      !isRealScenario 
                      ? 'bg-blue-50 border-blue-600 translate-x-1' 
                      : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                      !isRealScenario ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-400'
                    }`}>
                      <i className="fa-solid fa-graduation-cap text-lg"></i>
                    </div>
                    <div className="flex-1 text-left">
                      <span className={`block font-black text-[11px] uppercase tracking-wider ${!isRealScenario ? 'text-blue-700' : 'text-slate-700'}`}>
                        TREINAMENTO
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Exercício de rotina</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsRealScenario(true)}
                    className={`group flex items-center gap-4 p-5 rounded-[28px] border-2 transition-all duration-300 shadow-sm ${
                      isRealScenario 
                      ? 'bg-rose-50 border-rose-600 translate-x-1 animate-pulse-fast' 
                      : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                      isRealScenario ? 'bg-rose-600 text-white' : 'bg-slate-50 text-slate-400'
                    }`}>
                      <i className="fa-solid fa-triangle-exclamation text-lg"></i>
                    </div>
                    <div className="flex-1 text-left">
                      <span className={`block font-black text-[11px] uppercase tracking-wider ${isRealScenario ? 'text-rose-700' : 'text-slate-700'}`}>
                        CENÁRIO REAL
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">EMERGÊNCIA ATIVA</span>
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] ml-1 text-center">
                  {isRealScenario ? 'TIPO DE EMERGÊNCIA' : 'TIPO DE EXERCÍCIO'}
                </label>
                
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => setTrainingType('Gás')}
                    className={`group flex items-center gap-4 p-4 rounded-[28px] border-2 transition-all duration-300 shadow-sm ${
                      trainingType === 'Gás' 
                      ? 'bg-blue-50 border-blue-600 translate-x-1' 
                      : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                      trainingType === 'Gás' ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-400'
                    }`}>
                      <i className="fa-solid fa-wind text-lg"></i>
                    </div>
                    <div className="flex-1 text-left">
                      <span className={`block font-black text-[11px] uppercase tracking-wider ${trainingType === 'Gás' ? 'text-blue-700' : 'text-slate-700'}`}>
                        {isRealScenario ? 'Vazamento de Gás' : 'Gás'}
                      </span>
                      {!isRealScenario && (
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">
                          Simulação de vazamento
                        </span>
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTrainingType('Fogo/Abandono')}
                    className={`group flex items-center gap-4 p-4 rounded-[28px] border-2 transition-all duration-300 shadow-sm ${
                      trainingType === 'Fogo/Abandono' 
                      ? 'bg-rose-50 border-rose-600 translate-x-1' 
                      : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                      trainingType === 'Fogo/Abandono' ? 'bg-rose-600 text-white' : 'bg-slate-50 text-slate-400'
                    }`}>
                      <i className="fa-solid fa-fire-extinguisher text-lg"></i>
                    </div>
                    <div className="flex-1 text-left">
                      <span className={`block font-black text-[11px] uppercase tracking-wider ${trainingType === 'Fogo/Abandono' ? 'text-rose-700' : 'text-slate-700'}`}>
                        Fogo e Abandono
                      </span>
                      {!isRealScenario && (
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Exercício de emergência</span>
                      )}
                    </div>
                  </button>
                </div>
              </div>
            )}

            <button 
              onClick={handleNext}
              className={`w-full py-5 text-white font-black uppercase tracking-[0.25em] text-[10px] rounded-[24px] shadow-md transition-all transform active:scale-[0.96] flex items-center justify-center gap-3 group ${
                step === 1 && isRealScenario ? 'bg-rose-600 shadow-rose-600/10' : 'bg-[#0f172a] shadow-slate-900/10'
              }`}
            >
              {step === 1 ? 'Próximo' : 'Selecionar Baleeiras'}
              <i className="fa-solid fa-arrow-right text-[10px] transition-transform group-hover:translate-x-1.5"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainingConfig;
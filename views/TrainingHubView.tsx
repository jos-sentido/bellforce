
import React from 'react';
import { CircuitCycle } from '../types';
import { BoltIcon } from '../components/icons';

interface TrainingHubViewProps {
  activeCycle: CircuitCycle | null;
  completedCount: number;
  totalWorkouts: number;
  greeting: string;
  onSelectCircuit: () => void;
  onSelectStandalone: () => void;
  onNewCircuit: () => void;
}

const TrainingHubView: React.FC<TrainingHubViewProps> = ({
  activeCycle,
  completedCount,
  totalWorkouts,
  greeting,
  onSelectCircuit,
  onSelectStandalone,
  onNewCircuit
}) => {
  const progressPercent = totalWorkouts > 0 ? (completedCount / totalWorkouts) * 100 : 0;

  return (
    <div className="py-6 space-y-8 animate-in fade-in duration-500">
      <header>
        <h2 className="font-heading text-3xl leading-none text-black">{greeting}</h2>
        <p className="text-[12px] font-bold text-gray-500 uppercase tracking-widest mt-2">¿Qué entrenamos hoy?</p>
      </header>

      <div className="space-y-6">
        {/* TARJETA DE CIRCUITO */}
        <div 
          onClick={activeCycle ? onSelectCircuit : onNewCircuit}
          className={`neo-brutalism p-6 rounded-3xl cursor-pointer transition-all active:translate-y-2 active:shadow-none relative overflow-hidden ${
            activeCycle ? 'bg-black text-white' : 'bg-gray-100 text-gray-400 border-dashed opacity-80'
          }`}
        >
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
              <span className={`text-[11px] font-black uppercase px-2 py-1 rounded border ${
                activeCycle ? 'bg-[#ebca7a] text-black border-black' : 'bg-gray-200 text-gray-400 border-gray-300'
              }`}>
                MODO CIRCUITO
              </span>
              {activeCycle && <span className="font-heading text-lg">{completedCount}/{totalWorkouts}</span>}
            </div>
            
            <h3 className="font-heading text-2xl mb-2">
              {activeCycle ? activeCycle.name : 'SIN CIRCUITO ACTIVO'}
            </h3>
            
            {activeCycle ? (
              <div className="space-y-3">
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                  <div className="h-full bg-[#77b074]" style={{ width: `${progressPercent}%` }} />
                </div>
                <p className="text-[12px] font-bold uppercase opacity-60">Continuar con la secuencia programada</p>
              </div>
            ) : (
              <p className="text-[12px] font-bold uppercase underline">Pulsa para elegir una plantilla</p>
            )}
          </div>
          {/* Decoración fondo */}
          <div className="absolute -right-4 -bottom-4 opacity-10 rotate-12">
            <svg className="w-32 h-32" viewBox="0 0 24 24" fill="currentColor"><path d="M7 8V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V8H14V7C14 5.89543 13.1046 5 12 5C10.8954 5 10 5.89543 10 7V8H7Z"/><path d="M12 22C16.4183 22 20 18.4183 20 14C20 9.58172 16.4183 7 12 7C7.58172 7 4 9.58172 4 14C4 18.4183 7.58172 22 12 22Z"/></svg>
          </div>
        </div>

        {/* TARJETA DE ENTRENO LIBRE */}
        <div 
          onClick={onSelectStandalone}
          className="neo-brutalism bg-[#ebca7a] p-6 rounded-3xl cursor-pointer transition-all active:translate-y-2 active:shadow-none border-black relative overflow-hidden shadow-[8px_8px_0px_#000]"
        >
          <div className="relative z-10 text-black">
            <div className="flex justify-between items-start mb-4">
              <span className="text-[11px] font-black uppercase px-2 py-1 rounded border-2 border-black bg-white">
                MODO LIBRE
              </span>
              <BoltIcon className="w-7 h-7 text-black" />
            </div>
            
            <h3 className="font-heading text-2xl mb-2">ENTRENO INDIVIDUAL</h3>
            <p className="text-[12px] font-bold uppercase opacity-80">Elige cualquier workout de la base de datos sin afectar tu circuito</p>
          </div>
          {/* Decoración fondo */}
          <div className="absolute -right-2 -bottom-2 opacity-5 scale-150 text-black">
             <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M13 11L10 14.5H12.2L11.5 18.5L15 14.5H12.8L14.2 11Z"/></svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainingHubView;

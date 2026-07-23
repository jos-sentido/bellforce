
import React, { useState } from 'react';
import { CircuitCycle, Workout, WorkoutLog } from '../types';

interface HistoryViewProps {
  cycles: CircuitCycle[];
  workouts: Workout[];
  onRetake: (cycle: CircuitCycle) => void;
  onViewLog?: (workout: Workout, log: WorkoutLog) => void;
}

const HistoryView: React.FC<HistoryViewProps> = ({ cycles = [], workouts = [], onRetake, onViewLog }) => {
  const [expandedCycleId, setExpandedCycleId] = useState<string | null>(null);
  
  const completedCycles = [...(cycles || [])].filter(c => c.status === 'completed' && c.type !== 'standalone').reverse();
  const standaloneCycle = cycles.find(c => c.type === 'standalone');

  return (
    <div className="py-4 text-black animate-in fade-in duration-500">
      <h2 className="font-heading text-3xl mb-6 uppercase">Historial</h2>

      {/* Sección de Entrenamientos Libres */}
      {standaloneCycle && standaloneCycle.logs.length > 0 && (
        <div className="mb-8">
            <div className="neo-brutalism bg-[#ebca7a]/30 rounded-2xl overflow-hidden border-black">
              <div className="p-4 flex justify-between items-center cursor-pointer" onClick={() => setExpandedCycleId(expandedCycleId === 'standalone' ? null : 'standalone')}>
                <div className="flex-1">
                  <h4 className="font-heading text-lg">Sesiones Libres</h4>
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Total: {standaloneCycle.logs.length} entrenamientos registrados</p>
                </div>
                <div className={`transition-transform ${expandedCycleId === 'standalone' ? 'rotate-180' : ''}`}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path></svg></div>
              </div>
              {expandedCycleId === 'standalone' && (
                <div className="p-4 bg-white/50 border-t-2 border-black space-y-3 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-black">
                    {[...standaloneCycle.logs].reverse().map((log, idx) => {
                      const w = workouts.find(work => work.id === log.workoutId);
                      if (!w) return null;
                      return (
                        <div 
                          key={idx} 
                          onClick={() => onViewLog?.(w, log)}
                          className="bg-white p-4 rounded-xl border-2 border-black/10 text-[10px] shadow-sm active:translate-y-1 transition-all cursor-pointer group hover:border-black"
                        >
                           <div className="flex justify-between font-black uppercase mb-1">
                               <span className="group-hover:text-[#c6a256] transition-colors">{w.name}</span>
                               <span className="text-gray-400 font-bold">{new Date(log.date).toLocaleDateString()}</span>
                           </div>
                           <p className="italic text-gray-600 line-clamp-1 opacity-70 mb-2">{log.comments || 'Sin comentarios adicionales'}</p>
                           <div className="flex justify-between items-center mt-2">
                             <div className="flex gap-2">
                               {log.aiAnalysisText && <span className="text-[7px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md font-black uppercase border border-blue-200">IA ANALYZED</span>}
                               {log.statsImages && log.statsImages.length > 0 && <span className="text-[7px] bg-gray-100 text-gray-800 px-2 py-0.5 rounded-md font-black uppercase border border-gray-200">📸 {log.statsImages.length} FOTOS</span>}
                             </div>
                             <span className="text-[9px] font-black uppercase underline group-hover:no-underline">Ver detalles →</span>
                           </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
        </div>
      )}

      {/* Sección de Circuitos Completados */}
      <h3 className="font-heading text-xl mb-4 uppercase opacity-60 tracking-tighter">Circuitos Estructurados</h3>
      {completedCycles.length === 0 ? (
        <div className="text-center py-12 neo-brutalism bg-white/50 rounded-2xl border-dashed border-black/20">
          <p className="font-bold uppercase text-[10px] text-gray-400 tracking-widest">Sin circuitos completados aún</p>
        </div>
      ) : (
        <div className="space-y-4">
          {completedCycles.map(cycle => (
            <div key={cycle.id} className="neo-brutalism bg-white rounded-2xl overflow-hidden border-black shadow-[6px_6px_0px_#000]">
              <div className="p-4 flex justify-between items-center cursor-pointer" onClick={() => setExpandedCycleId(expandedCycleId === cycle.id ? null : cycle.id)}>
                <div className="flex-1">
                  <h4 className="font-heading text-lg">{cycle.name}</h4>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Finalizado: {new Date(cycle.endDate!).toLocaleDateString()}</p>
                </div>
                <div className={`transition-transform ${expandedCycleId === cycle.id ? 'rotate-180' : ''}`}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path></svg></div>
              </div>
              {expandedCycleId === cycle.id && (
                <div className="p-4 bg-gray-50 border-t-2 border-black space-y-4 animate-in slide-in-from-top-2">
                  <button onClick={() => onRetake(cycle)} className="w-full bg-[#ebca7a] p-3 rounded-xl font-heading text-xs border-2 border-black active:translate-y-1 active:shadow-none shadow-[4px_4px_0px_#000] transition-all">RETOMAR ESTE CIRCUITO</button>
                  <div className="space-y-2">
                    {(Array.isArray(cycle.logs) ? cycle.logs : []).map((log, idx) => {
                      const w = workouts.find(work => work.id === log.workoutId);
                      if (!w) return null;
                      return (
                        <div 
                          key={idx} 
                          onClick={() => onViewLog?.(w, log)}
                          className="bg-white p-3 rounded-lg border border-black/10 text-[10px] hover:border-black cursor-pointer group active:scale-[0.98] transition-all"
                        >
                           <div className="flex justify-between font-black uppercase mb-1">
                             <span className="group-hover:text-[#c6a256]">{w.name}</span>
                             <span className="text-gray-400">{new Date(log.date).toLocaleDateString()}</span>
                           </div>
                           <p className="italic text-gray-600 line-clamp-1 opacity-60">{log.comments || 'Sin comentarios'}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HistoryView;

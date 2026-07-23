
import React from 'react';
import { CircuitCycle, Workout } from '../types';

interface HomeViewProps {
  workouts: Workout[];
  currentCycle: CircuitCycle;
  onSelectWorkout: (workout: Workout) => void;
  onManageCircuit: () => void;
  onNewCycle: () => void;
  onBackToHub?: () => void;
  onRestartCycle?: (cycle: CircuitCycle) => void;
}

const HomeView: React.FC<HomeViewProps> = ({ 
  workouts = [], 
  currentCycle, 
  onSelectWorkout, 
  onManageCircuit, 
  onNewCycle, 
  onBackToHub,
  onRestartCycle
}) => {
  const currentLogs = Array.isArray(currentCycle.logs) ? currentCycle.logs : [];
  const completedCount = currentLogs.filter(l => l.completed).length;
  const progressPercent = workouts.length > 0 ? (completedCount / workouts.length) * 100 : 0;
  const isCompleted = completedCount >= workouts.length || currentCycle.status === 'completed';

  const nextWorkoutIndex = workouts.findIndex(w => 
    !currentLogs.find(l => l.workoutId === w.id)?.completed
  );
  const nextWorkout = nextWorkoutIndex !== -1 ? workouts[nextWorkoutIndex] : null;

  return (
    <div className="py-4 text-black animate-in fade-in duration-500">
      <div className="flex items-center gap-2 mb-6">
        <button onClick={onBackToHub} className="p-2 neo-brutalism bg-white border-black rounded-full active:scale-90">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        </button>
        <h2 className="font-heading text-2xl leading-none truncate">{currentCycle.name}</h2>
      </div>

      <div className="mb-8">
        <div className="neo-brutalism bg-white p-4 rounded-2xl mb-8 border-black">
          <div className="flex justify-between items-end mb-2">
            <span className="font-heading text-sm text-black">Progreso Ciclo</span>
            <span className="font-heading text-2xl text-black">{completedCount}/{workouts.length}</span>
          </div>
          <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden border-2 border-black">
            <div className={`h-full transition-all duration-500 ${isCompleted ? 'bg-[#77b074]' : 'bg-[#ebca7a]'}`} style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        {isCompleted ? (
          <div className="mb-8 p-6 bg-[#77b074] neo-brutalism rounded-2xl text-center border-black shadow-[6px_6px_0px_#000]">
            <h3 className="font-heading text-xl mb-4 text-white">¡CIRCUITO COMPLETADO!</h3>
            <div className="space-y-3">
              <button 
                onClick={() => onRestartCycle?.(currentCycle)} 
                className="w-full bg-black text-white p-4 rounded-xl font-heading text-sm shadow-[3px_3px_0px_#ebca7a] active:translate-y-1 active:shadow-none"
              >
                REINICIAR ESTE CIRCUITO 🔄
              </button>
              <button 
                onClick={onNewCycle} 
                className="w-full bg-white text-black p-4 rounded-xl font-heading text-sm border-2 border-black hover:bg-gray-100"
              >
                ELEGIR OTRA PLANTILLA
              </button>
            </div>
          </div>
        ) : nextWorkout && (
          <div className="mb-8">
            <h3 className="font-heading text-lg mb-3 text-black">Siguiente Workout</h3>
            <button onClick={() => onSelectWorkout(nextWorkout)} className="w-full text-left neo-brutalism bg-[#ebca7a] p-5 rounded-2xl flex justify-between items-center group border-black shadow-[6px_6px_0px_#000]">
              <div className="text-black">
                <p className="text-[10px] font-bold uppercase mb-1 opacity-80">Sesión #{nextWorkoutIndex + 1}</p>
                <h4 className="font-heading text-xl leading-tight mb-2">{nextWorkout.name}</h4>
                <div className="flex gap-2">
                   <span className="bg-black text-white text-[8px] px-2 py-0.5 rounded-md font-bold uppercase">{nextWorkout.weight}</span>
                   <span className="bg-black text-white text-[8px] px-2 py-0.5 rounded-md font-bold uppercase">{nextWorkout.duration}</span>
                </div>
              </div>
              <div className="bg-black text-white p-2 rounded-full group-hover:scale-110 transition-transform"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7"></path></svg></div>
            </button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center mb-2 px-1">
           <h3 className="font-heading text-lg text-black">Secuencia</h3>
           {!isCompleted && <button onClick={onManageCircuit} className="bg-black text-white px-3 py-1.5 rounded-lg font-bold text-[9px] uppercase tracking-tighter neo-brutalism border-black">Editar Orden</button>}
        </div>
        
        {workouts.map((workout, idx) => {
          const log = currentLogs.find(l => l.workoutId === workout.id);
          const isDone = log?.completed;
          const isNext = nextWorkout?.id === workout.id;
          return (
            <div key={`${workout.id}-${idx}`} onClick={() => onSelectWorkout(workout)} className={`neo-brutalism p-4 rounded-xl flex items-center gap-4 border-black transition-all cursor-pointer ${isDone ? 'bg-[#c1e1c1]' : isNext ? 'bg-white border-dashed' : 'bg-white'}`}>
              <div className={`w-8 h-8 rounded-full border-2 border-black flex items-center justify-center font-heading text-xs ${isDone ? 'bg-black text-white' : 'bg-white text-black'}`}>{idx + 1}</div>
              <div className="flex-1 text-black"><h5 className="font-heading text-sm leading-none mb-1">{workout.name}</h5><p className="text-[8px] text-gray-500 font-bold uppercase">{isDone ? `COMPLETADO` : workout.type}</p></div>
              {isDone && <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HomeView;

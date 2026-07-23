
import React, { useState } from 'react';
import { Workout } from '../types';

interface ManageCircuitViewProps {
  activeWorkouts: Workout[];
  library: Workout[];
  onAdd: (workoutId: string, position?: number) => void;
  onRemove: (index: number) => void;
  onReorder: (index: number, direction: 'up' | 'down') => void;
  onBack: () => void;
}

const ManageCircuitView: React.FC<ManageCircuitViewProps> = ({ 
  activeWorkouts, 
  library,
  onAdd,
  onRemove, 
  onReorder, 
  onBack 
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLibrary = library.filter(w => 
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddWorkout = (workoutId: string) => {
    onAdd(workoutId);
    setShowAddModal(false);
    setSearchTerm('');
  };

  return (
    <div className="py-4 text-black animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-6">
        <button onClick={onBack} className="flex items-center gap-1 font-bold text-sm text-black hover:opacity-70">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
          VOLVER
        </button>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-black text-white px-4 py-2 rounded-xl font-heading text-[12px] tracking-tight neo-brutalism active:translate-y-1 active:shadow-none"
        >
          + AÑADIR WORKOUT
        </button>
      </div>

      <div className="mb-6">
        <h2 className="font-heading text-2xl mb-1">GESTIÓN DE SECUENCIA</h2>
        <p className="text-[12px] font-bold text-gray-500 uppercase mb-2">Organiza el orden de tus workouts en el circuito</p>
        <div className="inline-block bg-black text-[#ebca7a] px-3 py-1 rounded-md border-2 border-black shadow-[2px_2px_0px_#000]">
          <p className="font-heading text-[12px] tracking-widest leading-none">TOTAL: {activeWorkouts.length} WORKOUTS</p>
        </div>
      </div>

      {/* Modal para añadir workouts (z-index aumentado) */}
      {showAddModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#fdf6e3] neo-brutalism p-6 rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-heading text-lg">Añadir al Circuito</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-500 hover:text-black">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <input 
              type="text"
              placeholder="Buscar en Database..."
              className="w-full p-3 neo-brutalism rounded-lg text-xs mb-4 focus:outline-none bg-white text-black"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />

            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {filteredLibrary.map(w => (
                <button 
                  key={w.id}
                  onClick={() => handleAddWorkout(w.id)}
                  className="w-full text-left p-3 border-2 border-black rounded-xl hover:bg-[#ebca7a]/20 transition-colors flex justify-between items-center group bg-white text-black"
                >
                  <div>
                    <h4 className="font-heading text-[12px] leading-tight">{w.name}</h4>
                    <p className="text-[10px] font-bold text-gray-600 uppercase">{w.weight} • {w.type}</p>
                  </div>
                  <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                </button>
              ))}
              {filteredLibrary.length === 0 && (
                <p className="text-center text-[12px] py-10 text-gray-500 font-bold uppercase">No se encontraron workouts</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3 pb-32">
        {activeWorkouts.map((w, idx) => (
          <div key={`${w.id}-${idx}`} className="neo-brutalism bg-white p-3 rounded-xl flex items-center gap-3 animate-in slide-in-from-left-2 duration-200" style={{ animationDelay: `${idx * 50}ms` }}>
            <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center font-heading text-[12px] shrink-0">
              {idx + 1}
            </div>
            
            <div className="flex-1 overflow-hidden">
               <h4 className="font-heading text-xs truncate text-black">{w.name}</h4>
               <p className="text-[10px] text-gray-600 font-bold uppercase">{w.type}</p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
               <div className="flex flex-col gap-1">
                  <button 
                    disabled={idx === 0} 
                    onClick={() => onReorder(idx, 'up')}
                    className={`p-1 border border-black rounded ${idx === 0 ? 'opacity-20' : 'active:bg-gray-100 transition-colors bg-white'}`}
                  >
                    <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 15l7-7 7 7"></path></svg>
                  </button>
                  <button 
                    disabled={idx === activeWorkouts.length - 1} 
                    onClick={() => onReorder(idx, 'down')}
                    className={`p-1 border border-black rounded ${idx === activeWorkouts.length - 1 ? 'opacity-20' : 'active:bg-gray-100 transition-colors bg-white'}`}
                  >
                    <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"></path></svg>
                  </button>
               </div>
               <button 
                onClick={() => { if(confirm("¿Eliminar del circuito?")) onRemove(idx); }}
                className="p-2 bg-red-100 border-2 border-black rounded-lg active:translate-y-0.5 ml-1 hover:bg-red-200 transition-colors shadow-sm"
               >
                 <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
               </button>
            </div>
          </div>
        ))}

        {activeWorkouts.length === 0 && (
          <div className="p-20 text-center opacity-40">
             <svg className="w-12 h-12 mx-auto mb-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
             <p className="font-bold text-xs uppercase text-black">No hay workouts en la secuencia</p>
             <button onClick={() => setShowAddModal(true)} className="mt-4 text-[12px] font-bold underline text-black">Añadir mi primer ejercicio</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManageCircuitView;


import React, { useState, useMemo } from 'react';
import { Workout } from '../types';

interface StandalonePickerViewProps {
  library: Workout[];
  onSelect: (workout: Workout) => void;
  onBack: () => void;
}

const StandalonePickerView: React.FC<StandalonePickerViewProps> = ({ library, onSelect, onBack }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const workoutTypes = useMemo(() => {
    const types = new Set(library.map(w => w.type).filter(Boolean));
    return Array.from(types);
  }, [library]);

  const filteredWorkouts = useMemo(() => {
    return library.filter(w => {
      const matchesSearch = w.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = !activeFilter || w.type === activeFilter;
      return matchesSearch && matchesFilter;
    });
  }, [library, searchTerm, activeFilter]);

  return (
    <div className="py-4 space-y-6 animate-in slide-in-from-right duration-300 text-black">
      <header className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 neo-brutalism bg-white rounded-full border-black active:scale-90">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"></path></svg>
        </button>
        <div>
          <h2 className="font-heading text-2xl leading-none">WORKOUTS LIBRES</h2>
          <p className="text-[9px] font-black text-gray-500 uppercase">Selecciona de la Database</p>
        </div>
      </header>

      <div className="space-y-4">
        <input 
          type="text" 
          placeholder="Buscar ejercicio..." 
          className="w-full neo-brutalism p-4 rounded-xl text-sm bg-white border-black placeholder-gray-400 focus:outline-none"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          <button 
            onClick={() => setActiveFilter(null)}
            className={`px-4 py-2 rounded-full border-2 border-black text-[9px] font-black uppercase whitespace-nowrap transition-colors ${!activeFilter ? 'bg-black text-white' : 'bg-white text-black'}`}
          >
            Todos
          </button>
          {workoutTypes.map(type => (
            <button 
              key={type} 
              onClick={() => setActiveFilter(type)}
              className={`px-4 py-2 rounded-full border-2 border-black text-[9px] font-black uppercase whitespace-nowrap transition-colors ${activeFilter === type ? 'bg-black text-white' : 'bg-white text-black'}`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 pb-20">
        {filteredWorkouts.map(w => (
          <div 
            key={w.id} 
            onClick={() => onSelect(w)}
            className="neo-brutalism bg-white p-4 rounded-2xl border-black flex justify-between items-center group cursor-pointer active:translate-y-1 active:shadow-none"
          >
            <div className="flex-1 pr-4">
              <h4 className="font-heading text-sm mb-1 group-hover:text-[#c6a256] transition-colors">{w.name}</h4>
              <div className="flex gap-2">
                <span className="text-[8px] font-black uppercase text-gray-400">{w.weight}</span>
                <span className="text-[8px] font-black uppercase text-gray-600 bg-gray-100 px-1 rounded">{w.type}</span>
              </div>
            </div>
            <div className="w-10 h-10 bg-black text-[#ebca7a] rounded-xl flex items-center justify-center border-2 border-black group-hover:bg-[#ebca7a] group-hover:text-black transition-all">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"></path></svg>
            </div>
          </div>
        ))}

        {filteredWorkouts.length === 0 && (
          <div className="text-center py-12">
            <p className="font-bold text-xs text-gray-400 uppercase">No se encontraron resultados</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default StandalonePickerView;

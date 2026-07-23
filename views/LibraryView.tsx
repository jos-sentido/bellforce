
import React, { useState, useMemo } from 'react';
import { Workout, CircuitTemplate, UserRole, CircuitCycle } from '../types';
import { uploadMedia, isCloudinaryConfigured } from '../services/cloudinary';
import MediaCarousel from '../components/MediaCarousel';
import { BoltIcon, EyeIcon, EyeOffIcon } from '../components/icons';

interface LibraryViewProps {
  userRole: UserRole;
  userId: string;
  library: Workout[];
  templates: CircuitTemplate[];
  cycles: CircuitCycle[];
  onAddToLibrary: (w: Omit<Workout, 'id'>) => void;
  onUpdateWorkout: (w: Workout) => void;
  onDeleteWorkout: (id: string) => void;
  onSaveTemplate: (t: CircuitTemplate) => void;
  onDeleteTemplate: (id: string) => void;
  onStartTemplate: (t: CircuitTemplate) => void;
  onQuickStart?: (w: Workout) => void;
}

const LibraryView: React.FC<LibraryViewProps> = ({ 
  userRole, userId, library, templates, cycles, onAddToLibrary, onUpdateWorkout, onDeleteWorkout, onSaveTemplate, onDeleteTemplate, onStartTemplate, onQuickStart 
}) => {
  const [activeTab, setActiveTab] = useState<'workouts' | 'templates'>('workouts');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [editingW, setEditingW] = useState<Workout | null>(null);
  const [editingT, setEditingT] = useState<CircuitTemplate | null>(null);
  const [previewT, setPreviewT] = useState<CircuitTemplate | null>(null);
  const [previewW, setPreviewW] = useState<Workout | null>(null);
  
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerTypeFilter, setPickerTypeFilter] = useState<string | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);

  const [formW, setFormW] = useState<Omit<Workout, 'id'>>({ 
    name: '', weight: '', type: '', duration: '', description: '', isPublic: false, createdBy: userId 
  });
  const [formT, setFormT] = useState<Omit<CircuitTemplate, 'id'>>({ 
    name: '', workoutIds: [], isPublic: false, createdBy: userId 
  });

  const filteredW = library.filter(w => w.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredT = templates.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const workoutTypes = useMemo(() => {
    const types = new Set(library.map(w => w.type).filter(Boolean));
    return Array.from(types);
  }, [library]);

  const filteredWorkoutsForPicker = useMemo(() => {
    return library.filter(w => {
      const matchesSearch = w.name.toLowerCase().includes(pickerSearch.toLowerCase());
      const matchesType = !pickerTypeFilter || w.type === pickerTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [library, pickerSearch, pickerTypeFilter]);

  // Cálculo del historial de pesos para el workout seleccionado en la previsualización
  const weightHistory = useMemo(() => {
    if (!previewW || !cycles) return [];
    
    const history: { date: string, weight: string, cycleName: string }[] = [];
    
    // Recorremos los ciclos del usuario para buscar el peso registrado
    [...cycles].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()).forEach(cycle => {
      const weight = cycle.workoutWeights?.[previewW.id];
      const hasLogs = cycle.logs.some(l => l.workoutId === previewW.id && l.completed);
      
      if (weight && hasLogs) {
        // Buscamos la fecha del último log completado de este workout en este ciclo
        const lastLog = [...cycle.logs]
          .filter(l => l.workoutId === previewW.id && l.completed)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
          
        history.push({
          date: lastLog ? lastLog.date : cycle.startDate,
          weight: weight,
          cycleName: cycle.name
        });
      }
    });
    
    return history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [previewW, cycles]);

  const handleSaveWorkout = () => {
    if (!formW.name) return;
    if (editingW && editingW.id) onUpdateWorkout({ ...formW, id: editingW.id } as Workout);
    else onAddToLibrary(formW);
    setEditingW(null);
    setFormW({ name: '', weight: '', type: '', duration: '', description: '', isPublic: false, createdBy: userId });
  };

  const handleAddWorkoutMedia = async (files: FileList) => {
    if (!isCloudinaryConfigured) {
      alert('Configura Cloudinary para subir videos/imágenes.');
      return;
    }
    setMediaUploading(true);
    try {
      const uploaded = [];
      for (const file of Array.from(files)) {
        try { uploaded.push(await uploadMedia(file)); }
        catch (e) { console.error('uploadMedia', e); }
      }
      if (uploaded.length) {
        setFormW(prev => ({ ...prev, media: [...(prev.media || []), ...uploaded] }));
      }
    } finally {
      setMediaUploading(false);
    }
  };

  const removeWorkoutMedia = (idx: number) => {
    setFormW(prev => ({ ...prev, media: (prev.media || []).filter((_, i) => i !== idx) }));
  };

  const handleSaveTemplate = () => {
    if (!formT.name || formT.workoutIds.length === 0) return;
    onSaveTemplate({ ...formT, id: editingT?.id || Math.random().toString(36).substring(2) } as CircuitTemplate);
    setEditingT(null); 
    setFormT({ name: '', workoutIds: [], isPublic: false, createdBy: userId });
  };

  const EditIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
  );

  const TrashIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
  );

  return (
    <div className="py-4 text-black animate-in slide-in-from-bottom-2">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="font-heading text-3xl leading-none">DATABASE</h2>
          <p className="text-[10px] font-black uppercase text-gray-600 mt-1">{userRole === 'admin' ? 'Modo: Administrador Maestro' : 'Librería de Entrenamiento'}</p>
        </div>
        <button 
          onClick={() => {
            if (activeTab === 'workouts') {
              setEditingW({} as any);
              setFormW({ name: '', weight: '', type: '', duration: '', description: '', isPublic: false, createdBy: userId });
            } else {
              setEditingT({} as any);
              setFormT({ name: '', workoutIds: [], isPublic: false, createdBy: userId });
            }
          }} 
          className="neo-brutalism bg-[#ebca7a] p-2 rounded-full active:scale-90 border-black shadow-[2px_2px_0px_#000]"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path></svg>
        </button>
      </div>

      <div className="flex border-2 border-black rounded-xl overflow-hidden mb-6 neo-brutalism no-click">
        <button onClick={() => setActiveTab('workouts')} className={`flex-1 p-3 text-[12px] font-black uppercase transition-colors ${activeTab === 'workouts' ? 'bg-black text-white' : 'bg-white text-black'}`}>Workouts</button>
        <button onClick={() => setActiveTab('templates')} className={`flex-1 p-3 text-[12px] font-black uppercase transition-colors ${activeTab === 'templates' ? 'bg-black text-white' : 'bg-white text-black'}`}>Circuitos</button>
      </div>

      <input 
        type="text" 
        placeholder={`Buscar en ${activeTab === 'workouts' ? 'ejercicios' : 'circuitos'}...`} 
        className="w-full neo-brutalism p-4 rounded-xl text-sm mb-6 bg-white text-black focus:outline-none border-black placeholder-gray-400" 
        value={searchTerm} 
        onChange={e => setSearchTerm(e.target.value)} 
      />

      <div className="space-y-4 pb-12">
        {activeTab === 'workouts' ? filteredW.map(w => {
          const isMyPrivate = !w.isPublic && w.createdBy === userId;
          const isMyPublic = w.isPublic && w.createdBy === userId;
          
          return (
            <div 
              key={w.id} 
              className={`neo-brutalism p-4 rounded-xl relative border-black shadow-[4px_4px_0px_#000] transition-colors ${w.isPublic ? 'bg-white' : 'bg-[#fdf6e3]'}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div onClick={() => setPreviewW(w)} className="cursor-pointer flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-heading text-lg leading-none">{w.name}</h4>
                    {w.isPublic
                      ? <EyeIcon className="w-4 h-4 text-[#c6a256] shrink-0" />
                      : <EyeOffIcon className="w-4 h-4 text-gray-400 shrink-0" />}
                  </div>
                  <p className="text-[11px] font-bold uppercase flex items-center gap-1.5">
                    <span className={w.isPublic ? 'text-[#c6a256]' : 'text-gray-600'}>
                      {isMyPublic ? 'TU CONTENIDO PÚBLICO' : isMyPrivate ? 'TU ENTRENAMIENTO PRIVADO' : 'BELLFORCE GLOBAL'}
                    </span>
                    <span className="text-gray-400">•</span>
                    <span className="text-gray-600">{w.weight}</span>
                  </p>
                </div>
                
                <div className="flex gap-2">
                   {onQuickStart && (
                      <button 
                        onClick={() => onQuickStart(w)}
                        title="Entrenar Ahora"
                        className="w-7 h-7 flex items-center justify-center bg-black text-[#ebca7a] border-2 border-black rounded-lg shadow-[2px_2px_0px_#ebca7a] active:translate-y-0.5 active:shadow-none hover:bg-gray-900"
                      >
                        <BoltIcon className="w-4 h-4" />
                      </button>
                   )}
                  {(userRole === 'admin' || w.createdBy === userId) && (
                    <>
                      <button 
                        onClick={() => { setEditingW(w); setFormW(w); }} 
                        className="w-7 h-7 flex items-center justify-center bg-white border-2 border-black rounded-lg shadow-[2px_2px_0px_#000] active:translate-y-0.5 active:shadow-none hover:bg-[#ebca7a]"
                      >
                        <EditIcon />
                      </button>
                      <button 
                        onClick={() => onDeleteWorkout(w.id)} 
                        className="w-7 h-7 flex items-center justify-center bg-white border-2 border-black rounded-lg shadow-[2px_2px_0px_#000] active:translate-y-0.5 active:shadow-none hover:bg-red-50"
                      >
                        <TrashIcon />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-gray-600 line-clamp-1 mb-4 italic">{w.description}</p>
              <button onClick={() => setPreviewW(w)} className="w-full neo-brutalism bg-white p-2 rounded-lg font-heading text-[12px] border-black hover:bg-gray-50">DETALLES</button>
            </div>
          );
        }) : filteredT.map(t => (
          <div key={t.id} className={`neo-brutalism p-4 rounded-xl border-black shadow-[4px_4px_0px_#000] ${t.isPublic ? 'bg-white' : 'bg-[#fdf6e3]'}`}>
            <div className="flex justify-between items-start mb-4">
               <div>
                 <div className="flex items-center gap-2 mb-1">
                   <h4 className="font-heading text-lg leading-none">{t.name}</h4>
                   {t.isPublic
                     ? <EyeIcon className="w-4 h-4 text-[#c6a256] shrink-0" />
                     : <EyeOffIcon className="w-4 h-4 text-gray-400 shrink-0" />}
                 </div>
                 <p className="text-[11px] font-bold uppercase flex items-center gap-1.5">
                   <span className={t.isPublic ? 'text-[#c6a256]' : 'text-gray-600'}>
                     {t.isPublic ? (t.createdBy === userId ? 'TU CIRCUITO PÚBLICO' : 'BELLFORCE GLOBAL') : 'CIRCUITO PERSONAL'}
                   </span>
                   <span className="text-gray-400">•</span>
                   <span className="text-gray-600">{t.workoutIds.length} Sesiones</span>
                 </p>
               </div>
               <div className="flex gap-2">
                  {(userRole === 'admin' || t.createdBy === userId) && (
                    <>
                      <button onClick={() => { setEditingT(t); setFormT(t); }} className="w-7 h-7 flex items-center justify-center bg-white border-2 border-black rounded-lg shadow-[2px_2px_0px_#000] active:translate-y-0.5 active:shadow-none"><EditIcon /></button>
                      <button onClick={() => onDeleteTemplate(t.id)} className="w-7 h-7 flex items-center justify-center bg-white border-2 border-black rounded-lg shadow-[2px_2px_0px_#000] active:translate-y-0.5 active:shadow-none"><TrashIcon /></button>
                    </>
                  )}
               </div>
            </div>
            <div className="flex gap-2">
               <button onClick={() => setPreviewT(t)} className="flex-1 neo-brutalism bg-white p-3 rounded-xl font-heading text-[11px] uppercase border-black">Explorar</button>
               <button onClick={() => onStartTemplate(t)} className="flex-1 neo-brutalism bg-black text-white p-3 rounded-xl font-heading text-[11px] uppercase border-black">Entrenar</button>
            </div>
          </div>
        ))}
      </div>
      
      {/* MODAL: Vista Previa de Circuito */}
      {previewT && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
          <div className="bg-white neo-brutalism p-6 rounded-2xl w-full max-w-sm border-black animate-in zoom-in-95 max-h-[80vh] flex flex-col shadow-2xl">
             <div className="mb-4">
               <h4 className="font-heading text-xl mb-1">{previewT.name}</h4>
               <p className="text-[11px] font-black uppercase text-gray-500 flex items-center gap-1.5">
                 {previewT.isPublic ? <EyeIcon className="w-3.5 h-3.5" /> : <EyeOffIcon className="w-3.5 h-3.5" />}
                 {previewT.isPublic ? 'Circuito Bellforce Global' : 'Circuito Personal'}
               </p>
             </div>
             <div className="flex-1 overflow-y-auto space-y-2 pr-2 mb-6 scrollbar-thin scrollbar-thumb-black">
               {previewT.workoutIds.map((id, idx) => {
                 const w = library.find(item => item.id === id);
                 return (
                   <div key={`${id}-${idx}`} className="p-3 border-2 border-black rounded-xl bg-gray-50 flex items-center gap-3">
                     <span className="w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-[11px] font-black shrink-0">{idx + 1}</span>
                     <div className="flex-1">
                       <p className="text-[12px] font-black uppercase leading-tight">{w?.name || 'Cargando...'}</p>
                       <p className="text-[10px] text-gray-600 font-bold uppercase">{w?.weight} • {w?.type}</p>
                     </div>
                   </div>
                 );
               })}
             </div>
             <div className="flex gap-3">
               <button onClick={() => { onStartTemplate(previewT); setPreviewT(null); }} className="flex-1 neo-brutalism bg-[#ebca7a] text-black p-3 rounded-xl font-heading text-xs border-black uppercase active:translate-y-1">EMPEZAR</button>
               <button onClick={() => setPreviewT(null)} className="flex-1 neo-brutalism bg-white text-black p-3 rounded-xl font-heading text-xs border-black uppercase">CERRAR</button>
             </div>
          </div>
        </div>
      )}

      {/* MODAL: Vista Previa de Workout + HISTORIAL DE PROGRESIÓN */}
      {previewW && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
          <div className="bg-white neo-brutalism p-6 rounded-2xl w-full max-w-sm border-black animate-in zoom-in-95 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
             <div className="p-1">
               <h4 className="font-heading text-xl mb-1">{previewW.name}</h4>
               <p className="text-[12px] font-black uppercase text-gray-500 mb-4 flex items-center gap-1.5">
                 {previewW.isPublic ? <EyeIcon className="w-3.5 h-3.5" /> : <EyeOffIcon className="w-3.5 h-3.5" />}
                 {previewW.isPublic ? 'Bellforce Global' : 'Personal'}
               </p>
             </div>
             
             <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-black space-y-6">
                {previewW.media && previewW.media.length > 0 && (
                  <MediaCarousel media={previewW.media} />
                )}
                <section>
                  <div className="flex gap-2 mb-3">
                    <span className="bg-[#ebca7a] text-black px-2 py-1 rounded text-[11px] font-bold border border-black">{previewW.weight}</span>
                    <span className="bg-black text-white px-2 py-1 rounded text-[11px] font-bold border border-black">{previewW.type}</span>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-xl border-2 border-dashed border-black/10">
                    <p className="text-[11px] leading-relaxed whitespace-pre-wrap italic text-black">"{previewW.description}"</p>
                  </div>
                </section>

                <section>
                  <h5 className="font-heading text-xs mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>
                    EVOLUCIÓN DE CARGAS
                  </h5>
                  
                  {weightHistory.length === 0 ? (
                    <div className="text-center py-6 bg-gray-50 rounded-xl border-2 border-black/5">
                      <p className="text-[11px] font-black text-gray-400 uppercase">Sin historial en circuitos aún</p>
                    </div>
                  ) : (
                    <div className="space-y-3 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-black/10">
                      {weightHistory.map((h, i) => {
                        const currentWeightNum = parseFloat(h.weight.replace(/[^0-9.]/g, '') || '0');
                        const prevWeightNum = i < weightHistory.length - 1 ? parseFloat(weightHistory[i+1].weight.replace(/[^0-9.]/g, '') || '0') : null;
                        const increased = prevWeightNum !== null && currentWeightNum > prevWeightNum;
                        
                        return (
                          <div key={i} className="relative pl-8 flex items-center justify-between group">
                            <div className="absolute left-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-black z-10" />
                            <div className="flex-1">
                               <p className="text-[10px] font-black uppercase text-gray-500 leading-none">{new Date(h.date).toLocaleDateString()}</p>
                               <p className="text-[12px] font-bold text-black truncate max-w-[150px]">{h.cycleName}</p>
                            </div>
                            <div className="flex items-center gap-2">
                               {increased && <span className="text-green-600 animate-bounce">▲</span>}
                               <span className={`px-2 py-1 rounded border-2 border-black font-heading text-[12px] shadow-[2px_2px_0px_#000] ${increased ? 'bg-[#77b074] text-white' : 'bg-white text-black'}`}>
                                 {h.weight}
                               </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
             </div>

             <div className="pt-6 space-y-2">
                {onQuickStart && (
                   <button 
                     onClick={() => onQuickStart(previewW)}
                     className="w-full neo-brutalism bg-[#ebca7a] text-black p-3 rounded-xl font-heading text-xs border-black uppercase active:translate-y-1 flex items-center justify-center gap-2"
                   >
                     ENTRENAR AHORA <BoltIcon className="w-4 h-4" />
                   </button>
                )}
                <button onClick={() => setPreviewW(null)} className="w-full neo-brutalism bg-black text-white p-3 rounded-xl font-heading text-xs border-black uppercase active:translate-y-1">Cerrar</button>
             </div>
          </div>
        </div>
      )}

      {/* MODAL: Editor de Template */}
      {editingT && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
           <div className="bg-white neo-brutalism p-6 rounded-2xl w-full max-w-sm border-black animate-in zoom-in-95 max-h-[90vh] flex flex-col shadow-2xl space-y-4">
              <h3 className="font-heading text-xl">{editingT.id ? 'EDITAR' : 'NUEVO'} CIRCUITO</h3>
              <div className="space-y-1">
                 <label className="text-[11px] font-black text-gray-700 uppercase ml-1">Nombre del Circuito</label>
                 <input type="text" className="w-full p-3 neo-brutalism rounded-xl text-sm focus:outline-none border-black bg-white text-black font-bold" placeholder="ej: Fusion Circuit X" value={formT.name} onChange={e => setFormT({...formT, name: e.target.value})} />
              </div>
              {userRole === 'admin' && (
                <button type="button" onClick={() => setFormT({...formT, isPublic: !formT.isPublic})} className={`w-full p-3 rounded-xl border-2 border-black flex items-center justify-between transition-colors ${formT.isPublic ? 'bg-black text-white shadow-[2px_2px_0px_#ebca7a]' : 'bg-white text-black'}`}>
                  <span className="text-[11px] font-black uppercase">Visibilidad Global (Admin)</span>
                  <div className={`w-8 h-4 rounded-full border-2 border-black relative transition-colors ${formT.isPublic ? 'bg-[#ebca7a]' : 'bg-gray-200'}`}>
                    <div className={`absolute top-0.5 w-2 h-2 rounded-full bg-black transition-all ${formT.isPublic ? 'right-1' : 'left-1'}`} />
                  </div>
                </button>
              )}
              <div className="flex-1 overflow-hidden flex flex-col space-y-2">
                 <div className="flex justify-between items-end border-b-2 border-black pb-1">
                   <label className="text-[11px] font-black text-gray-700 uppercase">Secuencia ({formT.workoutIds.length})</label>
                 </div>
                 <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-black bg-gray-50 rounded-xl p-2 border-2 border-black min-h-[150px]">
                    {formT.workoutIds.map((wid, idx) => {
                      const w = library.find(item => item.id === wid);
                      return (
                        <div key={`${wid}-${idx}`} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-black/20 shadow-sm">
                           <span className="w-5 h-5 bg-black text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0">{idx+1}</span>
                           <span className="flex-1 text-[11px] font-bold uppercase truncate text-black">{w?.name || 'Cargando...'}</span>
                           <div className="flex gap-1">
                              <button onClick={() => {
                                  const ids = [...formT.workoutIds];
                                  if (idx > 0) {
                                    [ids[idx], ids[idx-1]] = [ids[idx-1], ids[idx]];
                                    setFormT({...formT, workoutIds: ids});
                                  }
                                }} className="w-5 h-5 flex items-center justify-center border border-black rounded hover:bg-gray-100 bg-white"><svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 15l7-7 7 7"></path></svg></button>
                              <button onClick={() => {
                                  const ids = formT.workoutIds.filter((_, i) => i !== idx);
                                  setFormT({...formT, workoutIds: ids});
                                }} className="w-5 h-5 flex items-center justify-center border border-black rounded text-red-500 hover:bg-red-50 bg-white"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                           </div>
                        </div>
                      );
                    })}
                 </div>
                 <button onClick={() => setShowWorkoutPicker(true)} className="w-full bg-black text-[#ebca7a] p-3 rounded-xl font-heading text-xs border-2 border-black hover:opacity-90 active:translate-y-0.5 transition-all shadow-[4px_4px_0px_#ebca7a] mb-2">+ AÑADIR WORKOUT</button>
              </div>
              <div className="flex gap-3 pt-2">
                 <button onClick={handleSaveTemplate} className="flex-1 neo-brutalism bg-[#a3cfbb] p-4 rounded-xl font-heading text-xs uppercase border-black active:translate-y-1">GUARDAR CIRCUITO</button>
                 <button onClick={() => setEditingT(null)} className="flex-1 neo-brutalism bg-white p-4 rounded-xl font-heading text-xs uppercase border-black">CANCELAR</button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL: SELECTOR DEDICADO DE WORKOUTS */}
      {showWorkoutPicker && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
          <div className="bg-white neo-brutalism p-6 rounded-2xl w-full max-w-sm border-black animate-in zoom-in-95 max-h-[90vh] flex flex-col shadow-2xl">
             <div className="flex justify-between items-center mb-6">
                <h3 className="font-heading text-xl">SELECCIONAR</h3>
                <button onClick={() => setShowWorkoutPicker(false)} className="w-8 h-8 neo-brutalism bg-white rounded-full flex items-center justify-center border-black">
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
             </div>
             
             <div className="space-y-3 mb-4">
                <input type="text" placeholder="Buscar workout..." className="w-full p-3 neo-brutalism rounded-xl text-xs focus:outline-none border-black bg-white text-black font-bold" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} autoFocus />
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                   <button onClick={() => setPickerTypeFilter(null)} className={`px-3 py-1.5 rounded-full border-2 border-black text-[10px] font-black uppercase whitespace-nowrap transition-colors ${!pickerTypeFilter ? 'bg-black text-white' : 'bg-white text-black'}`}>Todos</button>
                   {workoutTypes.map(type => (
                     <button key={type} onClick={() => setPickerTypeFilter(type)} className={`px-3 py-1.5 rounded-full border-2 border-black text-[10px] font-black uppercase whitespace-nowrap transition-colors ${pickerTypeFilter === type ? 'bg-black text-white' : 'bg-white text-black'}`}>{type}</button>
                   ))}
                </div>
             </div>

             <div className="flex-1 overflow-y-auto space-y-2 pr-1 bg-gray-50 rounded-xl p-2 border-2 border-black scrollbar-thin scrollbar-thumb-black">
                {filteredWorkoutsForPicker.map(w => (
                  <button key={w.id} onClick={() => setFormT({...formT, workoutIds: [...formT.workoutIds, w.id]})} className="w-full text-left p-3 bg-white border border-black/10 rounded-lg hover:bg-[#ebca7a]/10 transition-colors flex justify-between items-center group relative overflow-hidden">
                    {formT.workoutIds.includes(w.id) && <div className="absolute top-0 right-0 bg-[#ebca7a] px-1.5 py-0.5 border-l border-b border-black text-[6px] font-black uppercase">En secuencia</div>}
                    <div>
                      <h4 className="font-heading text-[12px] text-black leading-tight">{w.name}</h4>
                      <p className="text-[10px] font-bold text-gray-500 uppercase">{w.weight} • {w.type}</p>
                    </div>
                    <div className="w-6 h-6 rounded-full border border-black bg-white flex items-center justify-center group-hover:bg-black group-hover:text-white transition-colors">
                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"></path></svg>
                    </div>
                  </button>
                ))}
             </div>

             <div className="mt-6">
                <button onClick={() => setShowWorkoutPicker(false)} className="w-full neo-brutalism bg-black text-white p-4 rounded-xl font-heading text-xs tracking-tight active:translate-y-1 uppercase">TERMINAR SELECCIÓN ({formT.workoutIds.length})</button>
             </div>
          </div>
        </div>
      )}

      {/* MODAL: Editor de Workout */}
      {editingW && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
          <div className="bg-white neo-brutalism p-6 rounded-2xl w-full max-w-sm space-y-4 border-black animate-in zoom-in-95 shadow-2xl">
             <div className="flex justify-between items-start">
               <h3 className="font-heading text-xl">{editingW.id ? 'EDITAR' : 'NUEVO'} WORKOUT</h3>
               {formW.isPublic && <span className="bg-[#ebca7a] text-black text-[9px] font-black uppercase px-2 py-1 rounded border border-black flex items-center gap-1">Global <EyeIcon className="w-3 h-3" /></span>}
             </div>
             {userRole === 'admin' && (
               <div className="bg-gray-50 p-3 rounded-xl border-2 border-black">
                 <button type="button" onClick={() => setFormW({...formW, isPublic: !formW.isPublic})} className={`w-full p-2 rounded-lg border-2 border-black flex items-center justify-between transition-colors ${formW.isPublic ? 'bg-black text-white shadow-[2px_2px_0px_#ebca7a]' : 'bg-white text-black'}`}>
                   <span className="text-[11px] font-black uppercase">Visibilidad Pública</span>
                   <div className={`w-8 h-4 rounded-full border-2 border-black relative transition-colors ${formW.isPublic ? 'bg-[#ebca7a]' : 'bg-gray-200'}`}>
                      <div className={`absolute top-0.5 w-2 h-2 rounded-full bg-black transition-all ${formW.isPublic ? 'right-1' : 'left-1'}`} />
                   </div>
                 </button>
               </div>
             )}
             <div className="space-y-1">
                <label className="text-[11px] font-black text-gray-700 uppercase ml-1">Nombre</label>
                <input type="text" className="w-full p-3 neo-brutalism rounded-lg text-sm focus:outline-none border-black bg-white text-black font-bold" value={formW.name} onChange={e => setFormW({...formW, name: e.target.value})} />
             </div>
             <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-gray-700 uppercase ml-1">Peso</label>
                  <input type="text" className="w-full p-3 neo-brutalism rounded-lg text-sm focus:outline-none border-black bg-white text-black font-bold" value={formW.weight} onChange={e => setFormW({...formW, weight: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-gray-700 uppercase ml-1">Tipo</label>
                  <input type="text" className="w-full p-3 neo-brutalism rounded-lg text-sm focus:outline-none border-black bg-white text-black font-bold" value={formW.type} onChange={e => setFormW({...formW, type: e.target.value})} />
                </div>
             </div>
             <div className="space-y-1">
                <label className="text-[11px] font-black text-gray-700 uppercase ml-1">Descripción</label>
                <textarea placeholder="Ejercicios y reps..." className="w-full p-3 neo-brutalism rounded-lg text-sm min-h-[100px] border-black resize-none bg-white text-black font-bold" value={formW.description} onChange={e => setFormW({...formW, description: e.target.value})} />
             </div>

             {/* Carrete de videos / imágenes del workout */}
             <div className="space-y-1">
                <label className="text-[11px] font-black text-gray-700 uppercase ml-1">Videos / Fotos del workout</label>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                   {(formW.media || []).map((m, idx) => (
                     <div key={idx} className="relative w-20 h-20 shrink-0 neo-brutalism rounded-lg overflow-hidden bg-black border-2 border-black">
                       {m.type === 'video'
                         ? <video src={m.url} className="w-full h-full object-cover" muted />
                         : <img src={m.url} className="w-full h-full object-cover" />}
                       {m.type === 'video' && (
                         <span className="absolute bottom-1 left-1 text-white text-[10px]">▶</span>
                       )}
                       <button type="button" onClick={() => removeWorkoutMedia(idx)} className="absolute top-0.5 right-0.5 bg-white rounded-full p-0.5 border border-black">
                         <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                       </button>
                     </div>
                   ))}
                   <label className={`w-20 h-20 shrink-0 neo-brutalism rounded-lg bg-white flex flex-col items-center justify-center cursor-pointer border-2 border-black ${mediaUploading ? 'opacity-50' : ''}`}>
                     {mediaUploading
                       ? <div className="w-5 h-5 border-4 border-black border-t-transparent rounded-full animate-spin" />
                       : <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path></svg>}
                     <input type="file" className="hidden" accept="image/*,video/*" multiple disabled={mediaUploading} onChange={(e) => { if (e.target.files?.length) handleAddWorkoutMedia(e.target.files); e.target.value = ''; }} />
                   </label>
                </div>
                {!isCloudinaryConfigured && <p className="text-[10px] text-gray-400 font-bold ml-1">Configura Cloudinary para subir medios.</p>}
             </div>

             <div className="flex gap-3 pt-2">
                <button onClick={handleSaveWorkout} className="flex-1 neo-brutalism bg-[#a3cfbb] p-4 rounded-xl font-heading text-xs uppercase border-black">GUARDAR</button>
                <button onClick={() => setEditingW(null)} className="flex-1 neo-brutalism bg-gray-200 p-4 rounded-xl font-heading text-xs uppercase border-black">CERRAR</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LibraryView;

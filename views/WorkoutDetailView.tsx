
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Workout, WorkoutLog } from '../types';
import { analyzeWorkoutPerformance, suggestProgressiveOverload } from '../services/geminiService';
import { uploadImage, isCloudinaryConfigured } from '../services/cloudinary';

interface WorkoutDetailViewProps {
  workout: Workout;
  currentLog?: WorkoutLog;
  previousLog?: WorkoutLog;
  onBack: () => void;
  onSave: (log: WorkoutLog, updatedWeight?: string, updatedDescription?: string, isFinal?: boolean) => void;
  onRetrain?: () => void;
}

const WorkoutDetailView: React.FC<WorkoutDetailViewProps> = ({ 
  workout, 
  currentLog, 
  previousLog, 
  onBack, 
  onSave,
  onRetrain
}) => {
  const [comments, setComments] = useState('');
  const [progressiveOverload, setProgressiveOverload] = useState('');
  const [weight, setWeight] = useState(workout.weight);
  const [description, setDescription] = useState(workout.description);
  const [images, setImages] = useState<string[]>([]);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const lastPropsLogId = useRef<string | null>(null);

  useEffect(() => {
    const logId = currentLog ? `${currentLog.date}-${currentLog.workoutId}` : 'new';
    
    if (lastPropsLogId.current !== logId) {
      if (currentLog) {
        setComments(currentLog.comments || '');
        setProgressiveOverload(currentLog.progressiveOverload || '');
        setImages(currentLog.statsImages || []);
        setAiAnalysis(currentLog.aiAnalysisText || '');
      } else {
        setComments('');
        setProgressiveOverload('');
        setImages([]);
        setAiAnalysis('');
      }
      
      // Sincronizar con el workout actual de la librería
      setWeight(workout.weight);
      setDescription(workout.description);
      
      lastPropsLogId.current = logId;
    }
  }, [currentLog, workout]);

  const hasChanges = useMemo(() => {
    const imagesChanged = JSON.stringify(images) !== JSON.stringify(currentLog?.statsImages || []);
    return (
      comments !== (currentLog?.comments || '') ||
      progressiveOverload !== (currentLog?.progressiveOverload || '') ||
      weight !== workout.weight ||
      description !== workout.description ||
      aiAnalysis !== (currentLog?.aiAnalysisText || '') ||
      imagesChanged
    );
  }, [comments, progressiveOverload, weight, description, images, aiAnalysis, currentLog, workout]);

  const handleSaveDraft = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onSave({
      workoutId: workout.id,
      date: currentLog?.date || new Date().toISOString(),
      time: currentLog?.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      statsImages: images,
      progressiveOverload,
      comments,
      completed: false,
      aiAnalysisText: aiAnalysis
    }, weight, description, false);
  };

  const handleDiscardChanges = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("¿Descartar cambios no guardados?")) {
      setComments(currentLog?.comments || '');
      setProgressiveOverload(currentLog?.progressiveOverload || '');
      setImages(currentLog?.statsImages || []);
      setAiAnalysis(currentLog?.aiAnalysisText || '');
      setWeight(workout.weight);
      setDescription(workout.description);
    }
  };

  const handleComplete = () => {
    onSave({
      workoutId: workout.id,
      date: currentLog?.date || new Date().toISOString(),
      time: currentLog?.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      statsImages: images,
      progressiveOverload,
      comments,
      completed: true,
      aiAnalysisText: aiAnalysis
    }, weight, description, true);
  };

  const reanalyzeAll = async (currentImages: string[]) => {
    if (currentImages.length === 0) return;
    setIsAnalyzing(true);
    const result = await analyzeWorkoutPerformance(currentImages, { ...workout, weight, description });
    setAiAnalysis(result || '');
    setIsAnalyzing(false);
  };

  const handleAddImage = async (file: File) => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    let ref = base64;
    if (isCloudinaryConfigured) {
      setIsUploading(true);
      try {
        ref = await uploadImage(base64);
      } catch (e) {
        console.error('Cloudinary upload error:', e);
        ref = base64; // fallback: se mostrará pero no se persistirá
      } finally {
        setIsUploading(false);
      }
    }
    const newImgs = [...images, ref];
    setImages(newImgs);
    reanalyzeAll(newImgs);
  };

  return (
    <div className="py-4 animate-in fade-in slide-in-from-bottom-4 duration-300 text-black relative min-h-[100vh]">
      <header className="flex justify-between items-center mb-6">
        <button onClick={() => hasChanges && !currentLog?.completed ? confirm("Salir sin guardar?") && onBack() : onBack()} className="flex items-center gap-1 font-bold text-sm text-black">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"></path></svg>
          ATRÁS
        </button>
        {currentLog?.completed && <span className="text-[11px] font-black uppercase px-2 py-1 bg-[#77b074] text-white rounded border border-black shadow-[2px_2px_0px_#000]">COMPLETADO ✓</span>}
      </header>

      <div className="mb-8">
        <h2 className="font-heading text-4xl text-black leading-none mb-4">{workout.name}</h2>
        <div className="flex flex-wrap gap-2 mb-6">
          <div className="neo-brutalism bg-[#ebca7a] px-3 py-1 rounded-full flex items-center gap-2 border-2 border-black">
            <span className="text-[11px] font-bold text-black opacity-70">PESO:</span>
            <input disabled={currentLog?.completed} className="bg-transparent font-heading text-xs w-16 focus:outline-none" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
          <span className="bg-black text-white text-[11px] px-3 py-1.5 rounded-full font-bold uppercase">{workout.type}</span>
        </div>
        
        <label className="font-heading text-[12px] mb-1 block opacity-60 uppercase">Rutina:</label>
        <textarea disabled={currentLog?.completed} className="w-full bg-white neo-brutalism p-4 rounded-xl text-sm border-2 border-black focus:outline-none min-h-[100px]" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="space-y-8 pb-48">
        {/* REFERENCIA DE REGISTRO PREVIO */}
        {previousLog && !currentLog?.completed && (
          <div className="bg-[#f0ece2] border-2 border-black rounded-2xl p-5 shadow-[4px_4px_0px_#000] animate-in slide-in-from-top-2">
            <div className="flex justify-between items-center mb-3 border-b-2 border-black/10 pb-2">
              <span className="font-heading text-[12px] text-black">LO ÚLTIMO REGISTRADO</span>
              <span className="text-[10px] font-black text-gray-500">{new Date(previousLog.date).toLocaleDateString()}</span>
            </div>
            
            {previousLog.progressiveOverload && (
              <div className="mb-3">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-1">Plan / Sobrecarga previo:</p>
                <p className="text-xs font-bold text-black italic">"{previousLog.progressiveOverload}"</p>
              </div>
            )}
            
            {previousLog.comments && (
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-1">Sensaciones anteriores:</p>
                <p className="text-xs font-bold text-black italic">"{previousLog.comments}"</p>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="font-heading text-sm mb-2 block">Imágenes</label>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            {images.map((img, idx) => (
              <div key={idx} className="relative w-24 h-24 shrink-0 neo-brutalism rounded-lg overflow-hidden bg-black" onClick={() => setPreviewImage(img)}>
                <img src={img} className="w-full h-full object-cover" />
                {!currentLog?.completed && <button onClick={(e) => { e.stopPropagation(); setImages(images.filter((_, i) => i !== idx)); }} className="absolute top-1 right-1 bg-white rounded-full p-1 border border-black"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>}
              </div>
            ))}
            {!currentLog?.completed && (
              <label className="w-24 h-24 shrink-0 neo-brutalism rounded-lg bg-white flex flex-col items-center justify-center cursor-pointer border-2 border-black">
                {isUploading ? (
                  <div className="w-6 h-6 border-4 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path></svg>
                )}
                <input type="file" className="hidden" accept="image/*" disabled={isUploading} onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAddImage(file);
                  e.target.value = '';
                }} />
              </label>
            )}
          </div>
          {aiAnalysis && !previewImage && (
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-[12px] text-blue-900 animate-in fade-in">
              <span className="font-black">RESUMEN IA:</span> {aiAnalysis}
            </div>
          )}
        </div>

        <div>
          <label className="font-heading text-xs mb-2 block">Plan / Sobrecarga Actual</label>
          <textarea disabled={currentLog?.completed} className="w-full neo-brutalism p-4 rounded-xl text-sm min-h-[80px] bg-white border-black" placeholder="Define el plan para hoy..." value={progressiveOverload} onChange={(e) => setProgressiveOverload(e.target.value)} />
        </div>

        <div>
          <label className="font-heading text-xs mb-2 block">Comentarios Hoy</label>
          <textarea disabled={currentLog?.completed} className="w-full neo-brutalism p-4 rounded-xl text-sm min-h-[80px] bg-white border-black" placeholder="¿Cómo te sentiste?" value={comments} onChange={(e) => setComments(e.target.value)} />
        </div>

        {!currentLog?.completed ? (
          <button onClick={handleComplete} className="w-full neo-brutalism bg-[#77b074] p-5 rounded-2xl font-heading text-xl border-black shadow-lg active:translate-y-1">FINALIZAR SESIÓN</button>
        ) : (
          <div className="space-y-4">
             <button onClick={onRetrain} className="w-full neo-brutalism bg-[#ebca7a] p-5 rounded-2xl font-heading text-xl border-black animate-pulse">VOLVER A ENTRENAR 💪</button>
             <button onClick={handleComplete} className="w-full neo-brutalism bg-white p-3 rounded-2xl font-heading text-xs uppercase border-black opacity-60">Actualizar Histórico</button>
          </div>
        )}
      </div>

      {/* BARRA DE CAMBIOS: Z-index elevado y manejadores corregidos */}
      {hasChanges && !currentLog?.completed && (
        <div 
          className="fixed bottom-24 left-4 right-4 max-w-md mx-auto neo-brutalism bg-[#ebca7a] p-3 rounded-2xl flex items-center justify-between z-[2500] shadow-2xl animate-in slide-in-from-bottom-2 border-black"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pl-2">
            <p className="text-[12px] font-black uppercase leading-none text-black">Cambios detectados</p>
            <p className="text-[10px] opacity-70 font-bold text-black">Sesión en curso</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handleDiscardChanges} 
              className="bg-white border-2 border-black px-4 py-2 rounded-lg text-[11px] font-black shadow-sm active:translate-y-0.5 active:shadow-none cursor-pointer"
            >
              DESCARTAR
            </button>
            <button 
              onClick={(e) => handleSaveDraft(e)} 
              className="bg-black text-white px-5 py-2 rounded-lg text-[11px] font-black shadow-sm active:translate-y-0.5 active:shadow-none cursor-pointer"
            >
              GUARDAR
            </button>
          </div>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
           <img src={previewImage} className="max-w-full max-h-full rounded-xl border-4 border-white" />
        </div>
      )}
    </div>
  );
};

export default WorkoutDetailView;

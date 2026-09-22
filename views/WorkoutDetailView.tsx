
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Workout, WorkoutLog } from '../types';
import { analyzeWorkoutPerformance, suggestProgressiveOverload } from '../services/claudeService';
import { uploadImage, isCloudinaryConfigured } from '../services/cloudinary';
import { EQUIPMENT_LABELS } from '../constants';
import { BoltIcon } from '../components/icons';

interface WorkoutDetailViewProps {
  workout: Workout;
  currentLog?: WorkoutLog;
  previousLog?: WorkoutLog;
  onBack: () => void;
  onSave: (log: WorkoutLog, updatedWeight?: string, updatedDescription?: string, isFinal?: boolean) => void;
  onRetrain?: () => void;
  // Editar un registro ya entrenado (histórico): peso, imágenes, plan, comentarios y fecha.
  onUpdateLog?: (updatedLog: WorkoutLog, updatedWeight?: string, updatedDescription?: string) => void;
}

// Helpers de fecha para el input type="date" (conserva la hora original del registro).
const pad = (n: number) => String(n).padStart(2, '0');
const isoToDateInput = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dateInputToIso = (dateInput: string, originalIso: string) => {
  if (!dateInput) return originalIso;
  const [y, m, day] = dateInput.split('-').map(Number);
  const d = new Date(originalIso);
  if (isNaN(d.getTime())) return new Date(y, m - 1, day).toISOString();
  d.setFullYear(y, m - 1, day);
  return d.toISOString();
};

const WorkoutDetailView: React.FC<WorkoutDetailViewProps> = ({
  workout,
  currentLog,
  previousLog,
  onBack,
  onSave,
  onRetrain,
  onUpdateLog
}) => {
  const [comments, setComments] = useState('');
  const [rpe, setRpe] = useState<number | undefined>(undefined);
  const [progressiveOverload, setProgressiveOverload] = useState('');
  // Peso REAL usado en la sesión. Sugerencia inicial: el peso del log (si se edita)
  // o el peso del slot/workout (referencia). NO muta el workout al guardar.
  const [weight, setWeight] = useState(currentLog?.weight ?? workout.weight);
  const [description, setDescription] = useState(workout.description);
  const [images, setImages] = useState<string[]>([]);
  const [logDate, setLogDate] = useState('');
  const [editingCompleted, setEditingCompleted] = useState(false);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const lastPropsLogId = useRef<string | null>(null);

  // Registro completado y NO en modo edición ⇒ solo lectura.
  const readOnly = !!currentLog?.completed && !editingCompleted;

  useEffect(() => {
    const logId = currentLog ? `${currentLog.date}-${currentLog.slotId || currentLog.workoutId}` : 'new';

    if (lastPropsLogId.current !== logId) {
      if (currentLog) {
        setComments(currentLog.comments || '');
        setRpe(currentLog.rpe);
        setProgressiveOverload(currentLog.progressiveOverload || '');
        setImages(currentLog.statsImages || []);
        setAiAnalysis(currentLog.aiAnalysisText || '');
        setLogDate(isoToDateInput(currentLog.date));
      } else {
        setComments('');
        setRpe(undefined);
        setProgressiveOverload('');
        setImages([]);
        setAiAnalysis('');
        setLogDate('');
      }
      setEditingCompleted(false);

      // Peso: el registrado en la sesión (si existe) o la sugerencia del slot/workout.
      setWeight(currentLog?.weight ?? workout.weight);
      setDescription(workout.description);

      lastPropsLogId.current = logId;
    }
  }, [currentLog, workout]);

  const hasChanges = useMemo(() => {
    const imagesChanged = JSON.stringify(images) !== JSON.stringify(currentLog?.statsImages || []);
    return (
      comments !== (currentLog?.comments || '') ||
      (rpe ?? null) !== (currentLog?.rpe ?? null) ||
      progressiveOverload !== (currentLog?.progressiveOverload || '') ||
      weight !== (currentLog?.weight ?? workout.weight) ||
      description !== workout.description ||
      aiAnalysis !== (currentLog?.aiAnalysisText || '') ||
      imagesChanged
    );
  }, [comments, rpe, progressiveOverload, weight, description, images, aiAnalysis, currentLog, workout]);

  const handleSaveDraft = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onSave({
      workoutId: workout.id,
      slotId: (workout as any).slotId,
      date: currentLog?.date || new Date().toISOString(),
      time: currentLog?.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      weight,
      weightCount: workout.weightCount,
      statsImages: images,
      progressiveOverload,
      comments,
      rpe,
      completed: false,
      aiAnalysisText: aiAnalysis
    }, undefined, description, false);
  };

  const handleDiscardChanges = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("¿Descartar cambios no guardados?")) {
      setComments(currentLog?.comments || '');
      setRpe(currentLog?.rpe);
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
      slotId: (workout as any).slotId,
      date: currentLog?.date || new Date().toISOString(),
      time: currentLog?.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      weight,
      weightCount: workout.weightCount,
      statsImages: images,
      progressiveOverload,
      comments,
      rpe,
      completed: true,
      aiAnalysisText: aiAnalysis
    }, undefined, description, true);
  };

  // Guardar la edición de un registro ya entrenado (histórico).
  const handleSaveEdits = () => {
    if (!currentLog) return;
    const newDate = dateInputToIso(logDate, currentLog.date);
    const updated: WorkoutLog = {
      ...currentLog,
      workoutId: workout.id,
      date: newDate,
      weight,
      weightCount: workout.weightCount,
      statsImages: images,
      progressiveOverload,
      comments,
      rpe,
      completed: true,
      aiAnalysisText: aiAnalysis,
    };
    if (onUpdateLog) onUpdateLog(updated, undefined, description);
    else onSave(updated, undefined, description, true);
    setEditingCompleted(false);
  };

  const handleCancelEdits = () => {
    setComments(currentLog?.comments || '');
    setRpe(currentLog?.rpe);
    setProgressiveOverload(currentLog?.progressiveOverload || '');
    setImages(currentLog?.statsImages || []);
    setAiAnalysis(currentLog?.aiAnalysisText || '');
    setLogDate(isoToDateInput(currentLog?.date));
    setWeight(workout.weight);
    setDescription(workout.description);
    setEditingCompleted(false);
  };

  const reanalyzeAll = async (currentImages: string[]) => {
    if (currentImages.length === 0) return;
    setIsAnalyzing(true);
    const result = await analyzeWorkoutPerformance(currentImages, { ...workout, weight, description });
    setAiAnalysis(result || '');
    setIsAnalyzing(false);
  };

  const readAsDataURL = (file: File) => new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  // Sube varias imágenes de una sola vez (carga múltiple).
  const handleAddImages = async (files: FileList) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setIsUploading(true);
    try {
      const refs: string[] = [];
      for (const file of list) {
        const base64 = await readAsDataURL(file);
        let ref = base64;
        if (isCloudinaryConfigured) {
          try { ref = await uploadImage(base64); }
          catch (e) { console.error('Cloudinary upload error:', e); ref = base64; }
        }
        refs.push(ref);
      }
      const newImgs = [...images, ...refs];
      setImages(newImgs);
      reanalyzeAll(newImgs);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="py-4 animate-in fade-in slide-in-from-bottom-4 duration-300 text-black relative min-h-[100vh]">
      <header className="flex justify-between items-center mb-6">
        <button onClick={() => ((hasChanges && !currentLog?.completed) || editingCompleted) ? confirm("Salir sin guardar?") && onBack() : onBack()} className="flex items-center gap-1 font-bold text-sm text-black">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"></path></svg>
          ATRÁS
        </button>
        {currentLog?.completed && (
          editingCompleted
            ? <span className="text-[11px] font-black uppercase px-2 py-1 bg-[#ebca7a] text-black rounded border border-black shadow-[2px_2px_0px_#000]">EDITANDO ✎</span>
            : <span className="text-[11px] font-black uppercase px-2 py-1 bg-[#77b074] text-white rounded border border-black shadow-[2px_2px_0px_#000]">COMPLETADO ✓</span>
        )}
      </header>

      <div className="mb-8">
        <h2 className="font-heading text-4xl text-black leading-none mb-4">{workout.name}</h2>
        <div className="flex flex-wrap gap-2 mb-6">
          <div className="neo-brutalism bg-[#ebca7a] px-3 py-1 rounded-full flex items-center gap-2 border-2 border-black">
            <span className="text-[11px] font-bold text-black opacity-70">PESO:</span>
            <input disabled={readOnly} className="bg-transparent font-heading text-xs w-16 focus:outline-none" value={weight} onChange={(e) => setWeight(e.target.value)} />
            {(workout.weightCount || 1) >= 2 && <span className="text-[11px] font-black text-black">× 2</span>}
          </div>
          <span className="bg-black text-white text-[11px] px-3 py-1.5 rounded-full font-bold uppercase">{workout.type}</span>
          {(workout.equipment || []).map(eq => (
            <span key={eq} className="bg-white text-black text-[11px] px-3 py-1.5 rounded-full font-bold uppercase border-2 border-black">{EQUIPMENT_LABELS[eq]}</span>
          ))}
        </div>
        
        <label className="font-heading text-[12px] mb-1 block opacity-60 uppercase">Rutina:</label>
        <textarea disabled={readOnly} className="w-full bg-white neo-brutalism p-4 rounded-xl text-sm border-2 border-black focus:outline-none min-h-[100px]" value={description} onChange={(e) => setDescription(e.target.value)} />

        {currentLog?.completed && (
          <div className="mt-4">
            <label className="font-heading text-[12px] mb-1 block opacity-60 uppercase">Fecha de entreno:</label>
            <input
              type="date"
              disabled={readOnly}
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="neo-brutalism bg-white px-3 py-2 rounded-xl text-sm border-2 border-black focus:outline-none disabled:opacity-60"
            />
          </div>
        )}
      </div>

      <div className="space-y-8 pb-12">
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
                {!readOnly && <button onClick={(e) => { e.stopPropagation(); setImages(images.filter((_, i) => i !== idx)); }} className="absolute top-1 right-1 bg-white rounded-full p-1 border border-black"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>}
              </div>
            ))}
            {!readOnly && (
              <label className="w-24 h-24 shrink-0 neo-brutalism rounded-lg bg-white flex flex-col items-center justify-center cursor-pointer border-2 border-black">
                {isUploading ? (
                  <div className="w-6 h-6 border-4 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path></svg>
                )}
                <input type="file" className="hidden" accept="image/*" multiple disabled={isUploading} onChange={(e) => {
                  if (e.target.files && e.target.files.length) handleAddImages(e.target.files);
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
          <textarea disabled={readOnly} className="w-full neo-brutalism p-4 rounded-xl text-sm min-h-[80px] bg-white border-black" placeholder="Define el plan para hoy..." value={progressiveOverload} onChange={(e) => setProgressiveOverload(e.target.value)} />
        </div>

        <div>
          <label className="font-heading text-xs mb-2 block">Comentarios Hoy</label>
          <textarea disabled={readOnly} className="w-full neo-brutalism p-4 rounded-xl text-sm min-h-[80px] bg-white border-black" placeholder="¿Cómo te sentiste?" value={comments} onChange={(e) => setComments(e.target.value)} />
        </div>

        <div>
          <label className="font-heading text-xs mb-2 block">Esfuerzo (RPE)</label>
          <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Qué tan duro se sintió · 1 muy fácil → 10 máximo</p>
          <div className="flex gap-1.5 flex-wrap">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <button
                key={n}
                type="button"
                disabled={readOnly}
                onClick={() => setRpe(rpe === n ? undefined : n)}
                className={`w-9 h-9 rounded-lg border-2 border-black font-heading text-sm transition-all disabled:opacity-50 ${
                  rpe === n ? 'bg-black text-white shadow-[2px_2px_0px_#ebca7a]' : 'bg-white text-black'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {!currentLog?.completed ? (
          <div className="space-y-3">
            <button onClick={handleComplete} className="w-full neo-brutalism bg-[#77b074] text-white p-5 rounded-2xl font-heading text-xl border-black shadow-[6px_6px_0px_#000] active:translate-y-1 active:shadow-none">FINALIZAR SESIÓN</button>
            <button onClick={handleSaveDraft} disabled={!hasChanges} className="w-full neo-brutalism bg-white p-3 rounded-2xl font-heading text-xs uppercase border-black disabled:opacity-40 active:translate-y-0.5 active:shadow-none">
              {hasChanges ? 'Guardar avance' : 'Sin cambios por guardar'}
            </button>
          </div>
        ) : editingCompleted ? (
          <div className="space-y-3">
            <button onClick={handleSaveEdits} className="w-full neo-brutalism bg-[#77b074] text-white p-5 rounded-2xl font-heading text-xl border-black shadow-[6px_6px_0px_#000] active:translate-y-1 active:shadow-none">GUARDAR CAMBIOS</button>
            <button onClick={handleCancelEdits} className="w-full neo-brutalism bg-white p-3 rounded-2xl font-heading text-xs uppercase border-black active:translate-y-0.5 active:shadow-none">Cancelar</button>
          </div>
        ) : (
          <div className="space-y-4">
             <button onClick={onRetrain} className="w-full neo-brutalism bg-[#ebca7a] p-5 rounded-2xl font-heading text-xl border-black flex items-center justify-center gap-2">VOLVER A ENTRENAR <BoltIcon className="w-5 h-5" /></button>
             <button onClick={() => setEditingCompleted(true)} className="w-full neo-brutalism bg-white p-4 rounded-2xl font-heading text-sm uppercase border-black active:translate-y-0.5 active:shadow-none">Editar registro</button>
          </div>
        )}
      </div>

      {previewImage && (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
           <img src={previewImage} className="max-w-full max-h-full rounded-xl border-4 border-white" />
        </div>
      )}
    </div>
  );
};

export default WorkoutDetailView;

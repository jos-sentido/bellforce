import React, { useState, useRef, useEffect } from 'react';
import { CoachMessage, Mission, MissionCapacity, DailyMetric } from '../types';
import { extractGarminMetrics } from '../services/coachService';
import { uploadImage, isCloudinaryConfigured } from '../services/cloudinary';

interface CoachViewProps {
  messages: CoachMessage[];
  missions: Mission[];
  metrics: DailyMetric[];
  onSend: (text: string, imageRefs?: string[]) => Promise<void>;
  onClearChat: () => Promise<void> | void;
  onSaveMetric: (m: DailyMetric) => Promise<void> | void;
  onSaveMission: (m: Mission) => Promise<void> | void;
  onUpdateMission: (id: string, partial: Partial<Mission>) => Promise<void> | void;
  onDeleteMission: (id: string) => Promise<void> | void;
  onAppendCoachNote: (text: string) => Promise<void> | void;
}

const todayId = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const CAPACITY_LABELS: Record<MissionCapacity, string> = {
  fuerza: 'Fuerza', potencia: 'Potencia', recovery: 'Recovery', otro: 'Otro',
};

const readFile = (file: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onloadend = () => res(r.result as string);
  r.onerror = rej;
  r.readAsDataURL(file);
});

const GARMIN_FIELDS: { key: keyof DailyMetric; label: string }[] = [
  { key: 'hrv', label: 'HRV (ms)' },
  { key: 'sleepHours', label: 'Sueño (h)' },
  { key: 'trainingReadiness', label: 'Readiness' },
  { key: 'trainingLoad', label: 'Carga' },
  { key: 'vo2max', label: 'VO2 máx' },
  { key: 'restingHR', label: 'FC reposo' },
  { key: 'bodyBattery', label: 'Body Battery' },
  { key: 'stress', label: 'Estrés' },
];

const CoachView: React.FC<CoachViewProps> = ({
  messages, missions, onSend, onClearChat, onSaveMetric,
  onSaveMission, onUpdateMission, onDeleteMission, onAppendCoachNote,
}) => {
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [showMissions, setShowMissions] = useState(false);
  const [showMissionForm, setShowMissionForm] = useState(false);
  const [mTitle, setMTitle] = useState('');
  const [mCapacity, setMCapacity] = useState<MissionCapacity>('fuerza');
  const [mVictory, setMVictory] = useState('');
  const [mWeeks, setMWeeks] = useState('');

  // Flujo Garmin: extracción → confirmación → guardado.
  const [garminBusy, setGarminBusy] = useState(false);
  const [garminDraft, setGarminDraft] = useState<Partial<DailyMetric> | null>(null);

  const activeMissions = missions.filter(m => m.status === 'active');

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, sending]);

  const attach = async (files: FileList) => {
    setUploading(true);
    try {
      const refs: string[] = [];
      for (const f of Array.from(files)) {
        const b64 = await readFile(f);
        let ref = b64;
        if (isCloudinaryConfigured) { try { ref = await uploadImage(b64); } catch { ref = b64; } }
        refs.push(ref);
      }
      setPendingImages(prev => [...prev, ...refs]);
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text && pendingImages.length === 0) return;
    if (sending) return;
    const imgs = pendingImages;
    setInput('');
    setPendingImages([]);
    setSending(true);
    try {
      await onSend(text || 'Analiza estas imágenes.', imgs.length ? imgs : undefined);
    } finally {
      setSending(false);
    }
  };

  // Garmin: sube foto, extrae números, abre tarjeta de confirmación.
  const uploadGarmin = async (files: FileList) => {
    setGarminBusy(true);
    try {
      const refs: string[] = [];
      for (const f of Array.from(files)) {
        const b64 = await readFile(f);
        let ref = b64;
        if (isCloudinaryConfigured) { try { ref = await uploadImage(b64); } catch { ref = b64; } }
        refs.push(ref);
      }
      const parsed = await extractGarminMetrics(refs);
      setGarminDraft({ ...parsed, sourceImage: refs.find(r => r.startsWith('http')) });
    } catch (e) {
      console.error('garmin extract', e);
      alert('No pude leer las métricas de la imagen. Inténtalo de nuevo.');
    } finally {
      setGarminBusy(false);
    }
  };

  const saveGarmin = async () => {
    if (!garminDraft) return;
    await onSaveMetric({ date: todayId(), ...garminDraft });
    setGarminDraft(null);
  };

  const addMission = async () => {
    if (!mTitle.trim() || !mVictory.trim()) return;
    await onSaveMission({
      id: '', userId: '', title: mTitle.trim(), capacity: mCapacity,
      victoryCondition: mVictory.trim(), status: 'active', startDate: new Date().toISOString(),
      ...(mWeeks ? { blockWeeks: parseInt(mWeeks) } : {}),
    });
    setMTitle(''); setMVictory(''); setMWeeks(''); setMCapacity('fuerza');
    setShowMissionForm(false);
  };

  const noteSuggestion = (text: string): string | null => {
    const idx = text.indexOf('SUGERENCIA DE NOTA:');
    return idx >= 0 ? text.slice(idx + 'SUGERENCIA DE NOTA:'.length).trim() : null;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] text-black animate-in fade-in duration-300">
      <header className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="font-heading text-3xl uppercase leading-none">Coach</h2>
          <p className="text-[12px] font-bold text-gray-500 uppercase tracking-widest mt-1">Tu entrenador IA</p>
        </div>
        {messages.length > 0 && (
          <button onClick={() => { if (confirm('¿Borrar la conversación?')) onClearChat(); }} className="text-[10px] font-black uppercase underline text-gray-400">Limpiar</button>
        )}
      </header>

      {/* MISIONES */}
      <div className="mb-3 neo-brutalism bg-[#ebca7a] rounded-2xl border-black overflow-hidden shrink-0">
        <button onClick={() => setShowMissions(o => !o)} className="w-full flex items-center justify-between p-3">
          <span className="font-heading text-xs uppercase">🎯 Misiones activas ({activeMissions.length})</span>
          <svg className={`w-4 h-4 transition-transform ${showMissions ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
        </button>
        {showMissions && (
          <div className="px-3 pb-3 space-y-2">
            {activeMissions.length === 0 && <p className="text-[11px] font-bold text-black/60">Sin misiones activas. Crea una con condición de victoria.</p>}
            {activeMissions.map(m => (
              <div key={m.id} className="bg-white border-2 border-black rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <span className="inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded bg-black text-[#ebca7a] mb-1">{CAPACITY_LABELS[m.capacity]}{m.blockWeeks ? ` · ${m.blockWeeks} sem` : ''}</span>
                    <p className="font-heading text-sm leading-tight">{m.title}</p>
                    <p className="text-[11px] font-bold text-gray-600 mt-1">Victoria: {m.victoryCondition}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => onUpdateMission(m.id, { status: 'achieved', achievedDate: new Date().toISOString() })} className="flex-1 bg-[#77b074] text-white text-[10px] font-black uppercase py-1.5 rounded-lg border-2 border-black">✓ Lograda</button>
                  <button onClick={() => { if (confirm('¿Eliminar misión?')) onDeleteMission(m.id); }} className="bg-white text-[10px] font-black uppercase py-1.5 px-3 rounded-lg border-2 border-black">Borrar</button>
                </div>
              </div>
            ))}

            {showMissionForm ? (
              <div className="bg-white border-2 border-black rounded-xl p-3 space-y-2">
                <input value={mTitle} onChange={e => setMTitle(e.target.value)} placeholder="Título (ej. Misión Fuerza 5×8)" className="w-full p-2 border-2 border-black rounded-lg text-sm font-bold focus:outline-none" />
                <input value={mVictory} onChange={e => setMVictory(e.target.value)} placeholder="Condición de victoria" className="w-full p-2 border-2 border-black rounded-lg text-sm font-bold focus:outline-none" />
                <div className="flex gap-2">
                  <select value={mCapacity} onChange={e => setMCapacity(e.target.value as MissionCapacity)} className="flex-1 p-2 border-2 border-black rounded-lg text-sm font-bold focus:outline-none bg-white">
                    {(Object.keys(CAPACITY_LABELS) as MissionCapacity[]).map(c => <option key={c} value={c}>{CAPACITY_LABELS[c]}</option>)}
                  </select>
                  <input value={mWeeks} onChange={e => setMWeeks(e.target.value)} inputMode="numeric" placeholder="Semanas" className="w-20 p-2 border-2 border-black rounded-lg text-sm font-bold focus:outline-none" />
                </div>
                <div className="flex gap-2">
                  <button onClick={addMission} className="flex-1 bg-black text-white text-[10px] font-black uppercase py-2 rounded-lg">Crear</button>
                  <button onClick={() => setShowMissionForm(false)} className="bg-white text-[10px] font-black uppercase py-2 px-3 rounded-lg border-2 border-black">Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowMissionForm(true)} className="w-full bg-white text-[10px] font-black uppercase py-2 rounded-lg border-2 border-black border-dashed">+ Nueva misión</button>
            )}
          </div>
        )}
      </div>

      {/* CONVERSACIÓN */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-2 scrollbar-none">
        {messages.length === 0 && !sending && (
          <div className="text-center py-8 px-4 neo-brutalism bg-white rounded-2xl border-dashed border-black/30">
            <p className="font-heading text-sm uppercase mb-2">Habla con tu coach</p>
            <p className="text-[12px] font-bold text-gray-500 leading-relaxed">Ya conoce tu perfil, tus workouts y tu historial. Pregúntale qué toca hoy, sube tu Garmin, o pídele que analice tu última semana.</p>
          </div>
        )}
        {messages.map(m => {
          const suggestion = m.role === 'assistant' ? noteSuggestion(m.text) : null;
          return (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3 rounded-2xl border-2 border-black text-[13px] leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-black text-white' : 'bg-white text-black'}`}>
                {m.imageRefs && m.imageRefs.length > 0 && (
                  <div className="flex gap-1 mb-2 flex-wrap">
                    {m.imageRefs.map((img, i) => <img key={i} src={img} className="w-16 h-16 object-cover rounded-lg border-2 border-white/40" />)}
                  </div>
                )}
                {m.text}
                {suggestion && (
                  <button onClick={() => onAppendCoachNote(suggestion)} className="mt-2 block w-full bg-[#ebca7a] text-black text-[10px] font-black uppercase py-1.5 rounded-lg border-2 border-black">+ Agregar a notas del coach</button>
                )}
              </div>
            </div>
          );
        })}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-white border-2 border-black rounded-2xl p-3 flex gap-1">
              <span className="w-2 h-2 bg-black rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-black rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-black rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>

      {/* TARJETA DE CONFIRMACIÓN GARMIN */}
      {garminDraft && (
        <div className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setGarminDraft(null)}>
          <div className="bg-white neo-brutalism border-black rounded-2xl p-5 w-full max-w-sm max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-heading text-lg uppercase mb-1">Confirma tu Garmin</h3>
            <p className="text-[11px] font-bold text-gray-500 mb-4">Revisa y corrige los números antes de guardar.</p>
            <div className="grid grid-cols-2 gap-3">
              {GARMIN_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">{label}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={(garminDraft as any)[key] ?? ''}
                    onChange={e => setGarminDraft(d => ({ ...d, [key]: e.target.value === '' ? undefined : parseFloat(e.target.value) }))}
                    className="w-full p-2 border-2 border-black rounded-lg text-sm font-bold focus:outline-none"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={saveGarmin} className="flex-1 neo-brutalism bg-[#77b074] text-white p-3 rounded-xl font-heading text-xs uppercase border-black">Guardar métricas</button>
              <button onClick={() => setGarminDraft(null)} className="neo-brutalism bg-white p-3 px-4 rounded-xl font-heading text-xs uppercase border-black">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* COMPOSER */}
      <div className="shrink-0 pt-2">
        {pendingImages.length > 0 && (
          <div className="flex gap-2 mb-2 overflow-x-auto">
            {pendingImages.map((img, i) => (
              <div key={i} className="relative w-14 h-14 shrink-0">
                <img src={img} className="w-full h-full object-cover rounded-lg border-2 border-black" />
                <button onClick={() => setPendingImages(prev => prev.filter((_, x) => x !== i))} className="absolute -top-1 -right-1 bg-white rounded-full border border-black w-5 h-5 text-[10px] font-black">×</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-end">
          {/* Adjuntar imagen al mensaje */}
          <label className="w-11 h-11 shrink-0 neo-brutalism bg-white rounded-xl border-black flex items-center justify-center cursor-pointer active:translate-y-0.5">
            {uploading ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>}
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files?.length) attach(e.target.files); e.target.value = ''; }} />
          </label>
          {/* Subir Garmin (extracción estructurada) */}
          <label className="h-11 shrink-0 neo-brutalism bg-[#ebca7a] rounded-xl border-black flex items-center justify-center cursor-pointer active:translate-y-0.5 px-3">
            {garminBusy ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <span className="text-[10px] font-black uppercase">Garmin</span>}
            <input type="file" accept="image/*" multiple className="hidden" disabled={garminBusy} onChange={e => { if (e.target.files?.length) uploadGarmin(e.target.files); e.target.value = ''; }} />
          </label>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Escribe a tu coach…"
            rows={1}
            className="flex-1 neo-brutalism bg-white rounded-xl border-black p-3 text-sm focus:outline-none resize-none max-h-24"
          />
          <button onClick={send} disabled={sending || (!input.trim() && pendingImages.length === 0)} className="w-11 h-11 shrink-0 neo-brutalism bg-black text-white rounded-xl border-black flex items-center justify-center disabled:opacity-40 active:translate-y-0.5">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CoachView;

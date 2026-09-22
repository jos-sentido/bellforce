
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { KETTLEBELL_CIRCUIT } from './constants';
import { AppState, CircuitCycle, CircuitSlot, WorkoutLog, Workout, CircuitTemplate, DailyMetric, Mission, CoachMessage, CoachKnowledge } from './types';
import Layout from './components/Layout';
import HomeView from './views/HomeView';
import WorkoutDetailView from './views/WorkoutDetailView';
import HistoryView from './views/HistoryView';
import ManageCircuitView from './views/ManageCircuitView';
import LibraryView from './views/LibraryView';
import StatsView from './views/StatsView';
import AuthView from './views/AuthView';
import TrainingHubView from './views/TrainingHubView';
import StandalonePickerView from './views/StandalonePickerView';
import SettingsView from './views/SettingsView';
import CoachView from './views/CoachView';
import { observeAuth, logout as firebaseLogout, updateUserProfile } from './services/auth';
import { buildGreeting } from './services/greeting';
import { buildCoachContext, sendCoachMessage } from './services/coachService';
import {
  loadWorkouts, loadTemplates, loadCycles, seedGlobalBase,
  createWorkout, updateWorkout, deleteWorkout,
  saveTemplate, deleteTemplate,
  createCycle, updateCycle, saveLog, deleteLog,
  loadMetrics, saveMetric, loadMissions, saveMission, updateMission, deleteMission,
  loadCoachMessages, appendCoachMessage, clearCoachMessages,
  cycleSlots, logSlotId,
} from './services/db';

// id estable para una NUEVA aparición de un workout en un circuito: 1ra = workoutId,
// siguientes = workoutId__s2, __s3, … (según cuántas ya existan en los slots).
const nextSlotId = (slots: CircuitSlot[], workoutId: string): string => {
  const n = slots.filter(s => s.workoutId === workoutId).length + 1;
  return n === 1 ? workoutId : `${workoutId}__s${n}`;
};

const EMPTY_STATE: AppState = {
  currentUser: null, allUsers: [], library: [], templates: [], cycles: [], currentCycleIndex: -1,
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const loadedForUid = useRef<string | null>(null);

  // Datos del coach IA (fuera de AppState: son series/colecciones propias del uid).
  const [metrics, setMetrics] = useState<DailyMetric[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([]);

  // Sesión de Firebase → currentUser (con perfil de Firestore).
  useEffect(() => {
    const unsub = observeAuth((user) => {
      setState(prev => ({ ...prev, currentUser: user }));
      setAuthLoading(false);
      if (!user) {
        loadedForUid.current = null;
        setState(prev => ({ ...prev, library: [], templates: [], cycles: [] }));
        setMetrics([]); setMissions([]); setCoachMessages([]);
      }
    });
    return unsub;
  }, []);

  // Carga de datos desde Firestore al iniciar sesión (una vez por usuario).
  useEffect(() => {
    const uid = state.currentUser?.id;
    if (!uid || loadedForUid.current === uid) return;
    loadedForUid.current = uid;
    (async () => {
      setDataLoading(true);
      try {
        let [library, templates, cycles, metricsData, missionsData, coachMsgs] = await Promise.all([
          loadWorkouts(uid), loadTemplates(uid), loadCycles(uid),
          loadMetrics(uid).catch(() => [] as DailyMetric[]),
          loadMissions(uid).catch(() => [] as Mission[]),
          loadCoachMessages(uid).catch(() => [] as CoachMessage[]),
        ]);
        // Solo un admin siembra el contenido base GLOBAL (público) si falta.
        if (state.currentUser?.role === 'admin' && !library.some(w => w.isPublic)) {
          await seedGlobalBase(KETTLEBELL_CIRCUIT, uid);
          [library, templates] = await Promise.all([loadWorkouts(uid), loadTemplates(uid)]);
        }
        setState(prev => ({ ...prev, library, templates, cycles }));
        setMetrics(metricsData); setMissions(missionsData); setCoachMessages(coachMsgs);
      } catch (e) {
        console.error('[Bellforce] error cargando datos:', e);
      } finally {
        setDataLoading(false);
      }
    })();
  }, [state.currentUser?.id]);

  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'stats' | 'library' | 'settings' | 'coach'>('home');
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [selectedLog, setSelectedLog] = useState<WorkoutLog | null>(null);
  const [selectedLogCycleId, setSelectedLogCycleId] = useState<string | null>(null);
  const [activeStandaloneLogDate, setActiveStandaloneLogDate] = useState<string | null>(null);

  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<CircuitTemplate | null>(null);
  const [isStandaloneMode, setIsStandaloneMode] = useState(false);
  const [isPickingStandalone, setIsPickingStandalone] = useState(false);
  const [isViewingActiveCircuit, setIsViewingActiveCircuit] = useState(false);
  const [isManagingCircuit, setIsManagingCircuit] = useState(false);

  const userCycles = useMemo(() => {
    if (!state.currentUser) return [];
    return (state.cycles || []).filter(c => c.userId === state.currentUser?.id);
  }, [state.cycles, state.currentUser]);

  const currentCycle = useMemo(() => {
    const active = userCycles.find(c => c.status === 'active' && c.type !== 'standalone' && !c.isArchived);
    if (active) return active;
    return userCycles.filter(c => c.type !== 'standalone' && !c.isArchived).sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0] || null;
  }, [userCycles]);

  const currentCycleIndex = useMemo(() => userCycles.findIndex(c => c.id === currentCycle?.id), [userCycles, currentCycle]);

  // Slots del circuito actual (aparición por aparición; permite repetir un workout).
  const currentSlots = useMemo(() => currentCycle ? cycleSlots(currentCycle) : [], [currentCycle]);

  // Una "instancia entrenable" por slot: workout base + slotId + peso sugerido del
  // slot (o del workout como referencia). El peso REAL se registra en el log.
  const activeWorkouts = useMemo(() => {
    if (!currentCycle) return [];
    return currentSlots.map(slot => {
      const base = state.library.find(w => w.id === slot.workoutId);
      if (!base) return null;
      return { ...base, slotId: slot.id, weight: slot.weight || base.weight };
    }).filter(w => !!w) as (Workout & { slotId: string })[];
  }, [currentCycle, currentSlots, state.library]);

  const nextWorkoutName = useMemo(() => {
    if (!currentCycle) return null;
    const logs = currentCycle.logs || [];
    const next = activeWorkouts.find(w => !logs.find(l => logSlotId(l) === w.slotId)?.completed);
    return next?.name || null;
  }, [currentCycle, activeWorkouts]);

  const handleTabChange = useCallback((tab: any) => {
    setActiveTab(tab);
    setSelectedWorkout(null);
    setSelectedLog(null);
    setSelectedLogCycleId(null);
    setActiveStandaloneLogDate(null);
    setIsStandaloneMode(false);
    setIsPickingStandalone(false);
    setIsViewingActiveCircuit(false);
    setIsManagingCircuit(false);
    setShowTemplatePicker(false);
    setPreviewTemplate(null);
  }, []);

  const handleLogout = useCallback(async () => {
    await firebaseLogout();
    setActiveTab('home');
    setSelectedWorkout(null);
    setSelectedLog(null);
    setIsStandaloneMode(false);
    setIsPickingStandalone(false);
    setIsViewingActiveCircuit(false);
    setIsManagingCircuit(false);
  }, []);

  const handleUpdateProfile = useCallback(async (data: { name?: string; photoURL?: string; coachKnowledge?: CoachKnowledge; coachNotes?: string }) => {
    const user = state.currentUser;
    if (!user) return;
    await updateUserProfile(user.id, data);
    setState(prev => prev.currentUser ? { ...prev, currentUser: { ...prev.currentUser, ...data } } : prev);
  }, [state.currentUser]);

  // ---- Coach IA: métricas, misiones y conversación ----
  const handleSaveMetric = useCallback(async (m: DailyMetric) => {
    const uid = state.currentUser?.id;
    if (!uid) return;
    await saveMetric(uid, m);
    setMetrics(prev => {
      const rest = prev.filter(x => x.date !== m.date);
      const existing = prev.find(x => x.date === m.date);
      return [...rest, { ...existing, ...m }].sort((a, b) => a.date.localeCompare(b.date));
    });
  }, [state.currentUser]);

  const handleSaveMission = useCallback(async (m: Mission) => {
    const uid = state.currentUser?.id;
    if (!uid) return;
    const saved = await saveMission({ ...m, userId: uid });
    setMissions(prev => {
      const rest = prev.filter(x => x.id !== saved.id);
      return [...rest, saved];
    });
  }, [state.currentUser]);

  const handleUpdateMission = useCallback(async (id: string, partial: Partial<Mission>) => {
    await updateMission(id, partial);
    setMissions(prev => prev.map(x => x.id === id ? { ...x, ...partial } : x));
  }, []);

  const handleDeleteMission = useCallback(async (id: string) => {
    await deleteMission(id);
    setMissions(prev => prev.filter(x => x.id !== id));
  }, []);

  const handleSendCoachMessage = useCallback(async (text: string, imageRefs?: string[]) => {
    const user = state.currentUser;
    if (!user) return;
    const uid = user.id;
    const history = coachMessages;
    const now = new Date().toISOString();
    const userMsgData = { role: 'user' as const, text, createdAt: now, ...(imageRefs && imageRefs.length ? { imageRefs } : {}) };

    // Optimista: se muestra de inmediato. La persistencia es best-effort (no bloquea
    // la respuesta ni depende de que las reglas de Firestore estén desplegadas).
    setCoachMessages(prev => [...prev, { id: `tmp-${Date.now()}`, ...userMsgData }]);
    appendCoachMessage(uid, userMsgData).catch(e => console.warn('[coach] no persistió mensaje del usuario:', e));

    try {
      const context = buildCoachContext({ workouts: state.library, cycles: userCycles, metrics, missions });
      const answer = await sendCoachMessage(history, text, {
        knowledge: user.coachKnowledge,
        notes: user.coachNotes,
        context,
        imageRefs,
      });
      const asstData = { role: 'assistant' as const, text: answer, createdAt: new Date().toISOString() };
      setCoachMessages(prev => [...prev, { id: `tmp-a-${Date.now()}`, ...asstData }]);
      appendCoachMessage(uid, asstData).catch(e => console.warn('[coach] no persistió respuesta:', e));
    } catch (e) {
      console.error('[coach] error:', e);
      setCoachMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', text: 'No pude responder en este momento. Revisa tu conexión e inténtalo de nuevo.', createdAt: new Date().toISOString() }]);
    }
  }, [state.currentUser, state.library, userCycles, metrics, missions, coachMessages]);

  const handleClearCoachChat = useCallback(async () => {
    const uid = state.currentUser?.id;
    if (!uid) return;
    await clearCoachMessages(uid);
    setCoachMessages([]);
  }, [state.currentUser]);

  // Agrega una sugerencia del coach a las notas acumuladas (capa 3).
  const handleAppendCoachNote = useCallback(async (text: string) => {
    const user = state.currentUser;
    if (!user) return;
    const stamp = new Date().toLocaleDateString('es-MX');
    const merged = `${(user.coachNotes || '').trim()}\n\n[${stamp}] ${text.trim()}`.trim();
    await updateUserProfile(user.id, { coachNotes: merged });
    setState(prev => prev.currentUser ? { ...prev, currentUser: { ...prev.currentUser, coachNotes: merged } } : prev);
  }, [state.currentUser]);

  const handleExportData = useCallback(() => {
    const dataStr = JSON.stringify({ library: state.library, templates: state.templates, cycles: state.cycles }, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bellforce-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state.library, state.templates, state.cycles]);

  // Nota: import solo actualiza la vista local (no re-sube a Firestore). Útil
  // como respaldo/consulta; la nube es la fuente de verdad.
  const handleImportData = useCallback((jsonText: string): boolean => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed || typeof parsed !== 'object') return false;
      setState(prev => ({
        ...prev,
        library: Array.isArray(parsed.library) ? parsed.library : prev.library,
        templates: Array.isArray(parsed.templates) ? parsed.templates : prev.templates,
        cycles: Array.isArray(parsed.cycles) ? parsed.cycles : prev.cycles,
      }));
      return true;
    } catch {
      return false;
    }
  }, []);

  // ---- Edición del circuito activo (persistiendo slots) ----
  const setCurrentCycleSlots = useCallback((newSlots: CircuitSlot[]) => {
    if (!currentCycle) return;
    updateCycle(currentCycle.id, { slots: newSlots }).catch(e => console.error('updateCycle', e));
    setState(prev => ({ ...prev, cycles: prev.cycles.map(c => c.id === currentCycle.id
      ? { ...c, slots: newSlots, workoutIds: newSlots.map(s => s.workoutId) } : c) }));
  }, [currentCycle]);

  const handleAddToCircuit = useCallback((workoutId: string) => {
    if (!currentCycle) return;
    const slots = cycleSlots(currentCycle);
    setCurrentCycleSlots([...slots, { id: nextSlotId(slots, workoutId), workoutId }]);
  }, [currentCycle, setCurrentCycleSlots]);

  const handleRemoveFromCircuit = useCallback((index: number) => {
    if (!currentCycle) return;
    const slots = cycleSlots(currentCycle);
    const removed = slots[index];
    // Borra también el log de ESA aparición (no el de sus gemelos).
    if (removed) deleteLog(currentCycle.id, { slotId: removed.id, workoutId: removed.workoutId, date: '' } as WorkoutLog, false).catch(e => console.error('deleteLog', e));
    setCurrentCycleSlots(slots.filter((_, i) => i !== index));
  }, [currentCycle, setCurrentCycleSlots]);

  const handleReorderCircuit = useCallback((index: number, direction: 'up' | 'down') => {
    if (!currentCycle) return;
    const slots = [...cycleSlots(currentCycle)];
    const swap = direction === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= slots.length) return;
    [slots[index], slots[swap]] = [slots[swap], slots[index]];
    setCurrentCycleSlots(slots);
  }, [currentCycle, setCurrentCycleSlots]);

  const handleSetSlotWeight = useCallback((index: number, weight: string) => {
    if (!currentCycle) return;
    const slots = cycleSlots(currentCycle).map((s, i) => i === index ? { ...s, weight: weight || undefined } : s);
    setCurrentCycleSlots(slots);
  }, [currentCycle, setCurrentCycleSlots]);

  // ---- Ciclos ----
  const handleStartTemplate = async (template: CircuitTemplate) => {
    const user = state.currentUser;
    if (!user) return;
    const active = state.cycles.find(c => c.userId === user.id && c.status === 'active' && c.type !== 'standalone');
    if (active) updateCycle(active.id, { status: 'paused' }).catch(e => console.error('updateCycle', e));

    const slots = cycleSlots({ workoutIds: template.workoutIds });
    const draft: Omit<CircuitCycle, 'id'> = {
      userId: user.id, name: template.name, startDate: new Date().toISOString(),
      logs: [], status: 'active', isArchived: false,
      slots, workoutIds: slots.map(s => s.workoutId), type: 'circuit',
    };
    setShowTemplatePicker(false);
    setIsViewingActiveCircuit(true);
    setActiveTab('home');
    try {
      const id = await createCycle(draft);
      const newCycle: CircuitCycle = { ...draft, id };
      setState(prev => ({
        ...prev,
        cycles: prev.cycles.map(c => (active && c.id === active.id) ? { ...c, status: 'paused' as const } : c).concat(newCycle),
      }));
    } catch (e) { console.error('createCycle', e); }
  };

  const handleRestartCycle = async (cycle: CircuitCycle) => {
    const user = state.currentUser;
    if (!user) return;
    updateCycle(cycle.id, { status: 'completed', isArchived: true }).catch(e => console.error('updateCycle', e));
    const active = state.cycles.find(c => c.userId === user.id && c.status === 'active' && c.type !== 'standalone' && c.id !== cycle.id);
    if (active) updateCycle(active.id, { status: 'paused' }).catch(e => console.error('updateCycle', e));

    const slots = cycleSlots(cycle);
    const draft: Omit<CircuitCycle, 'id'> = {
      userId: user.id, name: cycle.name, startDate: new Date().toISOString(),
      logs: [], status: 'active', isArchived: false,
      slots, workoutIds: slots.map(s => s.workoutId), type: 'circuit',
    };
    setIsViewingActiveCircuit(true);
    setActiveTab('home');
    try {
      const id = await createCycle(draft);
      const newCycle: CircuitCycle = { ...draft, id };
      setState(prev => ({
        ...prev,
        cycles: prev.cycles.map(c => {
          if (c.id === cycle.id) return { ...c, status: 'completed' as const, isArchived: true };
          if (active && c.id === active.id) return { ...c, status: 'paused' as const };
          return c;
        }).concat(newCycle),
      }));
    } catch (e) { console.error('createCycle', e); }
  };

  const handleViewHistoricalLog = (workout: Workout, log: WorkoutLog, cycleId?: string) => {
    setSelectedWorkout(workout);
    setSelectedLog(log);
    setSelectedLogCycleId(cycleId || null);
    setActiveStandaloneLogDate(log.date);
    setIsStandaloneMode(true);
  };

  // Edición de un registro ya entrenado (histórico): peso, imágenes, plan,
  // comentarios y fecha. Persiste en el ciclo real del registro (no fuerza libre).
  const handleUpdateHistoricalLog = useCallback((cycleId: string, originalLog: WorkoutLog, updatedLog: WorkoutLog, _updatedWeight?: string, updatedDescription?: string) => {
    const user = state.currentUser;
    if (!user) return;
    const cycle = state.cycles.find(c => c.id === cycleId);
    if (!cycle) return;
    const isStandalone = cycle.type === 'standalone';

    // 1) Solo la DESCRIPCIÓN edita la definición del workout (referencia). El PESO
    //    ya no muta el workout: vive en el log (updatedLog.weight).
    let newLibrary = state.library;
    if (updatedDescription !== undefined) {
      const base = state.library.find(w => w.id === originalLog.workoutId);
      if (base && updatedDescription !== base.description) {
        const updated: Workout = { ...base, description: updatedDescription };
        newLibrary = state.library.map(w => w.id === base.id ? updated : w);
        updateWorkout(updated).catch(e => console.error('updateWorkout', e));
      }
    }

    // 2) En libre el docId depende de la fecha: si cambió, borra el doc anterior.
    if (isStandalone && updatedLog.date !== originalLog.date) {
      deleteLog(cycleId, originalLog, true).catch(e => console.error('deleteLog', e));
    }
    saveLog(cycleId, updatedLog, isStandalone).catch(e => console.error('saveLog', e));

    // 3) Estado local (match por slot en circuito; por workout+fecha en libre)
    const matches = (l: WorkoutLog) => isStandalone
      ? (l.workoutId === originalLog.workoutId && l.date === originalLog.date)
      : (logSlotId(l) === logSlotId(originalLog));
    setState(prev => ({
      ...prev,
      library: newLibrary,
      cycles: prev.cycles.map(c => c.id === cycleId
        ? { ...c, logs: (c.logs || []).map(l => matches(l) ? updatedLog : l) }
        : c),
    }));
    setSelectedLog(updatedLog);
  }, [state.currentUser, state.cycles, state.library]);

  const handleCompleteWorkout = useCallback(async (log: WorkoutLog, _updatedWeight?: string, updatedDescription?: string, isFinal: boolean = true) => {
    const user = state.currentUser;
    if (!user) return;

    // 1) El PESO ya viaja en el log (log.weight). Solo la descripción edita la
    //    definición del workout (referencia editable), sin mutar su peso.
    let newLibrary = state.library;
    if (updatedDescription !== undefined) {
      const base = state.library.find(w => w.id === log.workoutId);
      if (base && updatedDescription !== base.description) {
        const updated: Workout = { ...base, description: updatedDescription };
        newLibrary = state.library.map(w => w.id === base.id ? updated : w);
        updateWorkout(updated).catch(e => console.error('updateWorkout', e));
      }
    }

    // 2) Ciclo destino (crea el standalone si hace falta)
    let targetCycle: CircuitCycle | undefined | null;
    if (isStandaloneMode) {
      targetCycle = state.cycles.find(c => c.userId === user.id && c.type === 'standalone');
      if (!targetCycle) {
        const draft: Omit<CircuitCycle, 'id'> = {
          userId: user.id, name: 'Entrenamientos Libres', startDate: new Date().toISOString(),
          logs: [], status: 'active', isArchived: false, workoutIds: [], workoutWeights: {}, type: 'standalone',
        };
        try {
          const id = await createCycle(draft);
          targetCycle = { ...draft, id };
        } catch (e) { console.error('createCycle standalone', e); return; }
      }
    } else {
      targetCycle = currentCycle;
      if (!targetCycle) return;
    }

    // 3) Guardar el log
    saveLog(targetCycle.id, log, isStandaloneMode).catch(e => console.error('saveLog', e));

    // 4) Recalcular logs y campos del ciclo (match por slot en circuito)
    const existingLogs = targetCycle.logs || [];
    const logIdx = isStandaloneMode
      ? existingLogs.findIndex(l => l.date === log.date && l.workoutId === log.workoutId)
      : existingLogs.findIndex(l => logSlotId(l) === logSlotId(log));
    const updatedLogs = (logIdx !== -1 ? existingLogs.map((l, i) => i === logIdx ? log : l) : [...existingLogs, log])
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const cyclePartial: Partial<CircuitCycle> = {};
    let newStatus = targetCycle.status;
    let newEndDate = targetCycle.endDate;
    if (!isStandaloneMode && isFinal) {
      // Completo = todos los SLOTS tienen un log completado (por slotId).
      const totalExpected = cycleSlots(targetCycle).length;
      const completedSlots = new Set(updatedLogs.filter(l => l.completed).map(l => logSlotId(l)));
      if (totalExpected > 0 && completedSlots.size >= totalExpected) {
        newStatus = 'completed';
        newEndDate = new Date().toISOString();
        cyclePartial.status = newStatus;
        cyclePartial.endDate = newEndDate;
      }
    }
    if (Object.keys(cyclePartial).length) updateCycle(targetCycle.id, cyclePartial).catch(e => console.error('updateCycle', e));

    // 5) Estado local
    const updatedCycle: CircuitCycle = { ...targetCycle, logs: updatedLogs, status: newStatus, endDate: newEndDate };
    setState(prev => ({
      ...prev,
      library: newLibrary,
      cycles: prev.cycles.some(c => c.id === updatedCycle.id)
        ? prev.cycles.map(c => c.id === updatedCycle.id ? updatedCycle : c)
        : [...prev.cycles, updatedCycle],
    }));

    if (isFinal) {
      setSelectedWorkout(null);
      setSelectedLog(null);
      setActiveStandaloneLogDate(null);
      setIsStandaloneMode(false);
    }
  }, [state.currentUser, state.cycles, state.library, currentCycle, isStandaloneMode]);

  // ---- Librería y plantillas ----
  const handleAddToLibrary = useCallback(async (w: Omit<Workout, 'id'>) => {
    try {
      const created = await createWorkout(w);
      setState(prev => ({ ...prev, library: [...prev.library, created] }));
    } catch (e) { console.error('createWorkout', e); }
  }, []);

  const handleUpdateWorkout = useCallback((w: Workout) => {
    updateWorkout(w).catch(e => console.error('updateWorkout', e));
    setState(prev => ({ ...prev, library: prev.library.map(item => item.id === w.id ? w : item) }));
  }, []);

  const handleDeleteWorkout = useCallback((id: string) => {
    deleteWorkout(id).catch(e => console.error('deleteWorkout', e));
    setState(prev => ({ ...prev, library: prev.library.filter(w => w.id !== id) }));
  }, []);

  const handleSaveTemplate = useCallback(async (t: CircuitTemplate) => {
    try {
      const saved = await saveTemplate(t);
      setState(prev => {
        const idx = prev.templates.findIndex(item => item.id === saved.id);
        return { ...prev, templates: idx !== -1 ? prev.templates.map(item => item.id === saved.id ? saved : item) : [...prev.templates, saved] };
      });
    } catch (e) { console.error('saveTemplate', e); }
  }, []);

  const handleDeleteTemplate = useCallback((id: string) => {
    deleteTemplate(id).catch(e => console.error('deleteTemplate', e));
    setState(prev => ({ ...prev, templates: prev.templates.filter(t => t.id !== id) }));
  }, []);

  // ---- Cambio / archivo de ciclos ----
  const handleSwitchCycle = useCallback((idx: number) => {
    const target = userCycles[idx];
    if (!target) return;
    const active = state.cycles.find(c => c.userId === state.currentUser?.id && c.status === 'active' && c.type !== 'standalone');
    updateCycle(target.id, { status: 'active' }).catch(e => console.error('updateCycle', e));
    if (active && active.id !== target.id) updateCycle(active.id, { status: 'paused' }).catch(e => console.error('updateCycle', e));
    setState(prev => ({
      ...prev,
      cycles: prev.cycles.map(c => {
        if (c.id === target.id) return { ...c, status: 'active' as const };
        if (active && c.id === active.id) return { ...c, status: 'paused' as const };
        return c;
      }),
    }));
    setIsViewingActiveCircuit(true);
    setActiveTab('home');
  }, [userCycles, state.cycles, state.currentUser]);

  const handleArchiveCycle = useCallback((id: string) => {
    const c = state.cycles.find(x => x.id === id);
    const newStatus = c && c.status === 'active' ? 'paused' : c?.status;
    updateCycle(id, { isArchived: true, status: newStatus }).catch(e => console.error('updateCycle', e));
    setState(prev => ({ ...prev, cycles: prev.cycles.map(x => x.id === id ? { ...x, isArchived: true, status: x.status === 'active' ? 'paused' : x.status } : x) }));
  }, [state.cycles]);

  const handleUnarchiveCycle = useCallback((id: string) => {
    updateCycle(id, { isArchived: false }).catch(e => console.error('updateCycle', e));
    setState(prev => ({ ...prev, cycles: prev.cycles.map(x => x.id === id ? { ...x, isArchived: false } : x) }));
  }, []);

  // Archiva/desarchiva un registro (workout entrenado) dentro de un ciclo.
  const handleArchiveLog = useCallback((cycleId: string, log: WorkoutLog, archived: boolean) => {
    const cycle = state.cycles.find(c => c.id === cycleId);
    if (!cycle) return;
    const updated = { ...log, isArchived: archived };
    const isStandalone = cycle.type === 'standalone';
    saveLog(cycleId, updated, isStandalone).catch(e => console.error('saveLog', e));
    setState(prev => ({
      ...prev,
      cycles: prev.cycles.map(c => c.id === cycleId
        ? { ...c, logs: (c.logs || []).map(l => (isStandalone
            ? (l.workoutId === log.workoutId && l.date === log.date)
            : logSlotId(l) === logSlotId(log)) ? updated : l) }
        : c),
    }));
  }, [state.cycles]);

  // ---- Botón "atrás" del navegador ----
  // Cada capa abierta (tab != home, ver circuito, gestionar, elegir libre, modal
  // de plantillas, workout abierto) suma "profundidad". Retroceder cierra la capa
  // superior en vez de salir de la app. Sincronizamos con history: cada avance
  // empuja una entrada; cada retroceso (por botón atrás o por cerrar en la app)
  // consume/reconciliamos la entrada para no dejar historial desbalanceado.
  const depth = useMemo(() => {
    let d = 0;
    if (activeTab !== 'home') d += 1;
    if (isViewingActiveCircuit) d += 1;
    if (isPickingStandalone) d += 1;
    if (isManagingCircuit) d += 1;
    if (showTemplatePicker) d += 1;
    if (selectedWorkout) d += 1;
    return d;
  }, [activeTab, isViewingActiveCircuit, isPickingStandalone, isManagingCircuit, showTemplatePicker, selectedWorkout]);

  const goBack = useCallback(() => {
    if (selectedWorkout) { setSelectedWorkout(null); setSelectedLog(null); setSelectedLogCycleId(null); setIsStandaloneMode(false); return; }
    if (showTemplatePicker || previewTemplate) { setShowTemplatePicker(false); setPreviewTemplate(null); return; }
    if (isManagingCircuit) { setIsManagingCircuit(false); return; }
    if (isPickingStandalone) { setIsPickingStandalone(false); return; }
    if (isViewingActiveCircuit) { setIsViewingActiveCircuit(false); return; }
    if (activeTab !== 'home') { setActiveTab('home'); return; }
  }, [selectedWorkout, showTemplatePicker, previewTemplate, isManagingCircuit, isPickingStandalone, isViewingActiveCircuit, activeTab]);

  const depthRef = useRef(0);
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;
  const canGoBackRef = useRef(depth > 0);
  canGoBackRef.current = depth > 0;
  const popConsumedRef = useRef(0); // retrocesos ya "pagados" por un popstate del usuario
  const ignorePopsRef = useRef(0);  // popstates provocados por nuestra propia reconciliación

  useEffect(() => {
    const delta = depth - depthRef.current;
    depthRef.current = depth;
    if (delta > 0) {
      for (let i = 0; i < delta; i++) window.history.pushState({ bf: true }, '');
    } else if (delta < 0) {
      let toDrop = -delta;
      const paid = Math.min(toDrop, popConsumedRef.current);
      popConsumedRef.current -= paid;
      toDrop -= paid;
      if (toDrop > 0) {
        ignorePopsRef.current += toDrop;
        window.history.go(-toDrop);
      }
    }
  }, [depth]);

  useEffect(() => {
    const onPop = () => {
      if (ignorePopsRef.current > 0) { ignorePopsRef.current -= 1; return; }
      if (canGoBackRef.current) {
        popConsumedRef.current += 1;
        goBackRef.current();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const renderContent = () => {
    if (authLoading) {
      return (
        <div className="min-h-screen bg-[#fdf6e3] flex flex-col items-center justify-center gap-4">
          <div className="w-10 h-10 border-4 border-black border-t-transparent rounded-full animate-spin" />
          <p className="font-heading text-xs uppercase tracking-widest text-gray-500">Cargando…</p>
        </div>
      );
    }

    if (!state.currentUser) {
      return <AuthView />;
    }

    if (dataLoading) {
      return (
        <div className="min-h-screen bg-[#fdf6e3] flex flex-col items-center justify-center gap-4">
          <div className="w-10 h-10 border-4 border-black border-t-transparent rounded-full animate-spin" />
          <p className="font-heading text-xs uppercase tracking-widest text-gray-500">Sincronizando…</p>
        </div>
      );
    }

    if (selectedWorkout) {
      const sw = selectedWorkout as Workout & { slotId?: string };
      // Conserva el slotId de la instancia seleccionada (para logs por aparición).
      const latestBase = state.library.find(w => w.id === selectedWorkout.id) || selectedWorkout;
      const latestWorkoutRef = sw.slotId ? { ...latestBase, slotId: sw.slotId } : latestBase;
      const log = selectedLog || currentCycle?.logs.find(l =>
        (sw.slotId ? logSlotId(l) === sw.slotId : l.workoutId === selectedWorkout.id) && !l.completed);
      const prevLog = userCycles.flatMap(c => c.logs)
        .filter(l => l.workoutId === selectedWorkout.id && l.completed)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

      return (
        <WorkoutDetailView
          workout={latestWorkoutRef}
          currentLog={log}
          previousLog={prevLog}
          onBack={() => { setSelectedWorkout(null); setSelectedLog(null); setSelectedLogCycleId(null); setIsStandaloneMode(false); }}
          onSave={handleCompleteWorkout}
          onRetrain={() => { setSelectedLog(null); setSelectedLogCycleId(null); setActiveStandaloneLogDate(null); setIsStandaloneMode(true); }}
          onUpdateLog={selectedLog && selectedLogCycleId
            ? (updatedLog, w, d) => handleUpdateHistoricalLog(selectedLogCycleId, selectedLog, updatedLog, w, d)
            : undefined}
        />
      );
    }

    if (isManagingCircuit && currentCycle) {
      return (
        <ManageCircuitView
          activeWorkouts={activeWorkouts}
          library={state.library}
          onAdd={handleAddToCircuit}
          onRemove={handleRemoveFromCircuit}
          onReorder={handleReorderCircuit}
          onSetSlotWeight={handleSetSlotWeight}
          onBack={() => setIsManagingCircuit(false)}
        />
      );
    }

    if (isPickingStandalone) {
      return (
        <StandalonePickerView
          library={state.library}
          onBack={() => setIsPickingStandalone(false)}
          onSelect={(w) => {
            setSelectedWorkout(w);
            setIsStandaloneMode(true);
            setIsPickingStandalone(false);
          }}
        />
      );
    }

    switch (activeTab) {
      case 'home':
        if (!currentCycle || !isViewingActiveCircuit) {
          return (
            <TrainingHubView
              activeCycle={currentCycle}
              completedCount={currentCycle ? new Set((currentCycle.logs || []).filter(l => l.completed).map(l => logSlotId(l))).size : 0}
              totalWorkouts={currentSlots.length}
              greeting={buildGreeting(state.currentUser.name, userCycles)}
              nextWorkoutName={nextWorkoutName}
              onSelectCircuit={() => setIsViewingActiveCircuit(true)}
              onSelectStandalone={() => setIsPickingStandalone(true)}
              onNewCircuit={() => setShowTemplatePicker(true)}
            />
          );
        }
        return (
          <HomeView
            workouts={activeWorkouts}
            currentCycle={currentCycle}
            onSelectWorkout={setSelectedWorkout}
            onManageCircuit={() => setIsManagingCircuit(true)}
            onNewCycle={() => setShowTemplatePicker(true)}
            onBackToHub={() => setIsViewingActiveCircuit(false)}
            onRestartCycle={handleRestartCycle}
            onArchiveCycle={handleArchiveCycle}
          />
        );
      case 'history':
        return <HistoryView cycles={userCycles} workouts={state.library} onRetake={handleRestartCycle} onViewLog={handleViewHistoricalLog} onArchiveCycle={handleArchiveCycle} onUnarchiveCycle={handleUnarchiveCycle} onArchiveLog={handleArchiveLog} />;
      case 'stats':
        return <StatsView cycles={userCycles} workouts={state.library} />;
      case 'library':
        return (
          <LibraryView
            userRole={state.currentUser.role}
            userId={state.currentUser.id}
            library={state.library}
            templates={state.templates}
            cycles={userCycles}
            onAddToLibrary={handleAddToLibrary}
            onUpdateWorkout={handleUpdateWorkout}
            onDeleteWorkout={handleDeleteWorkout}
            onSaveTemplate={handleSaveTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            onStartTemplate={handleStartTemplate}
            onQuickStart={(w) => {
              setSelectedWorkout(w);
              setIsStandaloneMode(true);
            }}
          />
        );
      case 'coach':
        return (
          <CoachView
            messages={coachMessages}
            missions={missions.filter(m => m.userId === state.currentUser!.id)}
            metrics={metrics}
            onSend={handleSendCoachMessage}
            onClearChat={handleClearCoachChat}
            onSaveMetric={handleSaveMetric}
            onSaveMission={handleSaveMission}
            onUpdateMission={handleUpdateMission}
            onDeleteMission={handleDeleteMission}
            onAppendCoachNote={handleAppendCoachNote}
          />
        );
      case 'settings':
        return (
          <SettingsView
            user={state.currentUser}
            metrics={metrics}
            onLogout={handleLogout}
            onExport={handleExportData}
            onImport={handleImportData}
            onUpdateProfile={handleUpdateProfile}
            onSaveMetric={handleSaveMetric}
          />
        );
      default:
        return <div className="p-8 text-center">Sección en construcción</div>;
    }
  };

  return (
    <Layout
      activeTab={activeTab}
      setActiveTab={handleTabChange}
      cycles={userCycles}
      library={state.library}
      currentCycleIndex={currentCycleIndex}
      onSwitchCycle={handleSwitchCycle}
      onArchiveCycle={handleArchiveCycle}
      onUnarchiveCycle={handleUnarchiveCycle}
      onCreateNewCycle={() => setShowTemplatePicker(true)}
      onViewLog={handleViewHistoricalLog}
      isUserLoggedIn={!!state.currentUser}
    >
      {renderContent()}

      {showTemplatePicker && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
           <div className="bg-white neo-brutalism p-6 rounded-2xl w-full max-w-sm border-black max-h-[85vh] flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-heading text-xl uppercase">{previewTemplate ? previewTemplate.name : 'Nueva Programación'}</h3>
                <button onClick={() => { setShowTemplatePicker(false); setPreviewTemplate(null); }} className="text-gray-500 hover:text-black">
                   <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>

              {previewTemplate ? (
                <>
                  <button onClick={() => setPreviewTemplate(null)} className="flex items-center gap-1 text-[11px] font-black uppercase text-gray-500 mb-3">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"></path></svg>
                    Volver
                  </button>
                  <p className="text-[10px] font-black uppercase text-gray-500 mb-3">{previewTemplate.workoutIds.length} sesiones en este circuito</p>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-4 scrollbar-thin scrollbar-thumb-black">
                    {previewTemplate.workoutIds.map((id, idx) => {
                      const w = state.library.find(x => x.id === id);
                      return (
                        <div key={`${id}-${idx}`} className="p-3 border-2 border-black rounded-xl bg-gray-50 flex items-center gap-3">
                          <span className="w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0">{idx + 1}</span>
                          <div className="flex-1 overflow-hidden">
                            <p className="text-[11px] font-black uppercase leading-tight truncate">{w?.name || 'Workout'}</p>
                            <p className="text-[9px] text-gray-600 font-bold uppercase">{w?.weight} • {w?.type}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={() => { handleStartTemplate(previewTemplate); setPreviewTemplate(null); }} className="w-full neo-brutalism bg-[#ebca7a] text-black p-4 rounded-xl font-heading text-sm uppercase border-black active:translate-y-1">Activar circuito</button>
                </>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto space-y-3 mb-6 pr-1 scrollbar-thin scrollbar-thumb-black">
                    {state.templates.map(t => (
                      <button key={t.id} onClick={() => setPreviewTemplate(t)} className="w-full text-left p-4 border-2 border-black rounded-xl hover:bg-[#ebca7a]/20 transition-all flex justify-between items-center group">
                        <div>
                          <h4 className="font-heading text-xs uppercase">{t.name}</h4>
                          <p className="text-[10px] font-bold text-gray-500 uppercase">{t.workoutIds.length} Sesiones</p>
                        </div>
                        <svg className="w-5 h-5 opacity-40 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7"></path></svg>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => { setShowTemplatePicker(false); setActiveTab('library'); }} className="w-full bg-black text-white p-4 rounded-xl font-heading text-[12px] uppercase tracking-widest">Gestionar Plantillas</button>
                </>
              )}
           </div>
        </div>
      )}
    </Layout>
  );
};

export default App;

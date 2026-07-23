
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { KETTLEBELL_CIRCUIT } from './constants';
import { AppState, CircuitCycle, WorkoutLog, Workout, CircuitTemplate } from './types';
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
import { observeAuth, logout as firebaseLogout, updateUserProfile } from './services/auth';
import { buildGreeting } from './services/greeting';
import {
  loadWorkouts, loadTemplates, loadCycles, seedGlobalBase,
  createWorkout, updateWorkout, deleteWorkout,
  saveTemplate, deleteTemplate,
  createCycle, updateCycle, saveLog,
} from './services/db';

const EMPTY_STATE: AppState = {
  currentUser: null, allUsers: [], library: [], templates: [], cycles: [], currentCycleIndex: -1,
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const loadedForUid = useRef<string | null>(null);

  // Sesión de Firebase → currentUser (con perfil de Firestore).
  useEffect(() => {
    const unsub = observeAuth((user) => {
      setState(prev => ({ ...prev, currentUser: user }));
      setAuthLoading(false);
      if (!user) {
        loadedForUid.current = null;
        setState(prev => ({ ...prev, library: [], templates: [], cycles: [] }));
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
        let [library, templates, cycles] = await Promise.all([
          loadWorkouts(uid), loadTemplates(uid), loadCycles(uid),
        ]);
        // Solo un admin siembra el contenido base GLOBAL (público) si falta.
        if (state.currentUser?.role === 'admin' && !library.some(w => w.isPublic)) {
          await seedGlobalBase(KETTLEBELL_CIRCUIT, uid);
          [library, templates] = await Promise.all([loadWorkouts(uid), loadTemplates(uid)]);
        }
        setState(prev => ({ ...prev, library, templates, cycles }));
      } catch (e) {
        console.error('[Bellforce] error cargando datos:', e);
      } finally {
        setDataLoading(false);
      }
    })();
  }, [state.currentUser?.id]);

  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'stats' | 'library' | 'settings'>('home');
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [selectedLog, setSelectedLog] = useState<WorkoutLog | null>(null);
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

  const activeWorkouts = useMemo(() => {
    if (!currentCycle) return [];
    return (currentCycle.workoutIds || []).map(id => {
      const base = state.library.find(w => w.id === id);
      if (!base) return null;
      return { ...base, weight: currentCycle.workoutWeights?.[id] || base.weight };
    }).filter(w => !!w) as Workout[];
  }, [currentCycle, state.library]);

  const handleTabChange = useCallback((tab: any) => {
    setActiveTab(tab);
    setSelectedWorkout(null);
    setSelectedLog(null);
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

  const handleUpdateProfile = useCallback(async (data: { name?: string; photoURL?: string }) => {
    const user = state.currentUser;
    if (!user) return;
    await updateUserProfile(user.id, data);
    setState(prev => prev.currentUser ? { ...prev, currentUser: { ...prev.currentUser, ...data } } : prev);
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

  // ---- Edición del circuito activo (persistiendo workoutIds) ----
  const setCurrentCycleIds = useCallback((newIds: string[]) => {
    if (!currentCycle) return;
    updateCycle(currentCycle.id, { workoutIds: newIds }).catch(e => console.error('updateCycle', e));
    setState(prev => ({ ...prev, cycles: prev.cycles.map(c => c.id === currentCycle.id ? { ...c, workoutIds: newIds } : c) }));
  }, [currentCycle]);

  const handleAddToCircuit = useCallback((workoutId: string) => {
    if (!currentCycle) return;
    setCurrentCycleIds([...(currentCycle.workoutIds || []), workoutId]);
  }, [currentCycle, setCurrentCycleIds]);

  const handleRemoveFromCircuit = useCallback((index: number) => {
    if (!currentCycle) return;
    setCurrentCycleIds((currentCycle.workoutIds || []).filter((_, i) => i !== index));
  }, [currentCycle, setCurrentCycleIds]);

  const handleReorderCircuit = useCallback((index: number, direction: 'up' | 'down') => {
    if (!currentCycle) return;
    const ids = [...(currentCycle.workoutIds || [])];
    const swap = direction === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= ids.length) return;
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
    setCurrentCycleIds(ids);
  }, [currentCycle, setCurrentCycleIds]);

  // ---- Ciclos ----
  const handleStartTemplate = async (template: CircuitTemplate) => {
    const user = state.currentUser;
    if (!user) return;
    const active = state.cycles.find(c => c.userId === user.id && c.status === 'active' && c.type !== 'standalone');
    if (active) updateCycle(active.id, { status: 'paused' }).catch(e => console.error('updateCycle', e));

    const draft: Omit<CircuitCycle, 'id'> = {
      userId: user.id, name: template.name, startDate: new Date().toISOString(),
      logs: [], status: 'active', isArchived: false,
      workoutIds: template.workoutIds, workoutWeights: {}, type: 'circuit',
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

    const draft: Omit<CircuitCycle, 'id'> = {
      userId: user.id, name: cycle.name, startDate: new Date().toISOString(),
      logs: [], status: 'active', isArchived: false,
      workoutIds: cycle.workoutIds, workoutWeights: cycle.workoutWeights, type: 'circuit',
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

  const handleViewHistoricalLog = (workout: Workout, log: WorkoutLog) => {
    setSelectedWorkout(workout);
    setSelectedLog(log);
    setActiveStandaloneLogDate(log.date);
    setIsStandaloneMode(true);
  };

  const handleCompleteWorkout = useCallback(async (log: WorkoutLog, updatedWeight?: string, updatedDescription?: string, isFinal: boolean = true) => {
    const user = state.currentUser;
    if (!user) return;

    // 1) Actualizar workout en la librería (peso/descripción)
    let newLibrary = state.library;
    if (updatedWeight !== undefined || updatedDescription !== undefined) {
      const base = state.library.find(w => w.id === log.workoutId);
      if (base) {
        const updated: Workout = {
          ...base,
          weight: updatedWeight !== undefined ? updatedWeight : base.weight,
          description: updatedDescription !== undefined ? updatedDescription : base.description,
        };
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

    // 4) Recalcular logs y campos del ciclo
    const existingLogs = targetCycle.logs || [];
    const logIdx = isStandaloneMode
      ? existingLogs.findIndex(l => l.date === log.date && l.workoutId === log.workoutId)
      : existingLogs.findIndex(l => l.workoutId === log.workoutId);
    const updatedLogs = (logIdx !== -1 ? existingLogs.map((l, i) => i === logIdx ? log : l) : [...existingLogs, log])
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const cyclePartial: Partial<CircuitCycle> = {};
    const newWeights = updatedWeight !== undefined
      ? { ...(targetCycle.workoutWeights || {}), [log.workoutId]: updatedWeight }
      : targetCycle.workoutWeights;
    if (updatedWeight !== undefined) cyclePartial.workoutWeights = newWeights;

    let newStatus = targetCycle.status;
    let newEndDate = targetCycle.endDate;
    if (!isStandaloneMode && isFinal) {
      const totalExpected = (targetCycle.workoutIds || []).length;
      if (updatedLogs.filter(l => l.completed).length >= totalExpected && totalExpected > 0) {
        newStatus = 'completed';
        newEndDate = new Date().toISOString();
        cyclePartial.status = newStatus;
        cyclePartial.endDate = newEndDate;
      }
    }
    if (Object.keys(cyclePartial).length) updateCycle(targetCycle.id, cyclePartial).catch(e => console.error('updateCycle', e));

    // 5) Estado local
    const updatedCycle: CircuitCycle = { ...targetCycle, logs: updatedLogs, workoutWeights: newWeights, status: newStatus, endDate: newEndDate };
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
      const latestWorkoutRef = state.library.find(w => w.id === selectedWorkout.id) || selectedWorkout;
      const log = selectedLog || currentCycle?.logs.find(l => l.workoutId === selectedWorkout.id && !l.completed);
      const prevLog = userCycles.flatMap(c => c.logs)
        .filter(l => l.workoutId === selectedWorkout.id && l.completed)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

      return (
        <WorkoutDetailView
          workout={latestWorkoutRef}
          currentLog={log}
          previousLog={prevLog}
          onBack={() => { setSelectedWorkout(null); setSelectedLog(null); setIsStandaloneMode(false); }}
          onSave={handleCompleteWorkout}
          onRetrain={() => { setSelectedLog(null); setActiveStandaloneLogDate(null); setIsStandaloneMode(true); }}
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
              completedCount={currentCycle?.logs.filter(l => l.completed).length || 0}
              totalWorkouts={currentCycle?.workoutIds?.length || 0}
              greeting={buildGreeting(state.currentUser.name, userCycles)}
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
          />
        );
      case 'history':
        return <HistoryView cycles={userCycles} workouts={state.library} onRetake={handleRestartCycle} onViewLog={handleViewHistoricalLog} />;
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
      case 'settings':
        return (
          <SettingsView
            user={state.currentUser}
            onLogout={handleLogout}
            onExport={handleExportData}
            onImport={handleImportData}
            onUpdateProfile={handleUpdateProfile}
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

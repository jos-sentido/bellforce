
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { KETTLEBELL_CIRCUIT } from './constants';
import { AppState, CircuitCycle, WorkoutLog, Workout, CircuitTemplate, User } from './types';
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
import { observeAuth, logout as firebaseLogout } from './services/auth';

const LOCAL_STORAGE_KEY = 'kb_bellforce_multi_v1';
const SESSION_KEY = 'bellforce_session_v1';

const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    const sessionUserStr = localStorage.getItem(SESSION_KEY);
    
    let initialState: AppState;
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const cycles = Array.isArray(parsed.cycles) ? parsed.cycles : [];
        const sanitizedCycles = cycles.map((c: any) => ({
          ...c,
          logs: Array.isArray(c.logs) ? c.logs : [],
          workoutIds: Array.isArray(c.workoutIds) ? c.workoutIds : [],
          workoutWeights: c.workoutWeights || {}
        }));

        initialState = {
          currentUser: null, // La sesión la maneja Firebase (observeAuth)
          allUsers: Array.isArray(parsed.allUsers) ? parsed.allUsers : [],
          library: Array.isArray(parsed.library) ? parsed.library : [],
          templates: Array.isArray(parsed.templates) ? parsed.templates : [],
          cycles: sanitizedCycles,
          currentCycleIndex: -1 
        };
      } catch (e) {
        initialState = { currentUser: null, allUsers: [], library: [], templates: [], cycles: [], currentCycleIndex: -1 };
      }
    } else {
      const adminId = 'bellforce_admin';
      const initialLibrary: Workout[] = KETTLEBELL_CIRCUIT.map(w => ({
        ...w,
        createdBy: adminId,
        isPublic: true
      }));

      const initialTemplate: CircuitTemplate = {
        id: 'template_original',
        name: "Fusion Circuit Original",
        workoutIds: initialLibrary.map(w => w.id),
        createdBy: adminId,
        isPublic: true
      };

      initialState = {
        currentUser: null,
        allUsers: [],
        library: initialLibrary,
        templates: [initialTemplate],
        cycles: [],
        currentCycleIndex: -1
      };
    }

    return initialState;
  });

  const [authLoading, setAuthLoading] = useState(true);

  // La sesión ahora la maneja Firebase Auth. Escuchamos cambios de sesión y
  // sincronizamos currentUser (con su perfil de Firestore).
  useEffect(() => {
    const unsub = observeAuth((user) => {
      setState(prev => ({ ...prev, currentUser: user }));
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'stats' | 'library' | 'settings'>('home');
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [selectedLog, setSelectedLog] = useState<WorkoutLog | null>(null);
  const [activeStandaloneLogDate, setActiveStandaloneLogDate] = useState<string | null>(null); 
  
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [isStandaloneMode, setIsStandaloneMode] = useState(false);
  const [isPickingStandalone, setIsPickingStandalone] = useState(false);
  const [isViewingActiveCircuit, setIsViewingActiveCircuit] = useState(false);
  const [isManagingCircuit, setIsManagingCircuit] = useState(false);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const userCycles = useMemo(() => {
    if (!state.currentUser) return [];
    return (state.cycles || []).filter(c => c.userId === state.currentUser?.id);
  }, [state.cycles, state.currentUser]);

  const currentCycle = useMemo(() => {
    const active = userCycles.find(c => c.status === 'active' && c.type !== 'standalone' && !c.isArchived);
    if (active) return active;
    return userCycles.filter(c => c.type !== 'standalone' && !c.isArchived).sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0] || null;
  }, [userCycles]);

  const currentCycleIndex = useMemo(() => {
    return userCycles.findIndex(c => c.id === currentCycle?.id);
  }, [userCycles, currentCycle]);

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
  }, []);

  const handleLogout = useCallback(async () => {
    await firebaseLogout(); // observeAuth pondrá currentUser en null
    setActiveTab('home');
    setSelectedWorkout(null);
    setSelectedLog(null);
    setIsStandaloneMode(false);
    setIsPickingStandalone(false);
    setIsViewingActiveCircuit(false);
    setIsManagingCircuit(false);
  }, []);

  const handleExportData = useCallback(() => {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bellforce-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const handleImportData = useCallback((jsonText: string): boolean => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed || typeof parsed !== 'object') return false;
      setState(prev => ({
        ...prev,
        allUsers: Array.isArray(parsed.allUsers) ? parsed.allUsers : prev.allUsers,
        library: Array.isArray(parsed.library) ? parsed.library : prev.library,
        templates: Array.isArray(parsed.templates) ? parsed.templates : prev.templates,
        cycles: Array.isArray(parsed.cycles) ? parsed.cycles : prev.cycles,
      }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const updateCurrentCycle = useCallback((updater: (c: CircuitCycle) => CircuitCycle) => {
    if (!currentCycle) return;
    setState(prev => ({
      ...prev,
      cycles: prev.cycles.map(c => c.id === currentCycle.id ? updater(c) : c)
    }));
  }, [currentCycle]);

  const handleAddToCircuit = useCallback((workoutId: string) => {
    updateCurrentCycle(c => ({ ...c, workoutIds: [...(c.workoutIds || []), workoutId] }));
  }, [updateCurrentCycle]);

  const handleRemoveFromCircuit = useCallback((index: number) => {
    updateCurrentCycle(c => ({ ...c, workoutIds: (c.workoutIds || []).filter((_, i) => i !== index) }));
  }, [updateCurrentCycle]);

  const handleReorderCircuit = useCallback((index: number, direction: 'up' | 'down') => {
    updateCurrentCycle(c => {
      const ids = [...(c.workoutIds || [])];
      const swap = direction === 'up' ? index - 1 : index + 1;
      if (swap < 0 || swap >= ids.length) return c;
      [ids[index], ids[swap]] = [ids[swap], ids[index]];
      return { ...c, workoutIds: ids };
    });
  }, [updateCurrentCycle]);

  const handleStartTemplate = (template: CircuitTemplate) => {
    if (!state.currentUser) return;
    
    const newCycle: CircuitCycle = {
      id: generateId(),
      userId: state.currentUser.id,
      name: template.name,
      startDate: new Date().toISOString(),
      logs: [],
      status: 'active',
      isArchived: false,
      workoutIds: template.workoutIds,
      workoutWeights: {},
      type: 'circuit'
    };

    setState(prev => ({
      ...prev,
      cycles: prev.cycles.map(c => 
        (c.userId === prev.currentUser?.id && c.status === 'active' && c.type !== 'standalone') 
        ? { ...c, status: 'paused' as const } 
        : c
      ).concat(newCycle)
    }));
    
    setShowTemplatePicker(false);
    setIsViewingActiveCircuit(true);
    setActiveTab('home');
  };

  const handleRestartCycle = (cycle: CircuitCycle) => {
    if (!state.currentUser) return;

    const newCycle: CircuitCycle = {
      id: generateId(),
      userId: state.currentUser.id,
      name: cycle.name,
      startDate: new Date().toISOString(),
      logs: [],
      status: 'active',
      isArchived: false,
      workoutIds: cycle.workoutIds,
      workoutWeights: cycle.workoutWeights, 
      type: 'circuit'
    };

    setState(prev => ({
      ...prev,
      cycles: prev.cycles.map(c => {
        if (c.id === cycle.id) return { ...c, status: 'completed' as const, isArchived: true };
        if (c.userId === prev.currentUser?.id && c.status === 'active' && c.type !== 'standalone') return { ...c, status: 'paused' as const };
        return c;
      }).concat(newCycle)
    }));
    
    setIsViewingActiveCircuit(true);
    setActiveTab('home');
  };

  const handleViewHistoricalLog = (workout: Workout, log: WorkoutLog) => {
    setSelectedWorkout(workout);
    setSelectedLog(log);
    setActiveStandaloneLogDate(log.date); 
    setIsStandaloneMode(true);
  };

  const handleCompleteWorkout = useCallback((log: WorkoutLog, updatedWeight?: string, updatedDescription?: string, isFinal: boolean = true) => {
    if (!state.currentUser) return;
    
    setState(prevState => {
      let updatedCycles = [...prevState.cycles];
      let updatedLibrary = [...prevState.library];
      let targetCycleId: string;
      
      if (updatedWeight !== undefined || updatedDescription !== undefined) {
        const libIdx = updatedLibrary.findIndex(w => w.id === log.workoutId);
        if (libIdx !== -1) {
          updatedLibrary[libIdx] = {
            ...updatedLibrary[libIdx],
            weight: updatedWeight !== undefined ? updatedWeight : updatedLibrary[libIdx].weight,
            description: updatedDescription !== undefined ? updatedDescription : updatedLibrary[libIdx].description
          };
        }
      }

      if (isStandaloneMode) {
        let standalone = updatedCycles.find(c => c.userId === prevState.currentUser!.id && c.type === 'standalone');
        if (!standalone) {
            standalone = { id: `standalone_${prevState.currentUser!.id}`, userId: prevState.currentUser!.id, name: "Entrenamientos Libres", startDate: new Date().toISOString(), logs: [], status: 'active', isArchived: false, workoutIds: [], workoutWeights: {}, type: 'standalone' };
            updatedCycles.push(standalone);
        }
        targetCycleId = standalone.id;
      } else {
        if (!currentCycle) return prevState;
        targetCycleId = currentCycle.id;
      }

      const cycleIdx = updatedCycles.findIndex(c => c.id === targetCycleId);
      if (cycleIdx === -1) return prevState;

      const cycleToUpdate = { ...updatedCycles[cycleIdx] };
      const updatedLogs = [...(cycleToUpdate.logs || [])];
      
      const logIdx = isStandaloneMode 
        ? updatedLogs.findIndex(l => l.date === log.date && l.workoutId === log.workoutId)
        : updatedLogs.findIndex(l => l.workoutId === log.workoutId);

      if (logIdx !== -1) updatedLogs[logIdx] = log; else updatedLogs.push(log);

      cycleToUpdate.logs = updatedLogs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      if (updatedWeight !== undefined) {
        cycleToUpdate.workoutWeights = {
          ...(cycleToUpdate.workoutWeights || {}),
          [log.workoutId]: updatedWeight
        };
      }

      if (!isStandaloneMode) {
          const totalExpected = (cycleToUpdate.workoutIds || []).length;
          if (isFinal && updatedLogs.filter(l => l.completed).length >= totalExpected) {
            cycleToUpdate.endDate = new Date().toISOString();
            cycleToUpdate.status = 'completed';
          }
      }

      updatedCycles[cycleIdx] = cycleToUpdate;

      return { 
        ...prevState, 
        cycles: updatedCycles,
        library: updatedLibrary
      };
    });

    if (isFinal) {
      setSelectedWorkout(null);
      setSelectedLog(null);
      setActiveStandaloneLogDate(null);
      setIsStandaloneMode(false);
    }
  }, [state.currentUser, currentCycle, isStandaloneMode, activeStandaloneLogDate]);

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
            onAddToLibrary={(w) => {
              const newW = { ...w, id: generateId() };
              setState(prev => ({ ...prev, library: [...prev.library, newW] }));
              return newW;
            }}
            onUpdateWorkout={(w) => setState(prev => ({ ...prev, library: prev.library.map(item => item.id === w.id ? w : item) }))}
            onDeleteWorkout={(id) => setState(prev => ({ ...prev, library: prev.library.filter(w => w.id !== id) }))}
            onSaveTemplate={(t) => setState(prev => {
               const idx = prev.templates.findIndex(item => item.id === t.id);
               return { ...prev, templates: idx !== -1 ? prev.templates.map(item => item.id === t.id ? t : item) : [...prev.templates, t] };
            })}
            onDeleteTemplate={(id) => setState(prev => ({ ...prev, templates: prev.templates.filter(t => t.id !== id) }))}
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
      onSwitchCycle={(idx) => {
        const target = userCycles[idx];
        if (target) {
          setState(prev => ({
            ...prev,
            cycles: prev.cycles.map(c => {
              if (c.id === target.id) return { ...c, status: 'active' as const };
              if (c.userId === prev.currentUser?.id && c.status === 'active' && c.type !== 'standalone') return { ...c, status: 'paused' as const };
              return c;
            })
          }));
          setIsViewingActiveCircuit(true);
          setActiveTab('home');
        }
      }}
      onArchiveCycle={(id) => setState(prev => ({ ...prev, cycles: prev.cycles.map(c => c.id === id ? { ...c, isArchived: true, status: c.status === 'active' ? 'paused' : c.status } : c) }))}
      onUnarchiveCycle={(id) => setState(prev => ({ ...prev, cycles: prev.cycles.map(c => c.id === id ? { ...c, isArchived: false } : c) }))}
      onCreateNewCycle={() => setShowTemplatePicker(true)}
      onViewLog={handleViewHistoricalLog}
      isUserLoggedIn={!!state.currentUser}
    >
      {renderContent()}
      
      {showTemplatePicker && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
           <div className="bg-white neo-brutalism p-6 rounded-2xl w-full max-w-sm border-black">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-heading text-xl uppercase">Nueva Programación</h3>
                <button onClick={() => setShowTemplatePicker(false)} className="text-gray-500 hover:text-black">
                   <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
              <div className="space-y-3 mb-6">
                {state.templates.map(t => (
                  <button key={t.id} onClick={() => handleStartTemplate(t)} className="w-full text-left p-4 border-2 border-black rounded-xl hover:bg-[#ebca7a]/20 transition-all flex justify-between items-center group">
                    <div>
                      <h4 className="font-heading text-xs uppercase">{t.name}</h4>
                      <p className="text-[8px] font-bold text-gray-500 uppercase">{t.workoutIds.length} Sesiones</p>
                    </div>
                    <svg className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7"></path></svg>
                  </button>
                ))}
              </div>
              <button onClick={() => { setShowTemplatePicker(false); setActiveTab('library'); }} className="w-full bg-black text-white p-4 rounded-xl font-heading text-[10px] uppercase tracking-widest">Gestionar Plantillas</button>
           </div>
        </div>
      )}
    </Layout>
  );
};

export default App;

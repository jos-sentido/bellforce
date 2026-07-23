
import React, { useState } from 'react';
import { CircuitCycle, Workout, WorkoutLog } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'home' | 'history' | 'stats' | 'library' | 'settings';
  setActiveTab: (tab: 'home' | 'history' | 'stats' | 'library' | 'settings') => void;
  cycles: CircuitCycle[];
  library: Workout[]; 
  currentCycleIndex: number;
  onSwitchCycle: (index: number) => void;
  onCreateNewCycle: () => void;
  onArchiveCycle: (id: string) => void;
  onUnarchiveCycle: (id: string) => void;
  onViewLog?: (workout: Workout, log: WorkoutLog) => void;
  isUserLoggedIn?: boolean; 
}

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeTab, 
  setActiveTab, 
  cycles = [], 
  library = [],
  currentCycleIndex, 
  onSwitchCycle,
  onArchiveCycle,
  onUnarchiveCycle,
  onCreateNewCycle,
  onViewLog,
  isUserLoggedIn = false
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const handleSelectCycle = (index: number) => {
    onSwitchCycle(index);
    setIsMenuOpen(false);
  };

  const handleNavClick = (tab: 'home' | 'history' | 'stats' | 'library' | 'settings') => {
    setActiveTab(tab);
    setIsNavOpen(false);
  };

  const circuitCycles = (cycles || []).filter(c => c.type !== 'standalone');
  const visibleCycles = circuitCycles.filter(c => !c.isArchived);
  const archivedCycles = circuitCycles.filter(c => c.isArchived);

  const KettlebellLogo = ({ 
    className = "w-10 h-10", 
    kettlebellColor = "white", 
    boltColor = "#ebca7a" 
  }: { 
    className?: string, 
    kettlebellColor?: string, 
    boltColor?: string 
  }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 8V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V8H14V7C14 5.89543 13.1046 5 12 5C10.8954 5 10 5.89543 10 7V8H7Z" fill={kettlebellColor}/>
      <path d="M12 22C16.4183 22 20 18.4183 20 14C20 9.58172 16.4183 7 12 7C7.58172 7 4 9.58172 4 14C4 18.4183 7.58172 22 12 22Z" fill={kettlebellColor}/>
      <path d="M13 11L10 14.5H12.2L11.5 18.5L15 14.5H12.8L14.2 11Z" fill={boltColor}/>
    </svg>
  );

  const navItems = [
    { id: 'home', label: 'Entrenar', icon: <KettlebellLogo className="w-5 h-5" kettlebellColor="white" boltColor="#ebca7a" /> },
    { id: 'history', label: 'Historial', icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z"/>
      </svg>
    )},
    { id: 'stats', label: 'Stats', icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
      </svg>
    )},
    { id: 'library', label: 'Database', icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M4 14h16v-2H4v2zm0 4h16v-2H4v2zM4 6v2h16V6H4z"/>
      </svg>
    )},
    { id: 'settings', label: 'Ajustes', icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
      </svg>
    )}
  ];

  return (
    <div className="min-h-screen pb-32 max-w-md mx-auto relative bg-[#fdf6e3]">
      {isNavOpen && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-md z-[900] animate-in fade-in duration-300" 
          onClick={() => setIsNavOpen(false)} 
        />
      )}

      <header className="p-6 flex justify-between items-center bg-[#fdf6e3] sticky top-0 z-40">
        <div className="flex items-center gap-2">
           <KettlebellLogo className="w-10 h-10" kettlebellColor="black" boltColor="#ebca7a" />
           <h1 className="font-heading text-2xl tracking-tighter text-black">BELLFORCE</h1>
        </div>
        {isUserLoggedIn && (
          <button onClick={() => setIsMenuOpen(true)} className="neo-brutalism bg-[#ebca7a] p-2 rounded-full active:scale-90 border-black shadow-[2px_2px_0px_#000] flex items-center justify-center">
            <svg className="w-6 h-6 text-black" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z"/>
            </svg>
          </button>
        )}
      </header>

      {isMenuOpen && isUserLoggedIn && (
        <div className="fixed inset-0 z-[2000] flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)}/>
          <div className="relative w-80 h-full bg-[#fdf6e3] border-l-4 border-black p-6 flex flex-col shadow-2xl animate-in slide-in-from-right">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-heading text-xl">{showArchived ? 'ARCHIVADOS' : 'CIRCUITOS'}</h3>
              <button onClick={() => setIsMenuOpen(false)} className="text-gray-500"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-6 pr-1 scrollbar-thin scrollbar-thumb-black">
              <div className="space-y-3">
                {(showArchived ? archivedCycles : visibleCycles).slice().reverse().map((cycle) => {
                  const actualIdx = (cycles || []).findIndex(c => c.id === cycle.id);
                  const isActive = cycle.status === 'active';
                  const isCompleted = cycle.status === 'completed';
                  const completedLogs = Array.isArray(cycle.logs) ? cycle.logs.filter(l => l.completed) : [];
                  const totalWorkouts = Array.isArray(cycle.workoutIds) ? cycle.workoutIds.length : 15;
                  
                  return (
                    <div key={cycle.id} className="relative">
                      <button onClick={() => handleSelectCycle(actualIdx)} className={`w-full text-left p-4 rounded-xl neo-brutalism transition-all border-black ${isActive ? 'bg-black text-white' : 'bg-white text-black opacity-80'}`}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-heading text-[12px] truncate pr-2">{cycle.name}</span>
                          <span className={`shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${isActive ? 'bg-[#ebca7a] text-black border-black animate-pulse' : isCompleted ? 'bg-green-100 text-green-800 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                            {isActive ? 'Activo' : isCompleted ? 'Completado' : 'Pausado'}
                          </span>
                        </div>
                        <p className={`text-[10px] font-bold uppercase ${isActive ? 'text-gray-400' : 'text-gray-500 opacity-60'}`}>Inicio: {new Date(cycle.startDate).toLocaleDateString()}</p>
                        <div className="flex justify-end mt-1 font-heading text-xs">{completedLogs.length}/{totalWorkouts}</div>
                      </button>
                      {!isActive && (
                        <button onClick={(e) => {e.stopPropagation(); cycle.isArchived ? onUnarchiveCycle(cycle.id) : onArchiveCycle(cycle.id);}} className="absolute -top-1 -right-1 w-6 h-6 flex items-center justify-center bg-white border-2 border-black rounded-full text-[12px] shadow-[1px_1px_0px_#000] active:translate-y-0.5 active:shadow-none">
                          {cycle.isArchived ? '📁' : '📦'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              
              <div className="pt-4 border-t-2 border-black/5">
                <button onClick={() => {setShowArchived(!showArchived);}} className="w-full text-center text-[12px] font-black uppercase underline text-gray-500 mb-4">{showArchived ? 'Ver Activos' : 'Ver Archivados'}</button>
                <button onClick={() => {onCreateNewCycle(); setIsMenuOpen(false);}} className="w-full bg-black text-white p-4 rounded-xl font-heading text-xs border-2 border-black active:translate-y-1 shadow-[4px_4px_0px_#ebca7a]">+ NUEVO CIRCUITO</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="px-6">
        {children}
      </main>

      {isUserLoggedIn && (
        <>
          <nav className={`fixed bottom-0 left-0 right-0 bg-white border-t-4 border-black p-4 z-[1000] flex justify-around items-center transition-transform duration-300 ${isNavOpen ? 'translate-y-0' : 'translate-y-[calc(100%-10px)]'}`}>
            <div className="absolute -top-16 left-6">
               <button 
                onClick={() => setIsNavOpen(!isNavOpen)}
                className="w-14 h-14 neo-brutalism bg-black text-white rounded-full flex items-center justify-center shadow-[4px_4px_0px_#ebca7a] active:scale-95 transition-all"
               >
                 <KettlebellLogo className={`w-8 h-8 transition-transform duration-500 ${isNavOpen ? 'rotate-180' : ''}`} kettlebellColor="white" boltColor="#ebca7a" />
               </button>
               <p className="text-center font-heading text-[10px] mt-1 text-black bg-[#ebca7a] px-1 rounded border border-black uppercase font-black">Menu</p>
            </div>

            {navItems.map((item) => (
              <button 
                key={item.id} 
                onClick={() => handleNavClick(item.id as any)}
                className={`flex flex-col items-center gap-1 transition-all ${activeTab === item.id ? 'text-black scale-110' : 'text-gray-400 opacity-60'}`}
              >
                <div className={`p-2 rounded-xl border-2 transition-all ${activeTab === item.id ? 'bg-[#ebca7a] border-black shadow-[2px_2px_0px_#000]' : 'bg-transparent border-transparent'}`}>
                   {item.icon}
                </div>
                <span className="text-[11px] font-black uppercase tracking-tighter">{item.label}</span>
              </button>
            ))}
          </nav>
          {!isNavOpen && <div className="fixed bottom-0 left-0 right-0 h-2 bg-black/5 pointer-events-none" />}
        </>
      )}
    </div>
  );
};

export default Layout;

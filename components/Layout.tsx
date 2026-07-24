
import React, { useState } from 'react';
import { CircuitCycle, Workout, WorkoutLog } from '../types';
import { ArchiveIcon } from './icons';

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

  // Entrenamientos individuales (standalone) completados, más recientes primero.
  const standaloneCycle = (cycles || []).find(c => c.type === 'standalone');
  const individualLogs = standaloneCycle
    ? [...(Array.isArray(standaloneCycle.logs) ? standaloneCycle.logs : [])]
        .filter(l => l.completed)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : [];

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
    <div className="min-h-screen pb-10 max-w-md mx-auto relative bg-[#fdf6e3]">
      <header className="p-6 flex justify-between items-center bg-[#fdf6e3] sticky top-0 z-40">
        <div className="flex items-center gap-2">
           <KettlebellLogo className="w-10 h-10" kettlebellColor="black" boltColor="#ebca7a" />
           <h1 className="font-heading text-2xl tracking-tighter text-black">BELLFORCE</h1>
        </div>
        {isUserLoggedIn && (
          <button
            onClick={() => setIsNavOpen(true)}
            aria-label="Abrir menú"
            className="w-11 h-11 neo-brutalism bg-[#ebca7a] rounded-full active:scale-90 border-black shadow-[3px_3px_0px_#000] flex items-center justify-center"
          >
            <KettlebellLogo className="w-7 h-7" kettlebellColor="black" boltColor="#ebca7a" />
          </button>
        )}
      </header>


      <main className="px-6">
        {children}
      </main>

      {isUserLoggedIn && (
        <>
          {/* Menú de navegación FULL SCREEN (fondo blur uniforme) */}
          {isNavOpen && (
            <div className="fixed inset-0 z-[1400] bg-black/10 backdrop-blur-2xl flex flex-col animate-in fade-in duration-200">
             <div className="w-full max-w-md mx-auto flex flex-col h-full">
              <div className="flex items-center justify-between p-6">
                <div className="flex items-center gap-2">
                  <KettlebellLogo className="w-8 h-8" kettlebellColor="black" boltColor="#ebca7a" />
                  <span className="font-heading text-xl tracking-tighter">BELLFORCE</span>
                </div>
                <button onClick={() => setIsNavOpen(false)} className="w-11 h-11 neo-brutalism bg-white border-black rounded-full flex items-center justify-center active:scale-90">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
              <div className="flex-1 flex flex-col justify-center gap-3 px-6 pb-28">
                {navItems.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id as any)}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl neo-brutalism border-black transition-all active:translate-y-0.5 active:shadow-none ${isActive ? 'bg-[#ebca7a]' : 'bg-white'}`}
                    >
                      <span className="w-11 h-11 flex items-center justify-center bg-black text-white rounded-xl shrink-0">{item.icon}</span>
                      <span className="font-heading text-xl uppercase tracking-tight">{item.label}</span>
                      {isActive && <span className="ml-auto text-[10px] font-black uppercase bg-black text-white px-2 py-1 rounded-full">Aquí</span>}
                    </button>
                  );
                })}
              </div>
             </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Layout;

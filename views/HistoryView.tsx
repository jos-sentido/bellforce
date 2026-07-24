
import React, { useMemo, useState } from 'react';
import { CircuitCycle, Workout, WorkoutLog } from '../types';
import { CameraIcon } from '../components/icons';

interface HistoryViewProps {
  cycles: CircuitCycle[];
  workouts: Workout[];
  onRetake: (cycle: CircuitCycle) => void;
  onViewLog?: (workout: Workout, log: WorkoutLog) => void;
}

type LogItem = { kind: 'log'; date: string; log: WorkoutLog; cycle: CircuitCycle; workout?: Workout; isStandalone: boolean };
type DoneItem = { kind: 'circuitDone'; date: string; cycle: CircuitCycle; count: number };
type Item = LogItem | DoneItem;

const HistoryView: React.FC<HistoryViewProps> = ({ cycles = [], workouts = [], onRetake, onViewLog }) => {
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<'all' | '7' | '30'>('all');
  const [source, setSource] = useState<'all' | 'circuit' | 'standalone'>('all');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const workoutTypes = useMemo(() => {
    const t = new Set<string>();
    (cycles || []).forEach(c => (c.logs || []).forEach(l => {
      if (l.completed) { const w = workouts.find(x => x.id === l.workoutId); if (w?.type) t.add(w.type); }
    }));
    return Array.from(t);
  }, [cycles, workouts]);

  const items: Item[] = useMemo(() => {
    const arr: Item[] = [];
    (cycles || []).forEach(cycle => {
      const logs = (Array.isArray(cycle.logs) ? cycle.logs : []).filter(l => l.completed);
      logs.forEach(log => arr.push({
        kind: 'log', date: log.date, log, cycle,
        workout: workouts.find(w => w.id === log.workoutId),
        isStandalone: cycle.type === 'standalone',
      }));
      if (cycle.status === 'completed' && cycle.type !== 'standalone') {
        const date = cycle.endDate || (logs.length ? logs[logs.length - 1].date : cycle.startDate);
        arr.push({ kind: 'circuitDone', date, cycle, count: logs.length });
      }
    });
    return arr.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [cycles, workouts]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoff = range === '7' ? now - 7 * 86400000 : range === '30' ? now - 30 * 86400000 : 0;
    return items.filter(it => {
      if (new Date(it.date).getTime() < cutoff) return false;
      if (it.kind === 'circuitDone') {
        if (source === 'standalone') return false;
        if (typeFilter) return false; // los circuitos no filtran por tipo de workout
        if (search && !it.cycle.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }
      if (source === 'circuit' && it.isStandalone) return false;
      if (source === 'standalone' && !it.isStandalone) return false;
      if (typeFilter && it.workout?.type !== typeFilter) return false;
      if (search && !(it.workout?.name || '').toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [items, range, source, typeFilter, search]);

  const groups = useMemo(() => {
    const g: { day: string; label: string; entries: Item[] }[] = [];
    filtered.forEach(it => {
      const d = new Date(it.date);
      const day = d.toDateString();
      let grp = g.find(x => x.day === day);
      if (!grp) { grp = { day, label: d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }), entries: [] }; g.push(grp); }
      grp.entries.push(it);
    });
    return g;
  }, [filtered]);

  const totalSessions = items.filter(i => i.kind === 'log').length;

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full border-2 border-black text-[10px] font-black uppercase whitespace-nowrap transition-colors ${active ? 'bg-black text-white' : 'bg-white text-black'}`;
  const chipY = (active: boolean) =>
    `px-3 py-1.5 rounded-full border-2 border-black text-[10px] font-black uppercase whitespace-nowrap transition-colors ${active ? 'bg-[#ebca7a] text-black' : 'bg-white text-black'}`;

  return (
    <div className="py-4 text-black animate-in fade-in duration-500">
      <header className="mb-4">
        <h2 className="font-heading text-3xl uppercase leading-none">Historial</h2>
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mt-1">
          {totalSessions} {totalSessions === 1 ? 'sesión' : 'sesiones'} en total
        </p>
      </header>

      {/* Buscador + filtros */}
      <input
        type="text"
        placeholder="Buscar workout o circuito..."
        className="w-full neo-brutalism p-3.5 rounded-xl text-sm mb-3 bg-white text-black focus:outline-none border-black placeholder-gray-400"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div className="space-y-2 mb-5">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {([['all', 'Todo'], ['7', '7 días'], ['30', '30 días']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setRange(v)} className={chip(range === v)}>{l}</button>
          ))}
          <span className="w-px bg-black/10 mx-1" />
          {([['all', 'Todos'], ['circuit', 'Circuito'], ['standalone', 'Libre']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setSource(v)} className={chip(source === v)}>{l}</button>
          ))}
        </div>
        {workoutTypes.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button onClick={() => setTypeFilter(null)} className={chipY(!typeFilter)}>Todo tipo</button>
            {workoutTypes.map(t => (
              <button key={t} onClick={() => setTypeFilter(t)} className={chipY(typeFilter === t)}>{t}</button>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 neo-brutalism bg-white/50 rounded-2xl border-dashed border-black/20">
          <p className="font-bold uppercase text-[11px] text-gray-400 tracking-widest">
            {totalSessions === 0 ? 'Aún no hay entrenamientos completados' : 'Sin resultados con estos filtros'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <section key={group.day}>
              <div className="flex items-center gap-2 mb-3">
                <span className="bg-black text-white text-[10px] font-black uppercase px-3 py-1 rounded-full tracking-wider">{group.label}</span>
                <div className="flex-1 h-0.5 bg-black/10" />
              </div>
              <div className="relative pl-6 space-y-3 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-0.5 before:bg-black/10">
                {group.entries.map((item, idx) => {
                  if (item.kind === 'circuitDone') {
                    return (
                      <div key={`done-${item.cycle.id}-${idx}`} className="relative">
                        <div className="absolute -left-6 top-4 w-4 h-4 rounded-full border-2 border-black z-10 bg-[#77b074]" />
                        <div className="neo-brutalism bg-[#77b074] text-white rounded-xl border-black p-4 shadow-[3px_3px_0px_#000]">
                          <div className="flex justify-between items-start gap-2 mb-1">
                            <span className="text-[10px] font-black uppercase tracking-wider">Circuito completado</span>
                          </div>
                          <h4 className="font-heading text-base leading-tight mb-2">{item.cycle.name}</h4>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold">{item.count} sesiones</span>
                            <button onClick={() => onRetake(item.cycle)} className="bg-black text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-lg border-2 border-black shadow-[2px_2px_0px_#ebca7a] active:translate-y-0.5 active:shadow-none">Retomar</button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  const name = item.workout?.name || 'Workout';
                  const hasPhotos = (item.log.statsImages && item.log.statsImages.length > 0) || (item.log.sessionMedia && item.log.sessionMedia.length > 0);
                  const hasAI = !!item.log.aiAnalysisText;
                  return (
                    <div key={`${item.cycle.id}-${item.log.workoutId}-${idx}`} className="relative">
                      <div className={`absolute -left-6 top-4 w-4 h-4 rounded-full border-2 border-black z-10 ${item.isStandalone ? 'bg-[#ebca7a]' : 'bg-black'}`} />
                      <button onClick={() => item.workout && onViewLog?.(item.workout, item.log)} className="w-full text-left neo-brutalism bg-white rounded-xl border-black p-4 active:translate-y-0.5 active:shadow-none hover:bg-gray-50 transition-colors">
                        <div className="flex justify-between items-start gap-2 mb-1.5">
                          <h4 className="font-heading text-sm leading-tight">{name}</h4>
                          <span className="text-[10px] font-black text-gray-400 shrink-0">{item.log.time}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border tracking-wide ${item.isStandalone ? 'bg-[#ebca7a]/40 text-black border-black' : 'bg-black text-white border-black'}`}>
                            {item.isStandalone ? 'Entreno libre' : item.cycle.name}
                          </span>
                          {hasPhotos && <span className="text-[9px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded border border-gray-200 font-black uppercase inline-flex items-center gap-1"><CameraIcon className="w-3 h-3" /> Media</span>}
                          {hasAI && <span className="text-[9px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded border border-blue-200 font-black uppercase">IA</span>}
                        </div>
                        {item.log.comments && <p className="text-[11px] italic text-gray-500 mt-2 line-clamp-1">"{item.log.comments}"</p>}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default HistoryView;

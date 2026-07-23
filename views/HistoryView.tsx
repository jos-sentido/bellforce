
import React from 'react';
import { CircuitCycle, Workout, WorkoutLog } from '../types';
import { CameraIcon } from '../components/icons';

interface HistoryViewProps {
  cycles: CircuitCycle[];
  workouts: Workout[];
  onRetake: (cycle: CircuitCycle) => void;
  onViewLog?: (workout: Workout, log: WorkoutLog) => void;
}

interface TimelineItem {
  log: WorkoutLog;
  cycle: CircuitCycle;
  workout: Workout | undefined;
  isStandalone: boolean;
}

const HistoryView: React.FC<HistoryViewProps> = ({ cycles = [], workouts = [], onViewLog }) => {
  // Aplana TODOS los logs completados (circuito + individuales) a una línea de
  // tiempo, ordenada de más reciente a más antiguo.
  const items: TimelineItem[] = (cycles || [])
    .flatMap(cycle => (Array.isArray(cycle.logs) ? cycle.logs : [])
      .filter(l => l.completed)
      .map(log => ({
        log,
        cycle,
        workout: workouts.find(w => w.id === log.workoutId),
        isStandalone: cycle.type === 'standalone',
      })))
    .sort((a, b) => new Date(b.log.date).getTime() - new Date(a.log.date).getTime());

  // Agrupa por día para los encabezados de la timeline.
  const groups: { day: string; label: string; entries: TimelineItem[] }[] = [];
  items.forEach(item => {
    const d = new Date(item.log.date);
    const day = d.toDateString();
    let g = groups.find(x => x.day === day);
    if (!g) {
      g = { day, label: d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }), entries: [] };
      groups.push(g);
    }
    g.entries.push(item);
  });

  const totalSessions = items.length;

  return (
    <div className="py-4 text-black animate-in fade-in duration-500">
      <header className="mb-6">
        <h2 className="font-heading text-3xl uppercase leading-none">Historial</h2>
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mt-1">
          {totalSessions} {totalSessions === 1 ? 'sesión registrada' : 'sesiones registradas'}
        </p>
      </header>

      {totalSessions === 0 ? (
        <div className="text-center py-16 neo-brutalism bg-white/50 rounded-2xl border-dashed border-black/20">
          <p className="font-bold uppercase text-[11px] text-gray-400 tracking-widest">Aún no hay entrenamientos completados</p>
          <p className="text-[10px] text-gray-400 mt-2">Termina tu primera sesión y aparecerá aquí.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <section key={group.day}>
              {/* Encabezado de día */}
              <div className="flex items-center gap-2 mb-3">
                <span className="bg-black text-white text-[10px] font-black uppercase px-3 py-1 rounded-full tracking-wider">
                  {group.label}
                </span>
                <div className="flex-1 h-0.5 bg-black/10" />
              </div>

              {/* Entradas del día, con riel de timeline */}
              <div className="relative pl-6 space-y-3 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-0.5 before:bg-black/10">
                {group.entries.map((item, idx) => {
                  const name = item.workout?.name || 'Workout';
                  const hasPhotos = (item.log.statsImages && item.log.statsImages.length > 0) ||
                    (item.log.sessionMedia && item.log.sessionMedia.length > 0);
                  const hasAI = !!item.log.aiAnalysisText;

                  return (
                    <div key={`${item.cycle.id}-${item.log.workoutId}-${idx}`} className="relative">
                      {/* Punto del riel: color según tipo */}
                      <div
                        className={`absolute -left-6 top-4 w-4 h-4 rounded-full border-2 border-black z-10 ${
                          item.isStandalone ? 'bg-[#ebca7a]' : 'bg-black'
                        }`}
                      />
                      <button
                        onClick={() => item.workout && onViewLog?.(item.workout, item.log)}
                        className="w-full text-left neo-brutalism bg-white rounded-xl border-black p-4 active:translate-y-0.5 active:shadow-none hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex justify-between items-start gap-2 mb-1.5">
                          <h4 className="font-heading text-sm leading-tight">{name}</h4>
                          <span className="text-[10px] font-black text-gray-400 shrink-0">{item.log.time}</span>
                        </div>

                        {/* Etiqueta de origen: circuito vs individual */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border tracking-wide ${
                              item.isStandalone
                                ? 'bg-[#ebca7a]/40 text-black border-black'
                                : 'bg-black text-white border-black'
                            }`}
                          >
                            {item.isStandalone ? 'Entreno libre' : item.cycle.name}
                          </span>
                          {hasPhotos && (
                            <span className="text-[9px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded border border-gray-200 font-black uppercase inline-flex items-center gap-1">
                              <CameraIcon className="w-3 h-3" /> Media
                            </span>
                          )}
                          {hasAI && (
                            <span className="text-[9px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded border border-blue-200 font-black uppercase">IA</span>
                          )}
                        </div>

                        {item.log.comments && (
                          <p className="text-[11px] italic text-gray-500 mt-2 line-clamp-1">"{item.log.comments}"</p>
                        )}
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

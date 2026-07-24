
import React, { useState, useMemo, useEffect } from 'react';
import { CircuitCycle, Workout, WorkoutLog } from '../types';
import { analyzeGlobalPerformance, analyzeComparativePerformance } from '../services/geminiService';
import BarChart from '../components/BarChart';

interface StatsViewProps {
  cycles: CircuitCycle[];
  workouts: Workout[];
}

type TabType = 'period' | 'circuits';
type TimeRange = '7days' | '30days' | 'all';

const StatsView: React.FC<StatsViewProps> = ({ cycles = [], workouts = [] }) => {
  const [activeTab, setActiveTab] = useState<TabType>('period');
  const [range, setRange] = useState<TimeRange>('30days');
  const [analysis, setAnalysis] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCycleId, setSelectedCycleId] = useState<string>(cycles.find(c => c.status === 'active')?.id || '');

  // Filtered logs based on selected range (for Period tab)
  const filteredLogs = useMemo(() => {
    const now = new Date();
    let startTime = new Date(0);

    if (range === '7days') startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (range === '30days') startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    let logs: (WorkoutLog & { workoutName: string, workoutWeight: string })[] = [];

    (cycles || []).forEach(cycle => {
      const cycleLogs = Array.isArray(cycle.logs) ? cycle.logs : [];
      cycleLogs.filter(l => l.completed && new Date(l.date) >= startTime).forEach(l => {
        logs.push({
          ...l,
          workoutName: workouts.find(w => w.id === l.workoutId)?.name || 'Desconocido',
          workoutWeight: workouts.find(w => w.id === l.workoutId)?.weight || '?'
        });
      });
    });

    return logs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [cycles, workouts, range]);

  // Datos para las gráficas: buckets por día (7 días) o por semana (30d/todo).
  const chartData = useMemo(() => {
    const now = new Date();
    const buckets: { label: string; start: number; end: number }[] = [];
    if (range === '7days') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
        buckets.push({ label: d.toLocaleDateString('es-MX', { weekday: 'short' }).slice(0, 2), start: d.getTime(), end: d.getTime() + 86400000 });
      }
    } else {
      const weeks = range === '30days' ? 5 : 8;
      const sow = new Date(now); sow.setHours(0, 0, 0, 0);
      sow.setDate(sow.getDate() - ((sow.getDay() + 6) % 7)); // lunes de esta semana
      for (let i = weeks - 1; i >= 0; i--) {
        const s = new Date(sow); s.setDate(s.getDate() - i * 7);
        buckets.push({ label: s.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', ''), start: s.getTime(), end: s.getTime() + 7 * 86400000 });
      }
    }
    return buckets.map(b => {
      const inB = filteredLogs.filter(l => { const t = new Date(l.date).getTime(); return t >= b.start && t < b.end; });
      const weights = inB.map(l => parseFloat((l.workoutWeight || '').replace(/[^0-9.]/g, ''))).filter(v => v > 0);
      const avg = weights.length ? weights.reduce((a, c) => a + c, 0) / weights.length : 0;
      return { label: b.label, sessions: inB.length, avgWeight: avg };
    });
  }, [filteredLogs, range]);

  const hasChartData = chartData.some(d => d.sessions > 0);

  // Selected Cycle for Analysis (for Circuits tab)
  const selectedCycle = useMemo(() => 
    cycles.find(c => c.id === selectedCycleId) || cycles.find(c => c.status === 'active'),
    [cycles, selectedCycleId]
  );

  const cycleStats = useMemo(() => {
    if (!selectedCycle) return null;
    const cycleLogs = Array.isArray(selectedCycle.logs) ? selectedCycle.logs : [];
    const completed = cycleLogs.filter(l => l.completed);
    const weights = completed.map(l => {
      const w = workouts.find(work => work.id === l.workoutId);
      return parseFloat(w?.weight.replace(/[^0-9.]/g, '') || '0');
    }).filter(v => v > 0);
    
    const avgWeight = weights.length > 0 ? (weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(1) : '0';
    
    // Calculate frequency (days between sessions)
    let avgFreq = 0;
    if (completed.length > 1) {
      const dates = completed.map(l => new Date(l.date).getTime()).sort();
      const diffs = [];
      for(let i=1; i<dates.length; i++) diffs.push(dates[i] - dates[i-1]);
      avgFreq = (diffs.reduce((a,b) => a+b, 0) / diffs.length) / (1000 * 3600 * 24);
    }

    return {
      completedCount: completed.length,
      avgWeight,
      avgFreq: avgFreq.toFixed(1)
    };
  }, [selectedCycle, workouts]);

  const handleGeneratePeriodReport = async () => {
    if (filteredLogs.length === 0) return;
    setIsLoading(true);
    const label = range === '7days' ? 'Últimos 7 días' : range === '30days' ? 'Últimos 30 días' : 'Todo el tiempo';
    const result = await analyzeGlobalPerformance(filteredLogs, label);
    setAnalysis(result || '');
    setIsLoading(false);
  };

  const handleGenerateCycleComparative = async () => {
    if (!selectedCycle) return;
    setIsLoading(true);
    const previous = cycles.filter(c => c.id !== selectedCycle.id && c.status !== 'active');
    const result = await analyzeComparativePerformance(selectedCycle, previous, workouts);
    setAnalysis(result || '');
    setIsLoading(false);
  };

  useEffect(() => {
    setAnalysis('');
  }, [range, selectedCycleId, activeTab]);

  return (
    <div className="py-4 text-black animate-in fade-in duration-500">
      <header className="mb-6">
        <h2 className="font-heading text-3xl uppercase leading-none">Rendimiento</h2>
        <p className="text-[12px] font-bold text-gray-500 uppercase tracking-widest mt-1">Análisis Pro de Bellforce</p>
      </header>

      {/* Main Tabs */}
      <div className="flex border-2 border-black rounded-xl overflow-hidden mb-8 neo-brutalism no-click">
        <button 
          onClick={() => setActiveTab('period')}
          className={`flex-1 p-3 text-[12px] font-black uppercase transition-colors ${activeTab === 'period' ? 'bg-black text-white' : 'bg-white text-black'}`}
        >
          Por Periodo
        </button>
        <button 
          onClick={() => setActiveTab('circuits')}
          className={`flex-1 p-3 text-[12px] font-black uppercase transition-colors ${activeTab === 'circuits' ? 'bg-black text-white' : 'bg-white text-black'}`}
        >
          Por Circuito
        </button>
      </div>

      {activeTab === 'period' ? (
        <>
          {/* Selector de Rango */}
          <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
            {(['7days', '30days', 'all'] as const).map(r => (
              <button 
                key={r}
                onClick={() => setRange(r)}
                className={`whitespace-nowrap px-4 py-2 rounded-full neo-brutalism text-[11px] font-bold uppercase transition-all ${
                  range === r ? 'bg-black text-white' : 'bg-white text-black'
                }`}
              >
                {r === '7days' ? '7 Días' : r === '30days' ? '30 Días' : 'Todo'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white neo-brutalism p-4 rounded-2xl text-center">
              <p className="text-[11px] font-bold text-gray-400 uppercase mb-1">Sesiones</p>
              <p className="font-heading text-3xl">{filteredLogs.length}</p>
            </div>
            <div className="bg-white neo-brutalism p-4 rounded-2xl text-center">
              <p className="text-[11px] font-bold text-gray-400 uppercase mb-1">Días activos</p>
              <p className="font-heading text-3xl">{new Set(filteredLogs.map(l => new Date(l.date).toDateString())).size}</p>
            </div>
          </div>

          {/* GRÁFICAS DE PROGRESO */}
          {hasChartData ? (
            <div className="space-y-4 mb-8">
              <div className="bg-white neo-brutalism p-4 rounded-2xl border-black">
                <p className="font-heading text-xs uppercase mb-3">Sesiones {range === '7days' ? 'por día' : 'por semana'}</p>
                <BarChart data={chartData.map(d => ({ label: d.label, value: d.sessions }))} />
              </div>
              <div className="bg-white neo-brutalism p-4 rounded-2xl border-black">
                <p className="font-heading text-xs uppercase mb-3">Carga promedio (kg)</p>
                <BarChart
                  color="#77b074"
                  data={chartData.map(d => ({ label: d.label, value: Math.round(d.avgWeight), display: d.avgWeight ? String(Math.round(d.avgWeight)) : '' }))}
                />
              </div>
            </div>
          ) : (
            <div className="text-center py-8 mb-8 neo-brutalism bg-white/50 rounded-2xl border-dashed border-black/20">
              <p className="font-black uppercase text-[11px] text-gray-400 tracking-widest">Sin datos para graficar en este periodo</p>
            </div>
          )}

          <button
            onClick={handleGeneratePeriodReport}
            disabled={isLoading || filteredLogs.length === 0}
            className="w-full neo-brutalism bg-[#ebca7a] p-6 rounded-2xl font-heading text-lg flex flex-col items-center gap-2 group hover:bg-[#d8b86a] transition-colors mb-8 disabled:opacity-50"
          >
            {isLoading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
                <span className="text-[12px] font-black">ANALIZANDO PERIODO...</span>
              </div>
            ) : (
              <>
                <svg className="w-8 h-8 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                <span className="text-sm">INFORME DE RENDIMIENTO</span>
              </>
            )}
          </button>
        </>
      ) : (
        <>
          {/* Selector de Circuito */}
          <div className="mb-6">
            <label className="text-[11px] font-black uppercase text-gray-400 block mb-2">Seleccionar Circuito para analizar</label>
            <select 
              value={selectedCycleId}
              onChange={(e) => setSelectedCycleId(e.target.value)}
              className="w-full neo-brutalism bg-white p-3 rounded-xl text-xs font-bold focus:outline-none"
            >
              {(cycles || []).slice().reverse().map((c, i) => (
                <option key={c.id} value={c.id}>
                  {c.status === 'active' ? 'Circuito Actual' : `Circuito #${cycles.length - i} (${new Date(c.startDate).toLocaleDateString()})`}
                </option>
              ))}
            </select>
          </div>

          {cycleStats && (
            <div className="grid grid-cols-3 gap-3 mb-8">
              <div className="bg-white neo-brutalism p-3 rounded-xl text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Completado</p>
                <p className="font-heading text-xl">{cycleStats.completedCount}/{(Array.isArray(selectedCycle?.workoutIds) ? selectedCycle?.workoutIds.length : 15)}</p>
              </div>
              <div className="bg-white neo-brutalism p-3 rounded-xl text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Carga Prom.</p>
                <p className="font-heading text-xl">{cycleStats.avgWeight}k</p>
              </div>
              <div className="bg-white neo-brutalism p-3 rounded-xl text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Frecuencia</p>
                <p className="font-heading text-xl">{cycleStats.avgFreq}d</p>
              </div>
            </div>
          )}

          <button 
            onClick={handleGenerateCycleComparative}
            disabled={isLoading || !selectedCycle}
            className="w-full neo-brutalism bg-[#77b074] p-6 rounded-2xl font-heading text-lg flex flex-col items-center gap-2 group hover:bg-[#68a065] transition-colors mb-8"
          >
            {isLoading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
                <span className="text-[12px] font-black">COMPARANDO CON HISTORIAL...</span>
              </div>
            ) : (
              <>
                <svg className="w-8 h-8 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24"><path d="M7 2v11h3v9l7-12h-4l4-8H7z"/></svg>
                <span className="text-sm">ANÁLISIS COMPARATIVO IA</span>
              </>
            )}
          </button>
        </>
      )}

      {/* Contenedor de Resultado IA */}
      {analysis && (
        <div className="bg-blue-50 neo-brutalism p-6 rounded-2xl animate-in slide-in-from-bottom-4 duration-500 border-blue-200 relative">
          <div className="flex items-center gap-2 mb-4 border-b border-blue-200 pb-2">
            <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1a1 1 0 112 0v1a1 1 0 11-2 0zM13.536 14.243a1 1 0 011.414 1.414l-.707.707a1 1 0 01-1.414-1.414l.707-.707zM10 11a1 1 0 100-2 1 1 0 000 2z"/></svg>
            <span className="font-heading text-xs text-blue-900 tracking-tight">Reporte Consolidado Gemini</span>
          </div>
          <div className="whitespace-pre-wrap text-[11px] leading-relaxed text-blue-900 font-medium">
            {analysis}
          </div>
        </div>
      )}

      {/* Lista de Registros */}
      {!analysis && (activeTab === 'period' ? filteredLogs : (Array.isArray(selectedCycle?.logs) ? selectedCycle?.logs.filter(l => l.completed) : [])).length > 0 && (
        <div className="mt-8">
          <h3 className="font-heading text-xs mb-4 uppercase opacity-50 tracking-widest">Registros del periodo</h3>
          <div className="space-y-3">
            {(activeTab === 'period' ? filteredLogs : (Array.isArray(selectedCycle?.logs) ? selectedCycle?.logs.filter(l => l.completed) : []))?.slice().reverse().map((log, idx) => {
              const workout = workouts.find(w => w.id === log.workoutId);
              return (
                <div key={idx} className="bg-white p-4 rounded-xl border-2 border-black flex justify-between items-center neo-brutalism no-click">
                  <div>
                    <p className="text-[12px] font-black uppercase leading-tight">{workout?.name || 'Workout'}</p>
                    <p className="text-[10px] opacity-60 font-bold">{new Date(log.date).toLocaleDateString()} • {log.time}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[12px] font-black text-[#77b074] uppercase">✓ OK</p>
                    <p className="text-[11px] font-bold">{workout?.weight || '-'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default StatsView;

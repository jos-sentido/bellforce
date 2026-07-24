import React from 'react';

export interface BarDatum {
  label: string;
  value: number;
  display?: string; // texto a mostrar arriba de la barra (si no, value)
}

// Gráfica de barras estilo neo-brutalismo (CSS puro, sin librerías).
const BarChart: React.FC<{ data: BarDatum[]; color?: string }> = ({ data, color = '#ebca7a' }) => {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="flex items-end gap-1.5 h-36">
      {data.map((d, i) => {
        const pct = d.value > 0 ? Math.max((d.value / max) * 100, 6) : 0;
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full min-w-0">
            {d.value > 0 && (
              <span className="text-[9px] font-black text-black leading-none">{d.display ?? d.value}</span>
            )}
            <div
              className="w-full border-2 border-black rounded-t-md transition-all"
              style={{ height: `${pct}%`, backgroundColor: d.value > 0 ? color : 'transparent' }}
            />
            <span className="text-[8px] font-black text-gray-500 uppercase truncate w-full text-center leading-none">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
};

export default BarChart;

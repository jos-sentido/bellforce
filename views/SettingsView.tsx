
import React, { useRef, useState } from 'react';
import { User } from '../types';

interface SettingsViewProps {
  user: User;
  onLogout: () => void;
  onExport: () => void;
  onImport: (jsonText: string) => boolean;
}

const SettingsView: React.FC<SettingsViewProps> = ({ user, onLogout, onExport, onImport }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      if (!confirm('Esto reemplazará tus datos actuales (workouts, plantillas y ciclos) con los de la copia. ¿Continuar?')) {
        setImportStatus('idle');
        return;
      }
      const ok = onImport(text);
      setImportStatus(ok ? 'ok' : 'error');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="py-4 text-black animate-in fade-in duration-500 space-y-8">
      <header>
        <h2 className="font-heading text-3xl uppercase leading-none">Ajustes</h2>
        <p className="text-[12px] font-bold text-gray-500 uppercase tracking-widest mt-1">Perfil y datos</p>
      </header>

      {/* PERFIL */}
      <section className="neo-brutalism bg-white p-5 rounded-2xl border-black">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[#ebca7a] border-2 border-black flex items-center justify-center font-heading text-2xl shrink-0">
            {user.name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="flex-1 overflow-hidden">
            <h3 className="font-heading text-lg leading-none truncate">{user.name}</h3>
            <p className="text-[12px] font-bold text-gray-500 truncate">{user.email}</p>
            <span className={`inline-block mt-1 text-[9px] font-black uppercase px-2 py-0.5 rounded border-2 ${user.role === 'admin' ? 'bg-black text-[#ebca7a] border-black' : 'bg-gray-100 text-gray-600 border-gray-300'}`}>
              {user.role === 'admin' ? '🛡️ Administrador' : 'Usuario'}
            </span>
          </div>
        </div>
      </section>

      {/* COPIA DE SEGURIDAD */}
      <section className="space-y-3">
        <h3 className="font-heading text-sm uppercase">Copia de seguridad</h3>
        <p className="text-[12px] font-bold text-gray-500 leading-relaxed">
          Tus datos viven en este dispositivo. Exporta una copia antes de borrar la caché o cambiar de navegador,
          y restáurala aquí cuando la necesites.
        </p>

        <button
          onClick={onExport}
          className="w-full neo-brutalism bg-[#ebca7a] p-4 rounded-xl font-heading text-xs uppercase border-black active:translate-y-1 active:shadow-none flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"></path></svg>
          Exportar copia (.json)
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full neo-brutalism bg-white p-4 rounded-xl font-heading text-xs uppercase border-black active:translate-y-1 active:shadow-none flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5 5 5M12 5v12"></path></svg>
          Restaurar copia
        </button>
        <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleFile} />

        {importStatus === 'ok' && <p className="text-[12px] font-black uppercase text-[#77b074] text-center animate-in fade-in">✓ Copia restaurada correctamente</p>}
        {importStatus === 'error' && <p className="text-[12px] font-black uppercase text-red-600 text-center animate-in fade-in">✗ Archivo inválido</p>}
      </section>

      {/* SESIÓN */}
      <section className="pt-4 border-t-2 border-black/10">
        <button
          onClick={() => { if (confirm('¿Cerrar sesión? Tus datos quedan guardados en este dispositivo.')) onLogout(); }}
          className="w-full neo-brutalism bg-red-500 text-white p-4 rounded-xl font-heading text-xs uppercase border-black active:translate-y-1 active:shadow-none"
        >
          Cerrar sesión
        </button>
      </section>

      <p className="text-center text-[11px] font-bold text-gray-400 uppercase tracking-widest">Bellforce · Kettlebell Evolution System</p>
    </div>
  );
};

export default SettingsView;

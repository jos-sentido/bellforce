import React from 'react';

// Iconos de línea consistentes con el estilo de la app (editar / basura).
type IconProps = { className?: string };

// Rayo (como el del logo) — usado para "entrenar ahora" / modo libre.
export const BoltIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

// Ojo abierto — contenido visible / público.
export const EyeIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M2.5 12S5.5 5.5 12 5.5 21.5 12 21.5 12 18.5 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" strokeWidth="2.2" />
  </svg>
);

// Ojo tachado — contenido no visible / privado.
export const EyeOffIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M9.9 5.8A9.6 9.6 0 0112 5.5c6.5 0 9.5 6.5 9.5 6.5a15 15 0 01-2.4 3.3M6.2 6.7A15 15 0 002.5 12S5.5 18.5 12 18.5c1.2 0 2.3-.2 3.2-.6M4 4l16 16" />
  </svg>
);

// Cámara — para conteo de fotos.
export const CameraIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M3 8a2 2 0 012-2h1.2l1-1.5A1 1 0 018 4h8a1 1 0 01.8.5l1 1.5H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
    <circle cx="12" cy="13" r="3" strokeWidth="2.2" />
  </svg>
);

// Archivar / desarchivar.
export const ArchiveIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M4 7h16M5 7l1 12a1 1 0 001 1h10a1 1 0 001-1l1-12M4 7l1.2-2.4A1 1 0 016.1 4h11.8a1 1 0 01.9.6L20 7M10 12h4" />
  </svg>
);

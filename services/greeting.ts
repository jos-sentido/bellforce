import { CircuitCycle } from '../types';

// Frases motivacionales por categoría. {n} se reemplaza por el nombre.
const NEUTRAL = [
  'A darle con todo hoy, {n}',
  'Sí o sí, hoy se entrena. ¿Qué toca, {n}?',
  'Hoy es buen día para sudar, {n}',
  'Vamos por más, {n}',
  'El hierro te espera, {n}',
  'Un día más, un día más fuerte, {n}',
  '¿Listo para romperla, {n}?',
  'Con actitud, {n}. Hoy se entrena',
];

const STREAK = [
  'Vas con todo estos días, {n}. Sigue así',
  'Racha encendida, {n}. No la sueltes',
  'Imparable, {n}. A mantener el ritmo',
  'Qué nivel, {n}. Uno más y a seguir',
  'Constancia pura, {n}. Así se hace',
];

const INACTIVE = [
  'Venga, {n}, tú puedes. Hoy retomamos',
  'Te toca volver, {n}. Un paso a la vez',
  'Hoy reencendemos, {n}. Vamos',
  'Sin excusas, {n}. Hoy vuelves con todo',
];

// Índice que cambia cada día (determinista dentro del mismo día).
function dayIndex(): number {
  return Math.floor(Date.now() / 86_400_000);
}

function pick(list: string[], name: string): string {
  const phrase = list[dayIndex() % list.length];
  return phrase.replace('{n}', name);
}

// Construye el saludo según la actividad reciente del usuario.
export function buildGreeting(fullName: string, cycles: CircuitCycle[]): string {
  const name = (fullName || '').trim().split(/\s+/)[0] || 'crack';

  const completed = (cycles || []).flatMap(c =>
    (Array.isArray(c.logs) ? c.logs : []).filter(l => l.completed)
  );

  if (completed.length === 0) return pick(NEUTRAL, name);

  const now = Date.now();
  const times = completed.map(l => new Date(l.date).getTime());
  const in7 = times.filter(t => now - t <= 7 * 86_400_000).length;
  const daysSinceLast = Math.floor((now - Math.max(...times)) / 86_400_000);

  if (in7 >= 3 || daysSinceLast === 0) return pick(STREAK, name);
  if (daysSinceLast >= 7) return pick(INACTIVE, name);
  return pick(NEUTRAL, name);
}

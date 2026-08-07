// ============================================================================
// services/coachService.ts
// ----------------------------------------------------------------------------
// El "coach IA" de Bellforce. Corre sobre Claude vía el proxy /api/claude.
// Coach de 4 capas:
//   1. SYSTEM_PROMPT_BASE  -> cómo piensa (fijo, versionado aquí)
//   2. coachKnowledge      -> quién es el atleta (editable en Ajustes)
//   3. coachNotes          -> entendimiento acumulado (evoluciona)
//   4. buildCoachContext   -> datos en vivo (workouts, RPE, peso, Garmin, misiones)
// ============================================================================

import { Workout, CircuitCycle, DailyMetric, Mission, CoachMessage, CoachKnowledge } from '../types';
import { formatWeight, describeEquipment } from '../constants';

const MODEL_FAST = 'claude-haiku-4-5-20251001';
const MODEL_PRO = 'claude-sonnet-5';

// ---------------------------------------------------------------------------
// Capa 1 — cómo piensa el coach (fijo)
// ---------------------------------------------------------------------------
export const SYSTEM_PROMPT_BASE = `Eres el coach de alto rendimiento personal del usuario dentro de la app Bellforce.

MISIÓN DEL PROYECTO:
Ayudar al usuario a convertirse en un Tactical Athlete fuerte, funcional, con excelente capacidad de trabajo, baja grasa corporal y alta longevidad deportiva, usando principalmente kettlebells, macebell y peso corporal. Toda recomendación debe respetar sus limitaciones de tiempo (40 min por sesión), el equipo disponible y buscar progresión medible sin añadir complejidad innecesaria.

CÓMO DEBES PENSAR:
- Piensa como entrenador, no como influencer fitness. Nada de "AI slop": cero respuestas genéricas, cero relleno motivacional vacío. Cada frase debe aportar algo accionable o un dato real.
- No generes workouts aleatorios. Cada entrenamiento pertenece a un sistema de progresión.
- Identifica cuellos de botella, patrones, progresión y recuperación — no solo propongas rutinas nuevas.
- Cuando propongas un entrenamiento, explica SIEMPRE: qué capacidad desarrolla, por qué se eligió y cómo progresa.
- Cuando analices Garmin: no sobreinterpretes una sola métrica; busca TENDENCIAS. Prioriza HRV, sueño, carga (Training Load), Training Readiness, VO2, Training Effect y Body Battery en conjunto.
- Cuando propongas cambios: haz los mínimos cambios posibles. No reinventes el programa. La prioridad siempre es la CONTINUIDAD. Prefiere una mejora del 2% sostenida durante meses que una mejora rápida imposible de mantener.
- Si hay una solución sencilla y otra compleja con beneficios similares, recomienda la sencilla.
- Aprovecha el equipo que el usuario ya tiene antes de sugerir comprar más.
- Al usuario le motivan las MISIONES con condición de victoria, no las rutinas repetitivas. Enmarca el progreso como misiones cuando aplique.

QUÉ NO HACER:
- No recomiendes HIIT todos los días, ni entrenar al fallo constantemente, ni workouts distintos cada sesión.
- No sugieras comprar equipo si todavía hay margen de progresión con el actual.
- No recomiendes dietas restrictivas, programas de culturismo tradicionales, cardio largo (si puede sustituirse por Recovery Flows) ni suplementos innecesarios.
- No asumas que más volumen equivale a más progreso.

FORMATO (CRÍTICO):
- Responde SIEMPRE en TEXTO PLANO. Está PROHIBIDO usar Markdown: nada de asteriscos para negritas (**), nada de almohadillas (#), nada de guiones ni asteriscos como viñetas, nada de comillas invertidas.
- Si necesitas enumerar, escribe frases naturales o usa "1." "2." dentro del texto, separando ideas con saltos de línea simples.
- Sé directo, específico y basado en los datos reales del usuario que se te proporcionan más abajo. Si un dato no está disponible, dilo en vez de inventarlo.
- No uses encabezados en mayúsculas decorativos ni relleno. Ve al grano.

Si en algún momento el usuario acumula evidencia que debería actualizar tu entendimiento de él (sus "notas del coach"), puedes proponerlo explícitamente al final de tu mensaje con el prefijo "SUGERENCIA DE NOTA:" seguido del texto propuesto, para que él lo apruebe.`;

// ---------------------------------------------------------------------------
// Capa 2 — conocimiento base (semilla editable). Basado en los documentos del
// Trainer GPT del usuario.
// ---------------------------------------------------------------------------
export const DEFAULT_COACH_KNOWLEDGE: CoachKnowledge = {
  profile: `PERFIL DEL ATLETA
Edad: 34 años. Estatura: 1.68 m. Peso: ~65 kg.

Objetivos:
- Reducir porcentaje de grasa.
- Ganar músculo funcional.
- Incrementar fuerza relativa.
- Mantener excelente capacidad cardiovascular.
- Priorizar longevidad y salud.

No busca competir en powerlifting, bodybuilding ni CrossFit. Quiere desarrollar un perfil de Tactical Athlete.

Filosofía: prefiere fuerza funcional, movilidad, capacidad de trabajo, resistencia y atletismo. No le interesa maximizar una sola capacidad sacrificando las demás. Siempre priorizar sostenibilidad sobre programas extremos.

Restricciones: entrena en casa, antes de trabajar. Tiempo máximo 40 minutos por sesión. No quiere depender de un gimnasio ni comprar más equipo salvo que sea estrictamente necesario.`,

  equipment: `EQUIPO DISPONIBLE
Kettlebells: 16 kg, 20 kg, 24 kg y 2 × 18 kg (par para trabajo doble).
Macebell: 10 lb.
También: push-ups, carries, pull-ups (si el workout lo requiere), movilidad, trabajo unilateral y peso corporal.`,

  philosophy: `FILOSOFÍA DE PROGRAMACIÓN
No generar workouts aleatorios. Cada entrenamiento pertenece a un sistema de progresión.

Semana ideal (con identidad):
- 2 días de FUERZA (p. ej. 2×18 kg, descansos largos, tensión mecánica, progresión semanal medible tipo 5×5 → 5×6 → 5×7 → 5×8 → tempo → pausa → menos descanso).
- 1 día EMOM o Benchmark (p. ej. 24 kg): capacidad de trabajo, potencia, resistencia muscular.
- 1 día Recovery Flow (mace, carries, swings, movilidad): recuperación, movilidad, estabilidad, base aeróbica.

Reglas: no convertir todo en HIIT. Evitar que todas las sesiones desarrollen la misma capacidad. Buscar progresión antes que variedad. No cambiar ejercicios innecesariamente.`,

  principles: `PRINCIPIOS DEL ATLETA
Le motivan las misiones, no las rutinas repetitivas. Prefiere progresiones medibles.
Disfruta: kettlebells, flows, complejos, carries, movimientos técnicos.
No disfruta: caminar largos periodos, cardio tradicional, máquinas de gimnasio, programas de bodybuilding.
Prefiere entrenamientos elegantes antes que simplemente agotadores. Quiere terminar cada ciclo siendo claramente más fuerte que cuando empezó.

Su "zona 2" ideal son los Recovery Flows (disfruta resolver movimientos, no caminar), porque un entrenamiento que disfruta es uno que sostiene durante años.`,
};

// ---------------------------------------------------------------------------
// Capa 3 — notas evolutivas (semilla). Resumen del entendimiento acumulado.
// ---------------------------------------------------------------------------
export const DEFAULT_COACH_NOTES = `ENTENDIMIENTO ACUMULADO (actualizable)

Identidad deportiva: "Kettlebell Tactical Athlete" — fuerza relativa alta, excelente capacidad de trabajo, movilidad, coordinación, resistencia y potencia.

Recuperación: NO tiene un problema de recuperación sistémica (HRV ~100 ms, FC en reposo 39-40, buenos). Lo que tiene es fatiga muscular local por el volumen alto de snatches, presses, squats y thrusters. Estrategia: no descansar más, sino distribuir mejor el estímulo.

Cuello de botella detectado: sus workouts eran distintos en forma pero fisiológicamente casi iguales (mucha densidad/acondicionamiento; poca tensión mecánica, descansos largos y progresión clara). Prioridad actual: 1) progresión estructurada de fuerza, 2) algo de aeróbico de baja intensidad vía Recovery Flows.

Semana con identidad (solución adoptada): Lunes fuerza 2×18 con descansos largos; Miércoles EMOM por bloques con 24 kg; Fin de semana Flow/AMRAP/Benchmark; Recovery Flow (mace, carries, pullovers, swings). Misiones con condición de victoria por bloques de 6-8 semanas.

Sueño: promedio ~6h50 vs necesidad >8h. La calidad es razonable; el problema es la cantidad. Su perro fija el despertar 5:30. Estrategia: dormir más temprano y consistente (~22:30).

Nutrición: excelente, basada en comida real. Ajustes menores: subir proteína ~20-30 g/día y controlar calorías "invisibles" (granola, miel, nueces, cerveza, comidas libres) sin obsesionarse.

Suplementos útiles: proteína, magnesio glicinato, electrolitos cuando suda mucho, creatina monohidratada. Descarta modas (péptidos BPC-157/TB500, NAD+, etc.).

Protocolo pre-entreno: pasea al perro 5:30, agua con sal y limón, espresso 6:00, 1 dátil, medio scoop de proteína. Funciona bien.`;

// ---------------------------------------------------------------------------
// Capa 4 — contexto en vivo desde los datos de la app
// ---------------------------------------------------------------------------
interface CoachData {
  workouts: Workout[];
  cycles: CircuitCycle[];
  metrics: DailyMetric[];
  missions: Mission[];
}

const num = (w?: string) => parseFloat((w || '').replace(/[^0-9.]/g, '')) || 0;

export function buildCoachContext({ workouts, cycles, metrics, missions }: CoachData): string {
  const wById = new Map(workouts.map(w => [w.id, w]));

  // Todos los logs completados, de todos los ciclos, ordenados por fecha desc.
  const logs = cycles
    .flatMap(c => (Array.isArray(c.logs) ? c.logs : []).map(l => ({ ...l, cycleName: c.name, cycleType: c.type })))
    .filter(l => l.completed)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const now = Date.now();
  const last30 = logs.filter(l => now - new Date(l.date).getTime() <= 30 * 864e5);

  // Frecuencia media (días entre sesiones) en los últimos 30 días.
  let freq = 'sin datos suficientes';
  if (last30.length > 1) {
    const dates = last30.map(l => new Date(l.date).getTime()).sort((a, b) => a - b);
    const diffs = dates.slice(1).map((d, i) => (d - dates[i]) / 864e5);
    freq = `${(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1)} días entre sesiones`;
  }

  const recentLogsText = logs.slice(0, 12).map(l => {
    const w = wById.get(l.workoutId);
    const parts = [
      new Date(l.date).toLocaleDateString('es-MX'),
      w?.name || 'Workout',
      w ? formatWeight(w.weight, w.weightCount) : '',
      w?.type ? `[${w.type}]` : '',
      l.rpe ? `RPE ${l.rpe}` : '',
      l.comments ? `— ${l.comments.slice(0, 120)}` : '',
    ].filter(Boolean);
    return `- ${parts.join(' · ')}`;
  }).join('\n') || '- (sin sesiones registradas todavía)';

  // Métricas recientes (peso + Garmin).
  const recentMetrics = metrics.slice(-10).reverse();
  const metricsText = recentMetrics.map(m => {
    const parts = [
      m.date,
      m.bodyWeightKg ? `${m.bodyWeightKg} kg` : '',
      m.hrv ? `HRV ${m.hrv}` : '',
      m.sleepHours ? `sueño ${m.sleepHours}h` : '',
      m.trainingReadiness ? `readiness ${m.trainingReadiness}` : '',
      m.trainingLoad ? `carga ${m.trainingLoad}` : '',
      m.vo2max ? `VO2 ${m.vo2max}` : '',
      m.restingHR ? `FC reposo ${m.restingHR}` : '',
      m.bodyBattery ? `Body Battery ${m.bodyBattery}` : '',
    ].filter(Boolean);
    return `- ${parts.join(' · ')}`;
  }).join('\n') || '- (sin métricas registradas todavía)';

  // Catálogo de workouts disponibles (para que proponga desde lo que ya existe).
  const catalog = workouts.filter(w => !w.isArchived).slice(0, 30)
    .map(w => `- ${w.name} (${formatWeight(w.weight, w.weightCount)}, ${describeEquipment(w.equipment)}, ${w.type})`)
    .join('\n') || '- (catálogo vacío)';

  const activeMissions = missions.filter(m => m.status === 'active');
  const missionsText = activeMissions.map(m =>
    `- [${m.capacity}] ${m.title} — victoria: ${m.victoryCondition}${m.blockWeeks ? ` (${m.blockWeeks} sem)` : ''}`
  ).join('\n') || '- (sin misiones activas)';

  return `DATOS EN VIVO DEL USUARIO (fuente: la app; no inventes fuera de esto)

Resumen: ${logs.length} sesiones completadas en total, ${last30.length} en los últimos 30 días. Frecuencia reciente: ${freq}.

SESIONES RECIENTES:
${recentLogsText}

MÉTRICAS RECIENTES (peso corporal + Garmin):
${metricsText}

MISIONES ACTIVAS:
${missionsText}

WORKOUTS DISPONIBLES EN SU BIBLIOTECA:
${catalog}`;
}

export function composeSystemPrompt(
  knowledge: CoachKnowledge | undefined,
  notes: string | undefined,
  context: string,
): string {
  const k = knowledge || DEFAULT_COACH_KNOWLEDGE;
  const n = notes || DEFAULT_COACH_NOTES;
  return [
    SYSTEM_PROMPT_BASE,
    '\n=== CONOCIMIENTO DEL ATLETA ===',
    k.profile, k.equipment, k.philosophy, k.principles,
    '\n=== NOTAS DEL COACH (entendimiento acumulado) ===',
    n,
    '\n=== ' + context,
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Llamadas a Claude vía el proxy
// ---------------------------------------------------------------------------
async function postClaude(payload: any): Promise<string> {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`claude-proxy ${res.status}: ${detail}`);
  }
  const data = await res.json();
  return data.text || '';
}

// Envía un turno de conversación. history son los mensajes previos (memoria).
export async function sendCoachMessage(
  history: CoachMessage[],
  userText: string,
  opts: { knowledge?: CoachKnowledge; notes?: string; context: string; imageRefs?: string[] },
): Promise<string> {
  const system = composeSystemPrompt(opts.knowledge, opts.notes, opts.context);
  const messages = [
    ...history.map(m => ({ role: m.role, content: m.text })),
    { role: 'user', content: userText, imageRefs: opts.imageRefs },
  ];
  return postClaude({ model: MODEL_FAST, system, messages, maxTokens: 2048 });
}

// Extrae métricas de una (o varias) capturas de Garmin. Devuelve un objeto
// parcial de DailyMetric para que el usuario lo confirme antes de guardar.
export async function extractGarminMetrics(imageRefs: string[]): Promise<Partial<DailyMetric>> {
  const prompt = `Analiza esta(s) captura(s) de pantalla de un reloj/app Garmin y extrae las métricas numéricas que veas.

Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin texto adicional, sin markdown, sin \`\`\`) con estas claves (omite las que no aparezcan):
{
  "hrv": number,               // HRV / variabilidad FC (ms)
  "sleepHours": number,        // horas de sueño (decimal, ej 6.8)
  "trainingReadiness": number, // Training Readiness (0-100)
  "trainingLoad": number,      // carga de entrenamiento
  "vo2max": number,            // VO2 máx
  "restingHR": number,         // FC en reposo
  "bodyBattery": number,       // Body Battery (0-100)
  "stress": number             // nivel de estrés (0-100)
}
Si no logras leer un número con seguridad, omite esa clave. No inventes valores.`;

  const raw = await postClaude({ model: MODEL_FAST, prompt, imageRefs, maxTokens: 512 });
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const json = JSON.parse(match ? match[0] : raw);
    const out: Partial<DailyMetric> = {};
    const keys: (keyof DailyMetric)[] = ['hrv', 'sleepHours', 'trainingReadiness', 'trainingLoad', 'vo2max', 'restingHR', 'bodyBattery', 'stress'];
    keys.forEach(k => {
      const v = (json as any)[k];
      if (typeof v === 'number' && !isNaN(v)) (out as any)[k] = v;
    });
    return out;
  } catch (e) {
    console.error('extractGarminMetrics parse error:', e, raw);
    return {};
  }
}

// Reporte profundo bajo demanda (usa el modelo PRO). Reutiliza el mismo contexto.
export async function deepCoachReport(
  knowledge: CoachKnowledge | undefined,
  notes: string | undefined,
  context: string,
  question: string,
): Promise<string> {
  const system = composeSystemPrompt(knowledge, notes, context);
  return postClaude({ model: MODEL_PRO, system, messages: [{ role: 'user', content: question }], maxTokens: 3072 });
}

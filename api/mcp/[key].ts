// ============================================================================
// Vercel Serverless Function: /api/mcp/<SECRET>
// ----------------------------------------------------------------------------
// Servidor MCP (Model Context Protocol) de Bellforce, transporte "Streamable
// HTTP", para conectar desde ChatGPT (Developer Mode) o Claude.
//
// AUTENTICACIÓN (fase 1, mono-usuario): el secreto va EN LA URL como segmento de
// ruta (ChatGPT conecta en modo "sin auth"). Solo quien tenga la URL secreta
// entra, y todo se opera como el usuario dueño (BELLFORCE_OWNER_UID).
//   URL:  https://bellforce.vercel.app/api/mcp/<MCP_SECRET>
//
// Env vars requeridas en Vercel:
//   MCP_SECRET               -> secreto largo aleatorio (el de la URL)
//   BELLFORCE_OWNER_UID      -> tu uid de Firebase Auth (dueño de los datos)
//   FIREBASE_SERVICE_ACCOUNT -> JSON de la service account (Admin SDK)
//
// NOTA de empaquetado: TODO va en este único archivo a propósito. Vercel excluye
// del deploy las carpetas que empiezan con "_", y no bundlea imports relativos
// de forma fiable en proyectos no-Next; por eso la capa de acciones vive aquí
// mismo. (Fase 2 / agente interno reusará la lógica desde services/, no de aquí.)
// ============================================================================

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Firestore } from 'firebase-admin/firestore';

export const config = { runtime: 'nodejs' };

const PROTOCOL_VERSION = '2025-06-18';

// ---------------------------------------------------------------------------
// Firebase Admin (lazy init)
// ---------------------------------------------------------------------------
let _db: Firestore | null = null;
function getDb(): Firestore {
  if (_db) return _db;
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada en el servidor');
    const sa = JSON.parse(raw);
    if (sa.private_key) sa.private_key = String(sa.private_key).replace(/\\n/g, '\n');
    initializeApp({ credential: cert(sa) });
  }
  _db = getFirestore();
  return _db;
}

const clean = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

// ---------------------------------------------------------------------------
// Capa de acciones (cada una valida propiedad contra uid; Admin salta reglas)
// ---------------------------------------------------------------------------
async function listWorkouts(uid: string, opts: any = {}) {
  const db = getDb();
  const col = db.collection('workouts');
  const scope = opts.scope || 'all';
  const snaps: Promise<any>[] = [];
  if (scope === 'all' || scope === 'public') snaps.push(col.where('isPublic', '==', true).get());
  if (scope === 'all' || scope === 'mine') snaps.push(col.where('createdBy', '==', uid).get());
  const results = await Promise.all(snaps);
  const map = new Map<string, any>();
  results.forEach(s => s.docs.forEach((d: any) => map.set(d.id, { id: d.id, ...d.data() })));
  let items = Array.from(map.values());
  if (!opts.includeArchived) items = items.filter(w => !w.isArchived);
  return items;
}

async function createWorkout(uid: string, data: any) {
  const db = getDb();
  const payload = clean({
    name: data.name,
    weight: data.weight ?? '',
    weightCount: data.weightCount,
    type: data.type ?? '',
    equipment: Array.isArray(data.equipment) ? data.equipment : undefined,
    duration: data.duration ?? '',
    description: data.description ?? '',
    isPublic: data.isPublic === true,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  if (!payload.name) throw new Error('createWorkout: falta "name"');
  const ref = await db.collection('workouts').add(payload);
  return { id: ref.id, ...payload, createdAt: undefined };
}

async function updateWorkout(uid: string, id: string, patch: any) {
  const db = getDb();
  const ref = db.collection('workouts').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`updateWorkout: no existe workout ${id}`);
  const cur = snap.data() as any;
  if (cur.createdBy !== uid) throw new Error('updateWorkout: no eres el dueño de este workout');
  const { id: _i, createdBy: _c, createdAt: _ca, history: _h, ...rest } = patch;
  await ref.set(clean(rest), { merge: true });
  return { id, ...cur, ...rest };
}

async function deleteWorkout(uid: string, id: string) {
  const db = getDb();
  if (!id) throw new Error('deleteWorkout: falta "id"');
  const ref = db.collection('workouts').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`deleteWorkout: no existe workout ${id}`);
  const cur = snap.data() as any;
  // Protección: nunca borrar contenido público/global (seed Bellforce).
  if (cur.isPublic === true) throw new Error('deleteWorkout: no se pueden borrar workouts públicos/globales');
  // (Fase 2 multiusuario: además exigir cur.createdBy === uid.)
  await ref.delete();
  return { deleted: id };
}

// ---- SLOTS (aparición de un workout en un circuito) -----------------------
// Gemelo de services/db.ts cycleSlots(): normaliza un ciclo a su lista de slots.
// 1ra aparición de un workoutId => slotId = workoutId (compat con logs viejos);
// extras => sufijo __s2, __s3, …
function mcpCycleSlots(cycle: any): Array<{ id: string; workoutId: string; weight?: string }> {
  if (Array.isArray(cycle.slots) && cycle.slots.length) return cycle.slots;
  const ids: string[] = cycle.workoutIds || [];
  const seen = new Map<string, number>();
  return ids.map(wid => {
    const n = (seen.get(wid) || 0) + 1;
    seen.set(wid, n);
    const id = n === 1 ? wid : `${wid}__s${n}`;
    const weight = cycle.workoutWeights?.[wid];
    return weight ? { id, workoutId: wid, weight } : { id, workoutId: wid };
  });
}

// Construye slots (con ids estables) a partir de items {workoutId, weight?, id?}.
function buildSlots(items: Array<{ workoutId: string; weight?: string; id?: string }>) {
  const seen = new Map<string, number>();
  return items.filter(it => it && it.workoutId).map(it => {
    const wid = it.workoutId;
    const n = (seen.get(wid) || 0) + 1;
    seen.set(wid, n);
    const id = it.id || (n === 1 ? wid : `${wid}__s${n}`);
    return it.weight ? { id, workoutId: wid, weight: it.weight } : { id, workoutId: wid };
  });
}

// Resuelve el slotId de un circuito a partir de data.slotId o data.workoutId.
function resolveCircuitSlotId(cycle: any, data: any): string {
  if (data.slotId) return data.slotId;
  const slots = mcpCycleSlots(cycle);
  const matches = slots.filter(s => s.workoutId === data.workoutId);
  if (matches.length === 1) return matches[0].id;
  if (matches.length > 1) {
    throw new Error(`"${data.workoutId}" aparece ${matches.length} veces en el circuito; especifica slotId (usa list_cycles para ver los slots).`);
  }
  return data.workoutId; // no está en slots; usa workoutId como slotId
}

async function listCycles(uid: string, opts: any = {}) {
  const db = getDb();
  const snap = await db.collection('cycles').where('userId', '==', uid).get();
  let cycles = await Promise.all(snap.docs.map(async (d: any) => {
    const raw = d.data();
    const base: any = { id: d.id, ...raw, slots: mcpCycleSlots(raw) };
    if (opts.withLogs) {
      const logs = await db.collection('cycles').doc(d.id).collection('logs').get();
      base.logs = logs.docs.map((l: any) => ({ slotId: l.id, ...l.data() }));
    }
    return base;
  }));
  if (opts.status) cycles = cycles.filter(c => c.status === opts.status);
  if (!opts.includeArchived) cycles = cycles.filter(c => !c.isArchived);
  return cycles;
}

async function createCycle(uid: string, data: any) {
  const db = getDb();
  const status = data.status ?? 'active';
  const type = data.type ?? 'circuit';
  // Igual que la app (handleStartCycle): al iniciar un circuito activo, pausa el
  // circuito activo anterior. Así el Hub muestra el ciclo nuevo (asume 1 activo).
  if (status === 'active' && type !== 'standalone') {
    const prev = await db.collection('cycles')
      .where('userId', '==', uid).where('status', '==', 'active').get();
    const batch = db.batch();
    let toPause = 0;
    prev.docs.forEach(d => {
      if ((d.data() as any).type !== 'standalone') { batch.update(d.ref, { status: 'paused' }); toPause++; }
    });
    if (toPause) await batch.commit();
  }
  // Construye slots (aparición por aparición). Acepta `slots` [{workoutId, weight?}]
  // (permite repetir + peso planeado por aparición) o `workoutIds` (repeticiones ok)
  // con `workoutWeights` opcional (peso planeado por workoutId).
  const items = Array.isArray(data.slots) && data.slots.length
    ? data.slots.map((s: any) => ({ workoutId: s.workoutId, weight: s.weight, id: s.id }))
    : (Array.isArray(data.workoutIds) ? data.workoutIds.map((wid: string) => ({ workoutId: wid, weight: data.workoutWeights?.[wid] })) : []);
  const slots = buildSlots(items);

  const payload = clean({
    userId: uid,
    name: data.name ?? 'Circuito',
    startDate: data.startDate ?? new Date().toISOString().slice(0, 10),
    endDate: data.endDate,
    status,
    type,
    slots: slots.length ? slots : undefined,
    workoutIds: slots.length ? slots.map(s => s.workoutId) : undefined, // legacy/compat
    createdAt: FieldValue.serverTimestamp(),
  });
  const ref = await db.collection('cycles').add(payload);

  // Para que el circuito también aparezca en Database→Circuitos (que lista
  // TEMPLATES, no cycles), creamos una plantilla espejo salvo type standalone
  // o que se pida saltarla (saveAsTemplate:false).
  let templateId: string | undefined;
  if (type !== 'standalone' && data.saveAsTemplate !== false && slots.length) {
    const t = await createTemplate(uid, { name: payload.name, workoutIds: slots.map(s => s.workoutId), isPublic: data.isPublic === true });
    templateId = t.id;
  }
  return { id: ref.id, ...payload, createdAt: undefined, templateId };
}

async function createTemplate(uid: string, data: any) {
  const db = getDb();
  if (!Array.isArray(data.workoutIds) || !data.workoutIds.length) {
    throw new Error('createTemplate: falta "workoutIds" (lista de ids de workouts)');
  }
  const payload = clean({
    name: data.name ?? 'Circuito',
    workoutIds: data.workoutIds,
    createdBy: uid,
    isPublic: data.isPublic === true,
    createdAt: FieldValue.serverTimestamp(),
  });
  const ref = await db.collection('templates').add(payload);
  return { id: ref.id, ...payload, createdAt: undefined };
}

async function updateCycle(uid: string, id: string, patch: any) {
  const db = getDb();
  const ref = db.collection('cycles').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`updateCycle: no existe ciclo ${id}`);
  if ((snap.data() as any).userId !== uid) throw new Error('updateCycle: no eres el dueño de este ciclo');
  const { id: _i, userId: _u, logs: _l, createdAt: _ca, ...rest } = patch;
  // Si se edita la composición, normaliza a slots y deriva workoutIds (legacy).
  if (Array.isArray(rest.slots)) {
    rest.slots = buildSlots(rest.slots.map((s: any) => ({ workoutId: s.workoutId, weight: s.weight, id: s.id })));
    rest.workoutIds = rest.slots.map((s: any) => s.workoutId);
  } else if (Array.isArray(rest.workoutIds)) {
    rest.slots = buildSlots(rest.workoutIds.map((wid: string) => ({ workoutId: wid })));
  }
  await ref.update(clean(rest));
  return { id, ...(snap.data() as any), ...rest };
}

// Id de log determinista, gemelo de services/db.ts. En circuito = slotId (permite
// repetir un workout); en libre = workoutId__fecha.
function logDocId(workoutId: string, date: string, isStandalone: boolean, slotId?: string): string {
  const stamp = String(date).replace(/[^0-9A-Za-z]/g, '');
  return isStandalone ? `${workoutId}__${stamp}` : (slotId || workoutId);
}

async function logSession(uid: string, data: any) {
  const db = getDb();
  const cycleId: string = data.cycleId;
  if (!cycleId) throw new Error('logSession: falta "cycleId"');
  if (!data.workoutId) throw new Error('logSession: falta "workoutId"');
  const cycleRef = db.collection('cycles').doc(cycleId);
  const cycleSnap = await cycleRef.get();
  if (!cycleSnap.exists) throw new Error(`logSession: no existe ciclo ${cycleId}`);
  const cycle = cycleSnap.data() as any;
  if (cycle.userId !== uid) throw new Error('logSession: no eres el dueño de este ciclo');
  const isStandalone = cycle.type === 'standalone';
  const slotId = isStandalone ? undefined : resolveCircuitSlotId(cycle, data);
  const now = new Date();
  const log = clean({
    workoutId: data.workoutId,
    slotId, // identidad de la aparición (circuito)
    date: data.date ?? now.toISOString().slice(0, 10),
    time: data.time ?? now.toTimeString().slice(0, 5),
    weight: data.weight, // peso REAL usado (autoritativo en historial)
    weightCount: typeof data.weightCount === 'number' ? data.weightCount : undefined,
    statsImages: Array.isArray(data.statsImages)
      ? data.statsImages.filter((s: any) => typeof s === 'string' && s.startsWith('http'))
      : [],
    progressiveOverload: data.progressiveOverload ?? '',
    comments: data.comments ?? '',
    completed: data.completed !== false,
    rpe: typeof data.rpe === 'number' ? data.rpe : undefined,
    aiAnalysisText: data.aiAnalysisText,
  });
  await cycleRef.collection('logs').doc(logDocId(log.workoutId, log.date, isStandalone, slotId)).set(log);
  return { cycleId, log };
}

// Actualiza (merge) un log de sesión existente, sin duplicar. Identifica el log
// por slotId (circuito) o workoutId+date (standalone).
async function updateLog(uid: string, data: any) {
  const db = getDb();
  const cycleId: string = data.cycleId;
  if (!cycleId) throw new Error('updateLog: falta "cycleId"');
  const cycleRef = db.collection('cycles').doc(cycleId);
  const cycleSnap = await cycleRef.get();
  if (!cycleSnap.exists) throw new Error(`updateLog: no existe ciclo ${cycleId}`);
  const cycle = cycleSnap.data() as any;
  if (cycle.userId !== uid) throw new Error('updateLog: no eres el dueño de este ciclo');
  const isStandalone = cycle.type === 'standalone';

  let docId: string;
  if (isStandalone) {
    if (!data.workoutId || !data.date) throw new Error('updateLog (standalone): requiere workoutId y date');
    docId = logDocId(data.workoutId, data.date, true);
  } else {
    const slotId = resolveCircuitSlotId(cycle, data);
    docId = logDocId(data.workoutId || slotId, data.date || '', false, slotId);
  }
  const ref = cycleRef.collection('logs').doc(docId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`updateLog: no existe el log ${docId} en el ciclo (usa get_history/list_cycles para ubicarlo)`);

  // Solo campos editables; merge para no perder lo demás.
  const patch = clean({
    weight: data.weight,
    weightCount: typeof data.weightCount === 'number' ? data.weightCount : undefined,
    progressiveOverload: data.progressiveOverload,
    comments: data.comments,
    rpe: typeof data.rpe === 'number' ? data.rpe : undefined,
    completed: typeof data.completed === 'boolean' ? data.completed : undefined,
    date: isStandalone ? undefined : data.date, // en standalone la fecha define el id; no se cambia aquí
    aiAnalysisText: data.aiAnalysisText,
  });
  await ref.set(patch, { merge: true });
  return { cycleId, logId: docId, patched: patch };
}

async function getHistory(uid: string, opts: any = {}) {
  const db = getDb();
  const cyclesSnap = await db.collection('cycles').where('userId', '==', uid).get();
  const rows: any[] = [];
  await Promise.all(cyclesSnap.docs.map(async (c: any) => {
    const cyc = c.data() as any;
    const isStandalone = (cyc.type ?? 'circuit') === 'standalone';
    const logs = await db.collection('cycles').doc(c.id).collection('logs').get();
    logs.docs.forEach((l: any) => {
      const log = l.data() as any;
      if (opts.onlyCompleted !== false && !log.completed) return;
      if (opts.sinceDate && String(log.date) < opts.sinceDate) return;
      rows.push({
        cycleId: c.id,
        cycleName: cyc.name,
        cycleType: cyc.type ?? 'circuit',
        slotId: isStandalone ? undefined : (log.slotId || l.id), // identidad de aparición
        logId: l.id,
        ...log,
      });
    });
  }));
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.time).localeCompare(String(a.time)));
  return typeof opts.limit === 'number' ? rows.slice(0, opts.limit) : rows;
}

// ---------------------------------------------------------------------------
// Definición de tools (JSON Schema)
// ---------------------------------------------------------------------------

// Guía de formato para el campo `description` del workout. La app muestra este
// texto tal cual (con saltos de línea), así que debe contener el workout COMPLETO
// y legible, no un resumen.
const WORKOUT_DESCRIPTION_GUIDE =
  'Descripción COMPLETA y legible del workout, tal como se lee dentro de la app ' +
  '(respeta los saltos de línea con \\n). NO es un resumen: debe alcanzar para ' +
  'entrenarlo sin más contexto. Estructura obligatoria:\n' +
  '1) Primera línea: número de rounds/series o el esquema (ej. "5 rounds", "EMOM 20 min", "AMRAP 15 min").\n' +
  '2) Línea en blanco, luego un ejercicio por línea con formato "Ejercicio — reps/lado o detalle" ' +
  '(ej. "Halo — 3 por dirección", "Lateral snatch — 3/lado").\n' +
  '3) Línea en blanco y la intención/ejecución (cómo debe sentirse, transiciones, respiración, técnica).\n' +
  '4) Línea final de intensidad objetivo (ej. "Intensidad: RPE ~4–5/10, idealmente Z1–Z2").\n' +
  'Ejemplo:\n\n' +
  '5 rounds\n\n' +
  'Halo — 3 por dirección\n' +
  'Clean con rotación — 3/lado\n' +
  'Lateral snatch — 3/lado\n' +
  'Reverse lunge + rotación — 3/lado\n' +
  'Windmill — 3/lado\n' +
  'Suitcase carry — 30–40 s/lado\n\n' +
  'La intención es que cada round sea un flow continuo pero relajado. Transiciones ' +
  'deliberadas, respiración controlada y técnica limpia. Nada de perseguir tiempos.\n\n' +
  'Intensidad: RPE ~4–5/10. Si empiezas a jadear o los cleans/snatches se vuelven ' +
  'trabajo metabólico, baja peso o descansa. La mayor parte debería sentirse Z1–Z2.';

const TOOLS = [
  {
    name: 'list_workouts',
    description: 'Lista los workouts (ejercicios) de la base de datos de Bellforce. Devuelve públicos y propios. Úsalo para consultar qué ejercicios existen antes de crear un circuito o registrar una sesión.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['all', 'mine', 'public'], description: 'all (default), solo míos, o solo públicos' },
        includeArchived: { type: 'boolean', description: 'incluir archivados (default false)' },
      },
    },
  },
  {
    name: 'create_workout',
    description: 'Crea un nuevo workout (ejercicio) en la base de datos de Bellforce. Queda privado del usuario salvo que isPublic sea true.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
        weight: { type: 'string', description: 'peso SUGERIDO/referencia por pesa, ej. "24 kg" (el peso real se registra al completar la sesión, no aquí)' },
        weightCount: { type: 'number', description: '1 (default) o 2 (doble pesa)' },
        type: { type: 'string', description: 'tipo de ejercicio, ej. "fuerza", "potencia"' },
        equipment: { type: 'array', items: { type: 'string', enum: ['kettlebell', 'dumbbell', 'barbell'] } },
        duration: { type: 'string', description: 'ej. "10 min" o "5 rondas"' },
        description: { type: 'string', description: WORKOUT_DESCRIPTION_GUIDE },
        isPublic: { type: 'boolean' },
      },
    },
  },
  {
    name: 'update_workout',
    description: 'Actualiza campos de un workout existente (solo si eres el dueño). Pasa únicamente los campos a cambiar.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        weight: { type: 'string' },
        weightCount: { type: 'number' },
        type: { type: 'string' },
        equipment: { type: 'array', items: { type: 'string', enum: ['kettlebell', 'dumbbell', 'barbell'] } },
        duration: { type: 'string' },
        description: { type: 'string', description: WORKOUT_DESCRIPTION_GUIDE },
        isArchived: { type: 'boolean' },
      },
    },
  },
  {
    name: 'delete_workout',
    description: 'Borra un workout propio de la base de datos por id. No puede borrar workouts públicos/globales (seed).',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' } },
    },
  },
  {
    name: 'list_cycles',
    description: 'Lista los ciclos (circuitos) del usuario. Opcionalmente incluye los logs de cada ciclo.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'paused', 'completed'] },
        includeArchived: { type: 'boolean' },
        withLogs: { type: 'boolean', description: 'incluir las sesiones registradas de cada ciclo' },
      },
    },
  },
  {
    name: 'create_cycle',
    description: 'Crea un ciclo/circuito nuevo. Un circuito es una lista ORDENADA de apariciones (slots): el MISMO workout puede aparecer varias veces (ej. Strength A en dos momentos del ciclo), cada aparición se entrena y registra por separado. Usa `slots` para controlar orden/repeticiones/peso planeado; o `workoutIds` (los repetidos se permiten).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        startDate: { type: 'string', description: 'YYYY-MM-DD (default hoy)' },
        endDate: { type: 'string', description: 'YYYY-MM-DD' },
        status: { type: 'string', enum: ['active', 'paused', 'completed'] },
        type: { type: 'string', enum: ['circuit', 'standalone'] },
        slots: {
          type: 'array',
          description: 'apariciones en orden; repite el mismo workoutId cuantas veces quieras. weight = peso PLANEADO/sugerido de esa aparición (opcional; el peso real se registra al completar).',
          items: {
            type: 'object',
            required: ['workoutId'],
            properties: {
              workoutId: { type: 'string' },
              weight: { type: 'string', description: 'peso planeado de esta aparición, ej. "2×18 kg"' },
            },
          },
        },
        workoutIds: { type: 'array', items: { type: 'string' }, description: 'alternativa simple a slots (se permiten ids repetidos, en orden)' },
        workoutWeights: { type: 'object', description: 'legacy: mapa workoutId -> peso planeado' },
        saveAsTemplate: { type: 'boolean', description: 'default true: además del ciclo, crea una plantilla espejo para que aparezca en Database→Circuitos' },
      },
    },
  },
  {
    name: 'create_template',
    description: 'Crea una plantilla de circuito (aparece en Database→Circuitos de la app). Una plantilla es una definición reutilizable: nombre + lista de workoutIds. Distinta de un ciclo activo (create_cycle).',
    inputSchema: {
      type: 'object',
      required: ['name', 'workoutIds'],
      properties: {
        name: { type: 'string' },
        workoutIds: { type: 'array', items: { type: 'string' } },
        isPublic: { type: 'boolean', description: 'default false (privada del usuario)' },
      },
    },
  },
  {
    name: 'update_cycle',
    description: 'Actualiza un ciclo existente (solo si eres el dueño): cambiar estado, fechas, nombre, archivar, etc.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        status: { type: 'string', enum: ['active', 'paused', 'completed'] },
        endDate: { type: 'string' },
        isArchived: { type: 'boolean' },
        workoutIds: { type: 'array', items: { type: 'string' }, description: 'reordena/edita la composición (se permiten repetidos)' },
        slots: {
          type: 'array',
          description: 'composición por aparición (con orden y peso planeado). Reemplaza workoutIds si se pasa.',
          items: { type: 'object', required: ['workoutId'], properties: { workoutId: { type: 'string' }, weight: { type: 'string' }, id: { type: 'string' } } },
        },
      },
    },
  },
  {
    name: 'log_session',
    description: 'Registra una sesión COMPLETADA en el historial, dentro de un ciclo. El peso REAL usado se guarda aquí (no en el workout). Si un workout aparece varias veces en el circuito, pasa slotId (de list_cycles) para indicar QUÉ aparición registras.',
    inputSchema: {
      type: 'object',
      required: ['cycleId', 'workoutId'],
      properties: {
        cycleId: { type: 'string' },
        workoutId: { type: 'string' },
        slotId: { type: 'string', description: 'aparición específica dentro del circuito (obligatorio si el workout se repite en el ciclo; usa list_cycles para verlos)' },
        weight: { type: 'string', description: 'peso REAL usado esa sesión, ej. "2×18 kg" o "24 kg"' },
        weightCount: { type: 'number', description: 'número de pesas usado (1 o 2)' },
        date: { type: 'string', description: 'YYYY-MM-DD (default hoy)' },
        time: { type: 'string', description: 'HH:MM (default ahora)' },
        progressiveOverload: { type: 'string', description: 'qué progresión se hizo respecto a la exposición anterior (variable que se avanza)' },
        comments: { type: 'string', description: 'qué ocurrió ese día: sensaciones, Garmin, DOMS, modificaciones' },
        rpe: { type: 'number', description: 'esfuerzo percibido 1-10' },
        completed: { type: 'boolean', description: 'default true' },
      },
    },
  },
  {
    name: 'update_log',
    description: 'Actualiza (merge, sin duplicar) una sesión YA registrada. Úsalo para corregir/normalizar logs existentes (ej. separar bien comments vs progressiveOverload, o fijar el peso real). En circuito identifica por slotId (o workoutId si no se repite); en libre por workoutId + date.',
    inputSchema: {
      type: 'object',
      required: ['cycleId'],
      properties: {
        cycleId: { type: 'string' },
        workoutId: { type: 'string' },
        slotId: { type: 'string', description: 'aparición a editar (circuito con repetidos)' },
        date: { type: 'string', description: 'YYYY-MM-DD (requerido en ciclos libres/standalone para ubicar el log)' },
        weight: { type: 'string', description: 'peso real usado' },
        weightCount: { type: 'number' },
        progressiveOverload: { type: 'string' },
        comments: { type: 'string' },
        rpe: { type: 'number' },
        completed: { type: 'boolean' },
      },
    },
  },
  {
    name: 'get_history',
    description: 'Devuelve el historial de sesiones completadas del usuario (a través de todos sus ciclos), más recientes primero. Cada fila trae slotId (aparición) y weight (peso real usado). Úsalo para entender el progreso reciente.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'máximo de sesiones a devolver' },
        sinceDate: { type: 'string', description: 'solo desde esta fecha YYYY-MM-DD' },
      },
    },
  },
];

async function dispatch(uid: string, name: string, args: any) {
  switch (name) {
    case 'list_workouts': return listWorkouts(uid, args || {});
    case 'create_workout': return createWorkout(uid, args || {});
    case 'update_workout': return updateWorkout(uid, args.id, args || {});
    case 'delete_workout': return deleteWorkout(uid, args.id);
    case 'list_cycles': return listCycles(uid, args || {});
    case 'create_cycle': return createCycle(uid, args || {});
    case 'create_template': return createTemplate(uid, args || {});
    case 'update_cycle': return updateCycle(uid, args.id, args || {});
    case 'log_session': return logSession(uid, args || {});
    case 'update_log': return updateLog(uid, args || {});
    case 'get_history': return getHistory(uid, args || {});
    default: throw new Error(`Tool desconocida: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Handler MCP (JSON-RPC 2.0 sobre HTTP, transporte Streamable HTTP)
// ---------------------------------------------------------------------------
export default async function handler(req: any, res: any) {
  const key = req.query?.key;
  const expected = process.env.MCP_SECRET;
  if (!expected || key !== expected) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const uid = process.env.BELLFORCE_OWNER_UID;
  if (!uid) {
    res.status(500).json({ error: 'BELLFORCE_OWNER_UID no configurada' });
    return;
  }

  const body = req.body || {};
  const { id, method, params } = body;
  const rpc = (result: any) => res.status(200).json({ jsonrpc: '2.0', id, result });
  const rpcErr = (code: number, message: string) =>
    res.status(200).json({ jsonrpc: '2.0', id, error: { code, message } });

  try {
    switch (method) {
      case 'initialize':
        return rpc({
          protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'bellforce', version: '1.0.0' },
        });

      case 'notifications/initialized':
      case 'notifications/cancelled':
        res.status(202).end();
        return;

      case 'ping':
        return rpc({});

      case 'tools/list':
        return rpc({ tools: TOOLS });

      case 'tools/call': {
        const toolName = params?.name;
        const args = params?.arguments || {};
        try {
          const data = await dispatch(uid, toolName, args);
          return rpc({
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            structuredContent: { result: data },
          });
        } catch (toolErr: any) {
          return rpc({
            content: [{ type: 'text', text: `Error: ${toolErr?.message || String(toolErr)}` }],
            isError: true,
          });
        }
      }

      default:
        return rpcErr(-32601, `Método no soportado: ${method}`);
    }
  } catch (e: any) {
    console.error('MCP handler error:', e);
    return rpcErr(-32603, e?.message || String(e));
  }
}

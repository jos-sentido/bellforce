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

async function listCycles(uid: string, opts: any = {}) {
  const db = getDb();
  const snap = await db.collection('cycles').where('userId', '==', uid).get();
  let cycles = await Promise.all(snap.docs.map(async (d: any) => {
    const base: any = { id: d.id, ...d.data() };
    if (opts.withLogs) {
      const logs = await db.collection('cycles').doc(d.id).collection('logs').get();
      base.logs = logs.docs.map((l: any) => l.data());
    }
    return base;
  }));
  if (opts.status) cycles = cycles.filter(c => c.status === opts.status);
  if (!opts.includeArchived) cycles = cycles.filter(c => !c.isArchived);
  return cycles;
}

async function createCycle(uid: string, data: any) {
  const db = getDb();
  const payload = clean({
    userId: uid,
    name: data.name ?? 'Circuito',
    startDate: data.startDate ?? new Date().toISOString().slice(0, 10),
    endDate: data.endDate,
    status: data.status ?? 'active',
    type: data.type ?? 'circuit',
    workoutIds: Array.isArray(data.workoutIds) ? data.workoutIds : undefined,
    workoutWeights: data.workoutWeights,
    createdAt: FieldValue.serverTimestamp(),
  });
  const ref = await db.collection('cycles').add(payload);
  return { id: ref.id, ...payload, createdAt: undefined };
}

async function updateCycle(uid: string, id: string, patch: any) {
  const db = getDb();
  const ref = db.collection('cycles').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`updateCycle: no existe ciclo ${id}`);
  if ((snap.data() as any).userId !== uid) throw new Error('updateCycle: no eres el dueño de este ciclo');
  const { id: _i, userId: _u, logs: _l, createdAt: _ca, ...rest } = patch;
  await ref.update(clean(rest));
  return { id, ...(snap.data() as any), ...rest };
}

// Id de log determinista, igual que services/db.ts.
function logDocId(workoutId: string, date: string, isStandalone: boolean): string {
  const stamp = String(date).replace(/[^0-9A-Za-z]/g, '');
  return isStandalone ? `${workoutId}__${stamp}` : workoutId;
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
  const now = new Date();
  const log = clean({
    workoutId: data.workoutId,
    date: data.date ?? now.toISOString().slice(0, 10),
    time: data.time ?? now.toTimeString().slice(0, 5),
    statsImages: Array.isArray(data.statsImages)
      ? data.statsImages.filter((s: any) => typeof s === 'string' && s.startsWith('http'))
      : [],
    progressiveOverload: data.progressiveOverload ?? '',
    comments: data.comments ?? '',
    completed: data.completed !== false,
    rpe: typeof data.rpe === 'number' ? data.rpe : undefined,
    aiAnalysisText: data.aiAnalysisText,
  });
  await cycleRef.collection('logs').doc(logDocId(log.workoutId, log.date, isStandalone)).set(log);
  return { cycleId, log };
}

async function getHistory(uid: string, opts: any = {}) {
  const db = getDb();
  const cyclesSnap = await db.collection('cycles').where('userId', '==', uid).get();
  const rows: any[] = [];
  await Promise.all(cyclesSnap.docs.map(async (c: any) => {
    const cyc = c.data() as any;
    const logs = await db.collection('cycles').doc(c.id).collection('logs').get();
    logs.docs.forEach((l: any) => {
      const log = l.data() as any;
      if (opts.onlyCompleted !== false && !log.completed) return;
      if (opts.sinceDate && String(log.date) < opts.sinceDate) return;
      rows.push({ cycleId: c.id, cycleName: cyc.name, cycleType: cyc.type ?? 'circuit', ...log });
    });
  }));
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.time).localeCompare(String(a.time)));
  return typeof opts.limit === 'number' ? rows.slice(0, opts.limit) : rows;
}

// ---------------------------------------------------------------------------
// Definición de tools (JSON Schema)
// ---------------------------------------------------------------------------
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
        weight: { type: 'string', description: 'peso POR pesa, ej. "24 kg"' },
        weightCount: { type: 'number', description: '1 (default) o 2 (doble pesa)' },
        type: { type: 'string', description: 'tipo de ejercicio, ej. "fuerza", "potencia"' },
        equipment: { type: 'array', items: { type: 'string', enum: ['kettlebell', 'dumbbell', 'barbell'] } },
        duration: { type: 'string', description: 'ej. "10 min" o "5 rondas"' },
        description: { type: 'string' },
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
        description: { type: 'string' },
        isArchived: { type: 'boolean' },
      },
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
    description: 'Crea un ciclo/circuito nuevo para el usuario, opcionalmente con la lista de workoutIds que lo componen.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        startDate: { type: 'string', description: 'YYYY-MM-DD (default hoy)' },
        endDate: { type: 'string', description: 'YYYY-MM-DD' },
        status: { type: 'string', enum: ['active', 'paused', 'completed'] },
        type: { type: 'string', enum: ['circuit', 'standalone'] },
        workoutIds: { type: 'array', items: { type: 'string' } },
        workoutWeights: { type: 'object', description: 'mapa workoutId -> peso override, ej. {"3":"28 kg"}' },
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
        workoutIds: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'log_session',
    description: 'Registra una sesión de entrenamiento completada en el historial, dentro de un ciclo. Requiere cycleId y workoutId. Usa list_cycles para obtener el cycleId.',
    inputSchema: {
      type: 'object',
      required: ['cycleId', 'workoutId'],
      properties: {
        cycleId: { type: 'string' },
        workoutId: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD (default hoy)' },
        time: { type: 'string', description: 'HH:MM (default ahora)' },
        progressiveOverload: { type: 'string', description: 'qué progresión se hizo (peso/reps/series)' },
        comments: { type: 'string', description: 'cómo se sintió, notas de la sesión' },
        rpe: { type: 'number', description: 'esfuerzo percibido 1-10' },
        completed: { type: 'boolean', description: 'default true' },
      },
    },
  },
  {
    name: 'get_history',
    description: 'Devuelve el historial de sesiones completadas del usuario (a través de todos sus ciclos), más recientes primero. Úsalo para entender el progreso reciente.',
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
    case 'list_cycles': return listCycles(uid, args || {});
    case 'create_cycle': return createCycle(uid, args || {});
    case 'update_cycle': return updateCycle(uid, args.id, args || {});
    case 'log_session': return logSession(uid, args || {});
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

// ============================================================================
// Capa de acciones del MCP de Bellforce (server-side, Firebase Admin).
// ----------------------------------------------------------------------------
// A diferencia de services/db.ts (SDK de cliente, corre en el navegador con el
// usuario logueado), esto corre en una función serverless SIN navegador, así que
// usa el Admin SDK con una service account. Las reglas de Firestore NO aplican
// aquí (Admin las salta), por eso CADA acción valida propiedad contra `uid`.
//
// Esta capa es agnóstica del transporte: la consume el endpoint MCP hoy, y podrá
// consumirla el agente interno de la app mañana.
// ============================================================================

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Firestore } from 'firebase-admin/firestore';

let _db: Firestore | null = null;
function getDb(): Firestore {
  if (_db) return _db;
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada en el servidor');
    const sa = JSON.parse(raw);
    // La private_key suele venir con \n escapados al pegarla como env var.
    if (sa.private_key) sa.private_key = String(sa.private_key).replace(/\\n/g, '\n');
    initializeApp({ credential: cert(sa) });
  }
  _db = getFirestore();
  return _db;
}

const clean = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

// ---------------------------------------------------------------------------
// WORKOUTS (la "DB" de ejercicios)
// ---------------------------------------------------------------------------
export async function listWorkouts(
  uid: string,
  opts: { scope?: 'all' | 'mine' | 'public'; includeArchived?: boolean } = {},
) {
  const db = getDb();
  const col = db.collection('workouts');
  const scope = opts.scope || 'all';

  const snaps = [];
  if (scope === 'all' || scope === 'public') snaps.push(col.where('isPublic', '==', true).get());
  if (scope === 'all' || scope === 'mine') snaps.push(col.where('createdBy', '==', uid).get());
  const results = await Promise.all(snaps);

  const map = new Map<string, any>();
  results.forEach(s => s.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() })));
  let items = Array.from(map.values());
  if (!opts.includeArchived) items = items.filter(w => !w.isArchived);
  return items;
}

export async function createWorkout(uid: string, data: Record<string, any>) {
  const db = getDb();
  const payload = clean({
    name: data.name,
    weight: data.weight ?? '',
    weightCount: data.weightCount,
    type: data.type ?? '',
    equipment: Array.isArray(data.equipment) ? data.equipment : undefined,
    duration: data.duration ?? '',
    description: data.description ?? '',
    isPublic: data.isPublic === true, // por defecto privado del usuario
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  if (!payload.name) throw new Error('createWorkout: falta "name"');
  const ref = await db.collection('workouts').add(payload);
  return { id: ref.id, ...payload, createdAt: undefined };
}

export async function updateWorkout(uid: string, id: string, patch: Record<string, any>) {
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

// ---------------------------------------------------------------------------
// CYCLES (circuitos activos / standalone) + LOGS (historial de sesiones)
// ---------------------------------------------------------------------------
export async function listCycles(
  uid: string,
  opts: { status?: 'active' | 'paused' | 'completed'; includeArchived?: boolean; withLogs?: boolean } = {},
) {
  const db = getDb();
  const snap = await db.collection('cycles').where('userId', '==', uid).get();
  let cycles = await Promise.all(snap.docs.map(async d => {
    const base: any = { id: d.id, ...d.data() };
    if (opts.withLogs) {
      const logs = await db.collection('cycles').doc(d.id).collection('logs').get();
      base.logs = logs.docs.map(l => l.data());
    }
    return base;
  }));
  if (opts.status) cycles = cycles.filter(c => c.status === opts.status);
  if (!opts.includeArchived) cycles = cycles.filter(c => !c.isArchived);
  return cycles;
}

export async function createCycle(uid: string, data: Record<string, any>) {
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

export async function updateCycle(uid: string, id: string, patch: Record<string, any>) {
  const db = getDb();
  const ref = db.collection('cycles').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`updateCycle: no existe ciclo ${id}`);
  if ((snap.data() as any).userId !== uid) throw new Error('updateCycle: no eres el dueño de este ciclo');
  const { id: _i, userId: _u, logs: _l, createdAt: _ca, ...rest } = patch;
  await ref.update(clean(rest));
  return { id, ...(snap.data() as any), ...rest };
}

// Id de log determinista, igual que en services/db.ts:
// circuito => 1 log por workout; libre (standalone) => 1 por workout+fecha.
function logDocId(workoutId: string, date: string, isStandalone: boolean): string {
  const stamp = String(date).replace(/[^0-9A-Za-z]/g, '');
  return isStandalone ? `${workoutId}__${stamp}` : workoutId;
}

export async function logSession(uid: string, data: Record<string, any>) {
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
    completed: data.completed !== false, // por defecto true
    rpe: typeof data.rpe === 'number' ? data.rpe : undefined,
    aiAnalysisText: data.aiAnalysisText,
  });
  await cycleRef.collection('logs').doc(logDocId(log.workoutId, log.date, isStandalone)).set(log);
  return { cycleId, log };
}

// Historial de sesiones completadas a través de TODOS los ciclos del usuario.
export async function getHistory(
  uid: string,
  opts: { limit?: number; sinceDate?: string; onlyCompleted?: boolean } = {},
) {
  const db = getDb();
  const cyclesSnap = await db.collection('cycles').where('userId', '==', uid).get();
  const rows: any[] = [];
  await Promise.all(cyclesSnap.docs.map(async c => {
    const cyc = c.data() as any;
    const logs = await db.collection('cycles').doc(c.id).collection('logs').get();
    logs.docs.forEach(l => {
      const log = l.data() as any;
      if (opts.onlyCompleted !== false && !log.completed) return;
      if (opts.sinceDate && String(log.date) < opts.sinceDate) return;
      rows.push({
        cycleId: c.id,
        cycleName: cyc.name,
        cycleType: cyc.type ?? 'circuit',
        ...log,
      });
    });
  }));
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.time).localeCompare(String(a.time)));
  return typeof opts.limit === 'number' ? rows.slice(0, opts.limit) : rows;
}

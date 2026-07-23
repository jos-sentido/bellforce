import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { Workout, CircuitTemplate, CircuitCycle, WorkoutLog } from '../types';

// ============================================================================
// Capa de datos Firestore. Colecciones:
//   workouts/{id}, templates/{id}, cycles/{id}, cycles/{id}/logs/{logId}
// Nota: las imágenes (statsImages, base64) NO se guardan en Firestore (límite
// de 1MB/doc). Se persistirán en Cloudinary en una fase posterior; por ahora
// se omiten al guardar y solo persiste el texto del análisis IA.
// ============================================================================

const clean = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

// ---------- WORKOUTS ----------
// "público OR mío": Firestore no permite OR en un query, así que hacemos 2 y unimos.
export async function loadWorkouts(uid: string): Promise<Workout[]> {
  const col = collection(db, 'workouts');
  const [pub, mine] = await Promise.all([
    getDocs(query(col, where('isPublic', '==', true))),
    getDocs(query(col, where('createdBy', '==', uid))),
  ]);
  const map = new Map<string, Workout>();
  [...pub.docs, ...mine.docs].forEach(d => map.set(d.id, { id: d.id, ...(d.data() as any) }));
  return Array.from(map.values());
}

export async function createWorkout(w: Omit<Workout, 'id'>): Promise<Workout> {
  const ref = await addDoc(collection(db, 'workouts'), clean({ ...w, createdAt: serverTimestamp() }));
  return { ...(w as any), id: ref.id };
}

export async function updateWorkout(w: Workout): Promise<void> {
  const { id, history, ...data } = w as any;
  await setDoc(doc(db, 'workouts', id), clean(data), { merge: true });
}

export async function deleteWorkout(id: string): Promise<void> {
  await deleteDoc(doc(db, 'workouts', id));
}

// ---------- TEMPLATES ----------
export async function loadTemplates(uid: string): Promise<CircuitTemplate[]> {
  const col = collection(db, 'templates');
  const [pub, mine] = await Promise.all([
    getDocs(query(col, where('isPublic', '==', true))),
    getDocs(query(col, where('createdBy', '==', uid))),
  ]);
  const map = new Map<string, CircuitTemplate>();
  [...pub.docs, ...mine.docs].forEach(d => map.set(d.id, { id: d.id, ...(d.data() as any) }));
  return Array.from(map.values());
}

export async function saveTemplate(t: CircuitTemplate): Promise<CircuitTemplate> {
  const { id, ...data } = t;
  if (id) {
    await setDoc(doc(db, 'templates', id), clean(data), { merge: true });
    return t;
  }
  const ref = await addDoc(collection(db, 'templates'), clean({ ...data, createdAt: serverTimestamp() }));
  return { ...t, id: ref.id };
}

export async function deleteTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, 'templates', id));
}

// ---------- CYCLES + LOGS ----------
export async function loadCycles(uid: string): Promise<CircuitCycle[]> {
  const snap = await getDocs(query(collection(db, 'cycles'), where('userId', '==', uid)));
  const cycles = await Promise.all(snap.docs.map(async cDoc => {
    const logsSnap = await getDocs(collection(db, 'cycles', cDoc.id, 'logs'));
    const logs = logsSnap.docs.map(l => l.data() as WorkoutLog);
    return { id: cDoc.id, ...(cDoc.data() as any), logs } as CircuitCycle;
  }));
  return cycles;
}

export async function createCycle(c: Omit<CircuitCycle, 'id'>): Promise<string> {
  const { logs, ...data } = c as any;
  const ref = await addDoc(collection(db, 'cycles'), clean({ ...data, createdAt: serverTimestamp() }));
  return ref.id;
}

export async function updateCycle(id: string, partial: Partial<CircuitCycle>): Promise<void> {
  const { logs, id: _ignore, ...data } = partial as any;
  await updateDoc(doc(db, 'cycles', id), clean(data));
}

// Id de log determinista: en circuito 1 log por workout; en libre 1 por workout+fecha.
function logDocId(log: WorkoutLog, isStandalone: boolean): string {
  const stamp = log.date.replace(/[^0-9A-Za-z]/g, '');
  return isStandalone ? `${log.workoutId}__${stamp}` : log.workoutId;
}

export async function saveLog(cycleId: string, log: WorkoutLog, isStandalone: boolean): Promise<void> {
  // Solo persistimos URLs de imágenes (Cloudinary). El base64 (si Cloudinary no
  // está configurado) se descarta para no exceder el límite de 1MB/doc.
  const urls = (log.statsImages || []).filter(s => typeof s === 'string' && s.startsWith('http'));
  const data = clean({ ...log, statsImages: urls });
  await setDoc(doc(db, 'cycles', cycleId, 'logs', logDocId(log, isStandalone)), data);
}

// ---------- SEED (por usuario) ----------
// Al entrar por primera vez, cada usuario recibe su propia copia de los 15
// workouts base + la plantilla original (privados). No requiere admin.
export async function seedForUser(baseWorkouts: Workout[], uid: string): Promise<void> {
  const batch = writeBatch(db);
  const ids: string[] = [];
  baseWorkouts.forEach(w => {
    const ref = doc(collection(db, 'workouts')); // id automático
    ids.push(ref.id);
    const { id, history, ...data } = w as any;
    batch.set(ref, clean({ ...data, createdBy: uid, isPublic: false, createdAt: serverTimestamp() }));
  });
  const tref = doc(collection(db, 'templates'));
  batch.set(tref, clean({
    name: 'Fusion Circuit Original',
    workoutIds: ids,
    createdBy: uid,
    isPublic: false,
    createdAt: serverTimestamp(),
  }));
  await batch.commit();
}


export type UserRole = 'admin' | 'user';

// Tipos de pesas que puede usar un workout. Un workout puede combinar varias (entrenamiento mixto).
export type EquipmentType = 'kettlebell' | 'dumbbell' | 'barbell' | 'rings';

// Conocimiento editable del coach (capa 2): los "documentos" tipo GPT.
export interface CoachKnowledge {
  profile: string;     // Perfil del atleta (objetivos, filosofía, restricciones)
  equipment: string;   // Equipo disponible
  philosophy: string;  // Filosofía de programación
  principles: string;  // Principios del atleta / qué NO hacer
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  joinedDate?: string;
  photoURL?: string;
  coachKnowledge?: CoachKnowledge; // capa 2 (editable en Ajustes)
  coachNotes?: string;             // capa 3: entendimiento acumulado (evoluciona)
}

export interface WorkoutHistoryEntry {
  weight: string;
  description: string;
  date: string;
}

// Elemento de medios (imagen o video) para el carrete estilo feed.
export interface MediaItem {
  type: 'image' | 'video';
  url: string;
}

export interface Workout {
  id: string;
  name: string;
  weight: string; // peso POR pesa (ej. "24 kg"); si son 2, es el peso de cada una
  weightCount?: number; // número de pesas: 1 (default) o 2 (doble); permite "2 × 24 kg"
  type: string;
  equipment?: EquipmentType[]; // pesas usadas: kettlebell, dumbbell, barbell (puede ser mixto)
  duration: string;
  description: string;
  media?: MediaItem[]; // carrete de videos/imágenes del workout (feed)
  history?: WorkoutHistoryEntry[];
  createdBy: string; // ID del usuario
  isPublic: boolean; // Si es visible para todos
  isArchived?: boolean; // archivado: oculto del listado por defecto
}

export interface WorkoutLog {
  workoutId: string;
  slotId?: string; // identidad de la APARICIÓN dentro del circuito (permite repetir un workout)
  date: string;
  time: string;
  weight?: string;       // peso REAL usado esa sesión (autoritativo en historial)
  weightCount?: number;  // número de pesas usado esa sesión (1 o 2)
  statsImages: string[];
  sessionMedia?: MediaItem[]; // videos/imágenes de la sesión registrada
  progressiveOverload: string;
  comments: string;
  completed: boolean;
  rpe?: number; // esfuerzo percibido de la sesión (1-10)
  aiAnalysisText?: string;
  isArchived?: boolean; // registro archivado: oculto del historial por defecto
}

// Serie temporal de salud: un doc por día (docId = fecha YYYY-MM-DD).
// bodyWeightKg es captura manual; el resto lo lee el coach de una foto de Garmin.
export interface DailyMetric {
  date: string; // YYYY-MM-DD
  bodyWeightKg?: number;
  hrv?: number;
  sleepHours?: number;
  trainingReadiness?: number;
  trainingLoad?: number;
  vo2max?: number;
  restingHR?: number;
  bodyBattery?: number;
  stress?: number;
  sourceImage?: string; // URL Cloudinary de la captura Garmin de origen
}

export type MissionCapacity = 'fuerza' | 'potencia' | 'recovery' | 'otro';
export type MissionStatus = 'active' | 'achieved' | 'abandoned';

// Misión con condición de victoria (bloques de 6-8 semanas).
export interface Mission {
  id: string;
  userId: string;
  title: string;
  capacity: MissionCapacity;
  victoryCondition: string;
  status: MissionStatus;
  startDate: string;
  achievedDate?: string;
  blockWeeks?: number;
  notes?: string;
}

// Mensaje de la conversación con el coach (memoria persistente).
export interface CoachMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string; // ISO
  imageRefs?: string[]; // URLs de imágenes adjuntas (p. ej. Garmin)
}

export interface CircuitTemplate {
  id: string;
  name: string;
  workoutIds: string[];
  createdBy: string;
  isPublic: boolean;
}

// Una APARICIÓN de un workout dentro de un circuito. Un mismo workoutId puede
// aparecer en varios slots (repetible, reordenable), cada uno con su propio
// registro de sesión y su propio peso.
export interface CircuitSlot {
  id: string;        // id estable de la aparición (1ra aparición: = workoutId; extras: workoutId__s2, __s3, …)
  workoutId: string; // referencia a la definición en la biblioteca (NO se duplica)
  weight?: string;   // peso por aparición (override); si falta, usa el del workout
}

export type CycleStatus = 'active' | 'paused' | 'completed';

export interface CircuitCycle {
  id: string;
  userId: string; // Dueño del ciclo
  name: string; 
  startDate: string;
  endDate?: string;
  logs: WorkoutLog[];
  status: CycleStatus;
  isArchived?: boolean;
  slots?: CircuitSlot[]; // fuente de verdad de composición/orden/peso por aparición
  workoutIds?: string[]; // legacy (ciclos viejos / compat de lectura); derivado de slots al guardar
  workoutWeights?: Record<string, string>; // legacy (peso por workoutId)
  type?: 'circuit' | 'standalone'; // Nueva propiedad
}

export interface AppState {
  currentUser: User | null;
  allUsers: User[]; // Base de datos global de usuarios
  library: Workout[];          
  templates: CircuitTemplate[]; 
  cycles: CircuitCycle[];
  currentCycleIndex: number;
}

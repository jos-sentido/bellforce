
export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  joinedDate?: string;
  photoURL?: string;
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
  weight: string;
  type: string;
  duration: string;
  description: string;
  media?: MediaItem[]; // carrete de videos/imágenes del workout (feed)
  history?: WorkoutHistoryEntry[];
  createdBy: string; // ID del usuario
  isPublic: boolean; // Si es visible para todos
}

export interface WorkoutLog {
  workoutId: string;
  date: string;
  time: string;
  statsImages: string[];
  sessionMedia?: MediaItem[]; // videos/imágenes de la sesión registrada
  progressiveOverload: string;
  comments: string;
  completed: boolean;
  aiAnalysisText?: string;
}

export interface CircuitTemplate {
  id: string;
  name: string;
  workoutIds: string[];
  createdBy: string;
  isPublic: boolean;
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
  workoutIds?: string[];
  workoutWeights?: Record<string, string>;
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

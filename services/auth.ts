import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { User } from '../types';

// Garantiza que exista el documento de perfil del usuario. Todos entran como
// 'user'; la promoción a 'admin' se hace desde la consola/CLI (ver reglas).
async function ensureProfile(fbUser: FirebaseUser, nameOverride?: string): Promise<User> {
  const ref = doc(db, 'profiles', fbUser.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();
    return {
      id: fbUser.uid,
      name: data.name || fbUser.displayName || '',
      email: data.email || fbUser.email || '',
      role: data.role === 'admin' ? 'admin' : 'user',
      joinedDate: data.joinedDate || undefined,
    };
  }

  const profile = {
    name: nameOverride || fbUser.displayName || (fbUser.email?.split('@')[0] ?? ''),
    email: fbUser.email || '',
    role: 'user' as const,
    joinedDate: new Date().toISOString(),
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, profile);
  return { id: fbUser.uid, name: profile.name, email: profile.email, role: 'user', joinedDate: profile.joinedDate };
}

export async function registerWithEmail(name: string, email: string, password: string): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (name) await updateProfile(cred.user, { displayName: name });
  return ensureProfile(cred.user, name);
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return ensureProfile(cred.user);
}

export async function loginWithGoogle(): Promise<User> {
  const cred = await signInWithPopup(auth, googleProvider);
  return ensureProfile(cred.user);
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

// Observa cambios de sesión (login/logout, refresh de token). Devuelve el
// unsubscribe. Entrega nuestro tipo User (con perfil) o null.
export function observeAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, async (fbUser) => {
    if (!fbUser) {
      callback(null);
      return;
    }
    try {
      const user = await ensureProfile(fbUser);
      callback(user);
    } catch (e) {
      console.error('[auth] error cargando perfil:', e);
      callback(null);
    }
  });
}

// Traduce códigos de error de Firebase Auth a mensajes en español.
export function authErrorMessage(code: string): string {
  const map: Record<string, string> = {
    'auth/invalid-email': 'El correo no es válido.',
    'auth/user-not-found': 'No existe una cuenta con ese correo.',
    'auth/wrong-password': 'Contraseña incorrecta.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Inicia sesión.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/popup-closed-by-user': 'Cerraste la ventana de Google antes de terminar.',
    'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes.',
    'auth/network-request-failed': 'Error de red. Revisa tu conexión.',
  };
  return map[code] || 'Ocurrió un error. Inténtalo de nuevo.';
}

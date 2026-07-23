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
import { User, UserRole } from '../types';

// Correos autorizados como administradores (debe coincidir con ownerEmails()
// en firestore.rules). El rol lo valida el servidor vía reglas.
const OWNER_EMAILS = ['alvarezcruzjoseantonio@gmail.com'];

function roleForEmail(email: string | null | undefined): UserRole {
  return email && OWNER_EMAILS.includes(email.toLowerCase()) ? 'admin' : 'user';
}

// Garantiza que exista el documento de perfil del usuario y que el owner
// quede como admin (auto-promoción permitida por reglas solo para OWNER_EMAILS).
async function ensureProfile(fbUser: FirebaseUser, nameOverride?: string): Promise<User> {
  const ref = doc(db, 'profiles', fbUser.uid);
  const snap = await getDoc(ref);
  const desiredRole = roleForEmail(fbUser.email);

  if (snap.exists()) {
    const data = snap.data();
    let role: UserRole = data.role === 'admin' ? 'admin' : 'user';
    // Promueve al owner si su perfil aún no es admin.
    if (desiredRole === 'admin' && role !== 'admin') {
      await setDoc(ref, { role: 'admin' }, { merge: true });
      role = 'admin';
    }
    return {
      id: fbUser.uid,
      name: data.name || fbUser.displayName || '',
      email: data.email || fbUser.email || '',
      role,
      joinedDate: data.joinedDate || undefined,
      photoURL: data.photoURL || fbUser.photoURL || undefined,
    };
  }

  const profile = {
    name: nameOverride || fbUser.displayName || (fbUser.email?.split('@')[0] ?? ''),
    email: fbUser.email || '',
    role: desiredRole,
    joinedDate: new Date().toISOString(),
    photoURL: fbUser.photoURL || '',
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, profile);
  return { id: fbUser.uid, name: profile.name, email: profile.email, role: desiredRole, joinedDate: profile.joinedDate, photoURL: profile.photoURL || undefined };
}

// Actualiza el perfil del usuario (nombre y/o foto) en Firestore y en Auth.
export async function updateUserProfile(uid: string, data: { name?: string; photoURL?: string }): Promise<void> {
  await setDoc(doc(db, 'profiles', uid), data, { merge: true });
  if (auth.currentUser) {
    await updateProfile(auth.currentUser, {
      ...(data.name !== undefined ? { displayName: data.name } : {}),
      ...(data.photoURL !== undefined ? { photoURL: data.photoURL } : {}),
    });
  }
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

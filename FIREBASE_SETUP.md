# Bellforce · Configuración de Firebase

Stack: **Vercel** (frontend) + **Firebase** (Auth + Firestore, plan gratis Spark) +
**Vercel Function** (proxy de Gemini) + **Cloudinary/Vercel Blob** (fotos).

Haz los pasos 1–4 y pásame el **config web** del Paso 3.

---

## Paso 1 · Crear el proyecto Firebase
1. Entra a https://console.firebase.google.com con tu cuenta Google.
2. **Add project** → nombre `bellforce` → puedes desactivar Google Analytics.
3. Espera a que se cree.

## Paso 2 · Activar Auth y Firestore
1. **Build → Authentication → Get started**.
   - Pestaña **Sign-in method** → habilita **Email/Password**.
   - Habilita también **Google** (elige tu email de soporte). Guarda.
2. **Build → Firestore Database → Create database**.
   - Modo **Production**. Región cercana (ej. `nam5` / us-central). Enable.
   - (Las reglas de seguridad las subo yo desde `firestore.rules`.)

## Paso 3 · Obtener el config web  ← **esto me pasas a mí**
1. **Project settings** (engrane, arriba a la izq.) → pestaña **General**.
2. Baja a **Your apps** → icono **Web** (`</>`) → registra la app (nombre
   `bellforce-web`, sin Hosting).
3. Copia el objeto `firebaseConfig` que aparece. Pégalo en `.env.local`:
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=bellforce-xxxx.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=bellforce-xxxx
   VITE_FIREBASE_STORAGE_BUCKET=bellforce-xxxx.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   ```
   > Este config es público y seguro en el cliente; la seguridad la dan las
   > reglas de Firestore (`firestore.rules`).

## Paso 4 · (Para que yo trabaje hands-on) Firebase CLI
Opcional pero recomendado para desplegar reglas y que yo opere el proyecto:
```bash
npm install -g firebase-tools
firebase login          # login interactivo (lo haces tú una vez)
firebase use --add      # elige el proyecto 'bellforce'
firebase deploy --only firestore:rules   # sube firestore.rules
```

---

## Qué hago yo después de tu Paso 3
- Refactor del login → **email+contraseña + Google** (Firebase Auth).
- Capa de datos: reemplazar localStorage por Firestore (perfiles, workouts,
  plantillas, ciclos, logs).
- Conectar `geminiService` a `/api/gemini` (proxy Vercel).
- Seed de los 15 workouts base + plantilla "Fusion Circuit Original".
- Fotos de sesión (definimos Cloudinary o Vercel Blob).
- Deploy en Vercel enlazado a tu repo GitHub (Fase 3).

## Variables en Vercel (para el deploy)
En Vercel → Project → Settings → Environment Variables:
- `GEMINI_API_KEY` (para `/api/gemini`)
- `VITE_FIREBASE_*` (las mismas 6 del config web)

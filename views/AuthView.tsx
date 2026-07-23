
import React, { useState } from 'react';
import { registerWithEmail, loginWithEmail, loginWithGoogle, authErrorMessage } from '../services/auth';

// El login ahora lo maneja Firebase Auth. Al autenticarse, el listener
// observeAuth() en App.tsx detecta la sesión y cambia de pantalla; por eso
// esta vista no necesita callbacks: solo dispara la acción y muestra estado.
const AuthView: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password || (mode === 'register' && !name)) {
      setError('Por favor llena todos los campos.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'register') {
        await registerWithEmail(name, email, password);
      } else {
        await loginWithEmail(email, password);
      }
      // observeAuth en App.tsx hace la transición.
    } catch (err: any) {
      setError(authErrorMessage(err?.code || ''));
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(authErrorMessage(err?.code || ''));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fdf6e3] flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
      <div className="mb-10 text-center">
        <svg className="w-20 h-20 mx-auto mb-4" viewBox="0 0 24 24" fill="none">
          <path d="M7 8V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V8H14V7C14 5.89543 13.1046 5 12 5C10.8954 5 10 5.89543 10 7V8H7Z" fill="black"/>
          <path d="M12 22C16.4183 22 20 18.4183 20 14C20 9.58172 16.4183 7 12 7C7.58172 7 4 9.58172 4 14C4 18.4183 7.58172 22 12 22Z" fill="black"/>
          <path d="M13 11L10 14.5H12.2L11.5 18.5L15 14.5H12.8L14.2 11Z" fill="white"/>
        </svg>
        <h1 className="font-heading text-5xl tracking-tighter leading-none mb-2 text-black">BELLFORCE</h1>
        <p className="font-bold text-[10px] uppercase tracking-[0.2em] text-gray-500">Kettlebell Evolution System</p>
      </div>

      <div className="w-full max-w-sm">
        <div className="flex mb-6 neo-brutalism no-click rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); }}
            className={`flex-1 p-3 text-[10px] font-black uppercase transition-colors ${mode === 'login' ? 'bg-black text-white' : 'bg-white text-black'}`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(''); }}
            className={`flex-1 p-3 text-[10px] font-black uppercase transition-colors ${mode === 'register' ? 'bg-black text-white' : 'bg-white text-black'}`}
          >
            Registrarse
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div className="space-y-1 animate-in slide-in-from-top-2">
              <label className="text-[10px] font-black uppercase ml-1">Tu Nombre</label>
              <input
                type="text"
                placeholder="Jos Alvarez"
                className="w-full p-4 neo-brutalism bg-white rounded-xl focus:outline-none border-black text-black font-bold"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={loading}
              />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase ml-1">Email</label>
            <input
              type="email"
              placeholder="tu@email.com"
              className="w-full p-4 neo-brutalism bg-white rounded-xl focus:outline-none border-black text-black font-bold"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase ml-1">Contraseña</label>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full p-4 neo-brutalism bg-white rounded-xl focus:outline-none border-black text-black font-bold"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
            />
            {mode === 'register' && <p className="text-[9px] text-gray-400 font-bold ml-1">Mínimo 6 caracteres.</p>}
          </div>

          {error && <p className="text-red-600 text-[10px] font-bold uppercase text-center animate-pulse">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full neo-brutalism bg-[#ebca7a] p-5 rounded-xl font-heading text-xl uppercase tracking-tighter hover:bg-[#d8b86a] active:scale-95 mt-2 border-black text-black disabled:opacity-60"
          >
            {loading ? 'Un momento…' : mode === 'login' ? 'Acceder' : 'Crear cuenta'}
          </button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-0.5 bg-black/10" />
          <span className="text-[9px] font-black uppercase text-gray-400">o</span>
          <div className="flex-1 h-0.5 bg-black/10" />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="w-full neo-brutalism bg-white p-4 rounded-xl font-heading text-xs uppercase border-black flex items-center justify-center gap-3 active:scale-95 disabled:opacity-60"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continuar con Google
        </button>
      </div>
    </div>
  );
};

export default AuthView;

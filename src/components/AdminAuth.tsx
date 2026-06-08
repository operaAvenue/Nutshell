import { useState } from 'react';
import { Lock, Unlock, ArrowRight } from 'lucide-react';
import AdminDashboard from './AdminDashboard';

export default function AdminAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Check localStorage on mount
  useState(() => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      // Typically we would validate the token with the backend here, 
      // but for simplicity we assume if it's there, we show the dashboard
      // The dashboard API calls will fail if the token is wrong.
      setIsAuthenticated(true);
    }
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const hostname = window.location.hostname === 'localhost' ? '192.168.1.145' : window.location.hostname;
      const res = await fetch(`http://${hostname}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass: password })
      });

      const data = await res.json();
      
      if (res.ok && data.status === 'success') {
        localStorage.setItem('adminToken', data.token);
        setIsAuthenticated(true);
      } else {
        setError(data.error || 'Senha incorreta');
      }
    } catch (err) {
      setError('Erro de conexão com o ESP32');
    } finally {
      setIsLoading(false);
    }
  };

  if (isAuthenticated) {
    return <AdminDashboard />;
  }

  return (
    <div className="min-h-screen bg-[#0B0C10] flex items-center justify-center p-4">
      <div className="bg-[#12141C] border border-white/5 p-8 rounded-3xl w-full max-w-sm shadow-2xl relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl" />
        
        <div className="relative z-10 flex flex-col items-center">
          <div className="w-16 h-16 bg-[#1A1D27] rounded-2xl border border-white/10 flex items-center justify-center mb-6 shadow-inner">
            <Lock className="w-8 h-8 text-cyan-500" />
          </div>
          
          <h1 className="text-xl font-bold tracking-tight text-white mb-2 font-sans text-center">
            Acesso Restrito
          </h1>
          <p className="text-slate-400 text-xs text-center mb-8">
            Insira a senha de administrador para configurar o openAgro.ai
          </p>

          <form onSubmit={handleLogin} className="w-full flex flex-col gap-4">
            <div>
              <input 
                type="password"
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0B0C10] border border-white/5 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-colors"
                autoFocus
              />
            </div>
            
            {error && (
              <p className="text-red-400 text-[10px] uppercase font-bold text-center tracking-wider">{error}</p>
            )}

            <button 
              type="submit"
              disabled={isLoading || !password}
              className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)]"
            >
              {isLoading ? (
                <span className="animate-pulse">Autenticando...</span>
              ) : (
                <>
                  Entrar
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <a href="#/" className="text-slate-500 hover:text-cyan-400 text-xs mt-6 transition-colors">
            Voltar para a Dashboard Principal
          </a>
        </div>
      </div>
    </div>
  );
}

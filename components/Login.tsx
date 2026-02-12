
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { cloudService } from '../services/cloudService';

interface LoginProps {
  onLogin: (userData: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const savedLogin = localStorage.getItem('lifesafe_remembered_login');
    const savedPassword = localStorage.getItem('lifesafe_remembered_password');
    if (savedLogin && savedPassword && !isRegisterMode) {
      setLoginId(savedLogin);
      setPassword(savedPassword);
      setRememberMe(true);
    }
  }, [isRegisterMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      if (isRegisterMode) {
        if (!loginId || !password || !fullName || !role) throw new Error('Todos os campos são obrigatórios.');
        if (password !== confirmPassword) throw new Error('As senhas não coincidem.');
        
        await cloudService.register({ loginId, name: fullName, role, pass: password });
        setSuccessMsg('Solicitação enviada com sucesso! Aguarde a aprovação do administrador.');
        
        // Limpa campos e volta para login após 3 segundos
        setTimeout(() => {
          setIsRegisterMode(false);
          setSuccessMsg('');
          setLoginId('');
          setPassword('');
        }, 4000);
      } else {
        const userData = await cloudService.login(loginId, password);
        if (rememberMe) {
          localStorage.setItem('lifesafe_remembered_login', loginId);
          localStorage.setItem('lifesafe_remembered_password', password);
        } else {
          localStorage.removeItem('lifesafe_remembered_login');
          localStorage.removeItem('lifesafe_remembered_password');
        }
        onLogin(userData);
      }
    } catch (err: any) {
      setError(err.message || "Erro de conexão com o servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-10 px-6 bg-[#f8fafc] min-h-screen">
      <div className="w-full max-w-md bg-white rounded-[40px] shadow-2xl shadow-slate-200/50 p-10 border border-slate-100 animate-in fade-in duration-500">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#f1f5f9] rounded-2xl mb-4 relative overflow-hidden">
            <i className={`fa-solid ${isRegisterMode ? 'fa-cloud-arrow-up text-blue-600' : 'fa-shield-halved text-blue-600'} text-3xl transition-all`}></i>
            {isLoading && (
              <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                <i className="fa-solid fa-spinner animate-spin text-blue-600"></i>
              </div>
            )}
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-1 tracking-tight uppercase">
            {isRegisterMode ? 'CADASTRO DE USUÁRIO' : 'LIFEBOAT MUSTER'}
          </h2>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">
            {isRegisterMode ? 'SOLICITAÇÃO DE ACESSO' : 'SISTEMA DE GERENCIAMENTO'}
          </p>
        </div>

        {successMsg ? (
          <div className="bg-blue-50 border border-blue-100 p-6 rounded-3xl text-center animate-in zoom-in duration-300">
            <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fa-solid fa-check text-xl"></i>
            </div>
            <p className="text-blue-700 font-bold text-sm leading-relaxed">{successMsg}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegisterMode && (
              <div className="grid grid-cols-1 gap-4 animate-in slide-in-from-top-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="w-full px-4 py-3 bg-[#f8fafc] border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-blue-500 transition-all" placeholder="Nome Completo" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Função</label>
                  <input type="text" value={role} onChange={(e) => setRole(e.target.value)} required className="w-full px-4 py-3 bg-[#f8fafc] border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-blue-500 transition-all" placeholder="Ex: Rádio Operador" />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Login / Usuário</label>
              <input type="text" value={loginId} onChange={(e) => setLoginId(e.target.value)} required className="w-full px-4 py-4 bg-[#f8fafc] border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-blue-500 transition-all" placeholder="ID de Usuário" />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha de Acesso</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full px-4 py-4 bg-[#f8fafc] border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-blue-500 transition-all" placeholder="••••••••" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300"><i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i></button>
              </div>
            </div>

            {!isRegisterMode && (
              <div className="flex items-center px-1">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      checked={rememberMe} 
                      onChange={(e) => setRememberMe(e.target.checked)} 
                      className="sr-only" 
                    />
                    <div className={`w-5 h-5 border-2 rounded-md transition-all flex items-center justify-center ${rememberMe ? 'bg-blue-600 border-blue-600' : 'bg-transparent border-slate-200 group-hover:border-blue-400'}`}>
                      <i className={`fa-solid fa-check text-[10px] text-white transition-opacity ${rememberMe ? 'opacity-100' : 'opacity-0'}`}></i>
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-slate-600 transition-colors">Lembrar login e senha</span>
                </label>
              </div>
            )}

            {isRegisterMode && (
              <div className="space-y-1 animate-in slide-in-from-top-4">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Confirmar Senha</label>
                <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="w-full px-4 py-4 bg-[#f8fafc] border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-blue-500 transition-all" placeholder="Repita a senha" />
              </div>
            )}

            {error && <div className="text-rose-500 text-[10px] font-black uppercase text-center bg-rose-50 p-3 rounded-xl border border-rose-100">{error}</div>}

            <div className="pt-4 space-y-3">
              <button type="submit" disabled={isLoading} className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] text-white shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 bg-blue-600 shadow-blue-600/20`}>
                {isLoading ? <><i className="fa-solid fa-spinner animate-spin"></i> Conectando...</> : isRegisterMode ? 'Solicitar Acesso' : 'Entrar no Sistema'}
              </button>
              <button type="button" onClick={() => { setIsRegisterMode(!isRegisterMode); setError(''); }} className="w-full py-4 text-slate-400 font-black uppercase tracking-widest text-[10px] hover:text-slate-600 transition-colors">
                {isRegisterMode ? 'Voltar para o Login' : 'Solicitar novo acesso'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;

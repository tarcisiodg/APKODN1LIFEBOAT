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
        setSuccessMsg('Solicitação enviada! Aguarde a aprovação do administrador.');
        
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
      setError(err.message || "Erro de autenticação.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 bg-slate-100 min-h-screen">
      <div className="w-full max-w-md bg-white rounded-[32px] shadow-md p-8 md:p-10 border border-slate-100 animate-in fade-in zoom-in duration-500">
        <div className="text-center mb-10">
          {/* Logo container updated to be square with rounded corners as requested */}
          <div className="w-20 h-20 bg-[#f8fafc] rounded-2xl flex items-center justify-center text-blue-600 text-4xl mx-auto mb-8 shadow-sm border border-slate-100">
            <i className="fa-solid fa-shield-halved"></i>
          </div>
          
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight mb-1">
            {isRegisterMode ? 'SOLICITAR ACESSO' : 'LIFEBOAT MUSTER'}
          </h2>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-2">Sistema de Gerenciamento</p>
        </div>

        {successMsg ? (
          <div className="bg-green-50 border border-green-100 p-8 rounded-3xl text-center shadow-sm">
            <i className="fa-solid fa-circle-check text-green-500 text-4xl mb-4"></i>
            <p className="text-green-700 text-sm font-bold uppercase tracking-wide">{successMsg}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegisterMode && (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold uppercase outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100" placeholder="NOME COMPLETO" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Função / Cargo</label>
                  <input type="text" value={role} onChange={(e) => setRole(e.target.value)} required className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold uppercase outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100" placeholder="EX: RADIO OPERADOR" />
                </div>
              </>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">LOGIN / USUÁRIO</label>
              <input type="text" value={loginId} onChange={(e) => setLoginId(e.target.value)} required className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100" placeholder="LOGIN ID" />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">SENHA DE ACESSO</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100" placeholder="••••••••" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"><i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i></button>
              </div>
            </div>

            {!isRegisterMode && (
              <div className="flex items-center px-1">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Lembrar credenciais</span>
                </label>
              </div>
            )}

            {isRegisterMode && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Confirmar Senha</label>
                <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100" placeholder="••••••••" />
              </div>
            )}

            {error && <div className="text-red-500 text-[10px] font-bold text-center bg-red-50 p-4 rounded-xl border border-red-100 uppercase shadow-sm">{error}</div>}

            <div className="pt-6 flex flex-col gap-3">
              <button type="submit" disabled={isLoading} className="w-full py-4 bg-blue-600 text-white font-black rounded-xl shadow-md active:scale-95 transition-all text-xs uppercase tracking-widest">
                {isLoading ? 'AUTENTICANDO...' : isRegisterMode ? 'CRIAR CONTA' : 'ACESSAR SISTEMA'}
              </button>
              <button type="button" onClick={() => setIsRegisterMode(!isRegisterMode)} className="text-blue-600 text-[10px] font-bold uppercase tracking-wider hover:underline">
                {isRegisterMode ? 'VOLTAR PARA LOGIN' : 'SOLICITAR ACESSO'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;
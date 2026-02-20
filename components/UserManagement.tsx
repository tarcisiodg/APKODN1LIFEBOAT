
import React, { useState, useEffect } from 'react';
import { cloudService } from '../services/cloudService';

interface UserRecord {
  loginId: string;
  name: string;
  role: string;
  password?: string;
  status: 'pending' | 'approved' | 'native';
  requestDate: string;
}

interface UserManagementProps {
  onBack: () => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'all' | 'pending'>('all');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', role: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await cloudService.getAllUsers();
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const pendingUsers = users.filter(u => u.status === 'pending');
  const registeredUsers = users.filter(u => u.status === 'approved' || u.status === 'native');

  const handleApproval = async (loginId: string, approve: boolean) => {
    setIsLoading(true);
    try {
      await cloudService.updateUserStatus(loginId, approve ? 'approved' : 'rejected');
      await loadData();
    } catch (err) {
      alert("Erro ao atualizar status.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setIsLoading(true);
    try {
      await cloudService.deleteUser(deletingId);
      setDeletingId(null);
      await loadData();
    } catch (err) {
      alert("Erro ao excluir usuário.");
    } finally {
      setIsLoading(false);
    }
  };

  const startEdit = (user: UserRecord) => {
    setEditingUser(user);
    setEditForm({ name: user.name, role: user.role, password: user.password || '' });
  };

  const saveEdit = async () => {
    if (!editingUser) return;
    setIsLoading(true);
    try {
      await cloudService.updateUserData(editingUser.loginId, editForm);
      setEditingUser(null);
      await loadData();
    } catch (err) {
      alert("Erro ao salvar alterações.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 max-w-6xl mx-auto w-full pb-40 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white border border-slate-100 text-slate-600 hover:bg-slate-50 transition-all shadow-sm active:scale-95"><i className="fa-solid fa-chevron-left"></i></button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Gestão de Usuários</h2>
              {isLoading && <i className="fa-solid fa-cloud-arrow-down animate-bounce text-blue-500 text-xs"></i>}
            </div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest opacity-60">CONFIGURAÇÕES DE ACESSO E PERMISSÕES</p>
          </div>
        </div>
      </div>

      <div className="flex bg-slate-100/80 p-1.5 rounded-[20px] mb-8 shadow-inner max-w-md">
        <button onClick={() => setActiveTab('all')} className={`flex-1 py-3 rounded-[14px] text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeTab === 'all' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>
          Aprovados <span className={`ml-1 px-2 py-0.5 rounded-full text-[9px] ${activeTab === 'all' ? 'bg-blue-50 text-blue-600' : 'bg-slate-200 text-slate-500'}`}>{registeredUsers.length}</span>
        </button>
        <button onClick={() => setActiveTab('pending')} className={`flex-1 py-3 rounded-[14px] text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeTab === 'pending' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>
          Pendentes <span className={`ml-1 px-2 py-0.5 rounded-full text-[9px] ${activeTab === 'pending' ? 'bg-blue-50 text-blue-600' : 'bg-slate-200 text-slate-500'}`}>{pendingUsers.length}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 relative">
        {isLoading && !editingUser && !deletingId && (
          <div className="absolute inset-0 bg-slate-50/40 backdrop-blur-[2px] z-20 flex items-center justify-center rounded-3xl">
            <div className="bg-white px-8 py-5 rounded-[32px] shadow-xl flex items-center gap-4 border border-slate-100 animate-in fade-in zoom-in duration-300">
              <div className="relative">
                <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
              </div>
              <span className="text-xs font-black text-slate-800 uppercase tracking-widest">Sincronizando Dados...</span>
            </div>
          </div>
        )}

        {(activeTab === 'all' ? registeredUsers : pendingUsers).map(u => (
          <div key={u.loginId} className="group bg-white rounded-[32px] p-5 border border-slate-100 shadow-sm transition-all duration-300 hover:shadow-xl hover:border-blue-100 hover:-translate-y-1">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-5">
                <div className={`w-16 h-16 rounded-[24px] flex items-center justify-center flex-shrink-0 transition-transform duration-500 group-hover:scale-110 ${u.status === 'native' ? 'bg-blue-50 text-blue-600' : u.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-500'}`}>
                  <i className={`fa-solid ${u.status === 'native' ? 'fa-user-shield' : 'fa-user-check'} text-2xl`}></i>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <h4 className="font-black text-slate-900 text-lg tracking-tight leading-tight">{u.name}</h4>
                    <span className="text-[8px] font-black px-2 py-1 rounded-lg bg-slate-100 text-slate-500 uppercase tracking-wider">@{u.loginId}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{u.role}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col items-end gap-3">
                {u.status === 'pending' ? (
                  <div className="flex flex-col gap-2 w-full min-w-[120px]">
                    <button onClick={() => handleApproval(u.loginId, true)} className="w-full bg-emerald-600 text-white font-black px-4 py-2.5 rounded-xl text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-100 hover:bg-emerald-700 active:scale-95 transition-all">Aprovar</button>
                    <button onClick={() => handleApproval(u.loginId, false)} className="w-full bg-rose-50 text-rose-500 font-black px-4 py-2.5 rounded-xl text-[10px] uppercase tracking-widest hover:bg-rose-100 active:scale-95 transition-all">Recusar</button>
                  </div>
                ) : (
                  <div className="flex flex-col items-end gap-3">
                    <div className={`text-[9px] font-black px-3 py-1.5 rounded-full uppercase tracking-[0.15em] border ${u.status === 'native' ? 'bg-blue-600 text-white border-blue-600' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                      {u.status === 'native' ? 'SISTEMA' : 'ATIVO'}
                    </div>
                    {u.status !== 'native' && (
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <button 
                          onClick={() => startEdit(u)}
                          className="w-10 h-10 bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white rounded-xl flex items-center justify-center transition-all shadow-sm active:scale-90"
                          title="Editar Cadastro"
                        >
                          <i className="fa-solid fa-pen-to-square text-sm"></i>
                        </button>
                        <button 
                          onClick={() => setDeletingId(u.loginId)}
                          className="w-10 h-10 bg-slate-50 text-slate-400 hover:bg-rose-600 hover:text-white rounded-xl flex items-center justify-center transition-all shadow-sm active:scale-90"
                          title="Excluir Usuário"
                        >
                          <i className="fa-solid fa-trash-can text-sm"></i>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {(activeTab === 'all' ? registeredUsers : pendingUsers).length === 0 && !isLoading && (
          <div className="col-span-full flex flex-col items-center justify-center py-32 bg-slate-50/50 rounded-[40px] border-2 border-dashed border-slate-200">
            <i className="fa-solid fa-users-slash text-5xl text-slate-200 mb-4"></i>
            <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-xs">Nenhum usuário encontrado</p>
          </div>
        )}
      </div>

      {/* Modal de Edição */}
      {editingUser && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] max-w-sm w-full p-8 shadow-md animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-black text-slate-900 mb-6 text-center uppercase tracking-tight">Editar Usuário</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                <input 
                  type="text" 
                  value={editForm.name} 
                  onChange={e => setEditForm({...editForm, name: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold focus:ring-1 focus:ring-blue-100 outline-none"
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Função / Cargo</label>
                <input 
                  type="text" 
                  value={editForm.role} 
                  onChange={e => setEditForm({...editForm, role: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold focus:ring-1 focus:ring-blue-100 outline-none"
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nova Senha (Opcional)</label>
                <input 
                  type="password" 
                  placeholder="Deixe em branco para manter"
                  value={editForm.password} 
                  onChange={e => setEditForm({...editForm, password: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold focus:ring-1 focus:ring-blue-100 outline-none"
                />
              </div>
            </div>
            <div className="grid gap-2 mt-8">
              <button onClick={saveEdit} className="w-full py-4 bg-blue-600 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-sm active:scale-95 transition-all">Salvar Alterações</button>
              <button onClick={() => setEditingUser(null)} className="w-full py-4 bg-slate-100 text-slate-500 font-black rounded-2xl text-[10px] uppercase tracking-widest active:scale-95">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Exclusão */}
      {deletingId && (
        <div className="fixed inset-0 z-[101] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] max-w-sm w-full p-8 shadow-md animate-in fade-in zoom-in duration-200 text-center">
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <i className="fa-solid fa-user-slash text-2xl"></i>
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Excluir Usuário?</h3>
            <p className="text-slate-500 text-[11px] font-medium leading-relaxed mb-8">
              Esta ação removerá permanentemente o acesso de <span className="font-bold text-slate-900">@{deletingId}</span> da nuvem. Esta operação não pode ser desfeita.
            </p>
            <div className="grid gap-2">
              <button onClick={handleDelete} className="w-full py-4 bg-rose-600 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-sm active:scale-95 transition-all">Confirmar Exclusão</button>
              <button onClick={() => setDeletingId(null)} className="w-full py-4 bg-slate-100 text-slate-500 font-black rounded-2xl text-[10px] uppercase tracking-widest active:scale-95">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;

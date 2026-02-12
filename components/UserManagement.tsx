
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
    <div className="flex-1 flex flex-col p-6 max-w-4xl mx-auto w-full pb-40 animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all shadow-sm active:scale-95"><i className="fa-solid fa-chevron-left"></i></button>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Gestão de Usuários</h2>
            {isLoading && <i className="fa-solid fa-cloud-arrow-down animate-bounce text-blue-500 text-xs"></i>}
          </div>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest opacity-60">Base Sincronizada em Nuvem</p>
        </div>
      </div>

      <div className="flex bg-slate-100 p-1 rounded-2xl mb-8">
        <button onClick={() => setActiveTab('all')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>Aprovados ({registeredUsers.length})</button>
        <button onClick={() => setActiveTab('pending')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === 'pending' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>Pendentes ({pendingUsers.length})</button>
      </div>

      <div className="space-y-4 relative">
        {isLoading && !editingUser && !deletingId && (
          <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-3xl">
            <div className="bg-white px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3 border border-slate-100">
              <i className="fa-solid fa-spinner animate-spin text-blue-600"></i>
              <span className="text-xs font-black text-slate-800 uppercase tracking-widest">Sincronizando...</span>
            </div>
          </div>
        )}

        {(activeTab === 'all' ? registeredUsers : pendingUsers).map(u => (
          <div key={u.loginId} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm transition-all hover:shadow-md">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${u.status === 'native' ? 'bg-blue-50 text-blue-600' : u.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-500'}`}>
                  <i className={`fa-solid ${u.status === 'native' ? 'fa-user-gear' : 'fa-cloud-user'}`}></i>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-black text-slate-900 text-sm leading-none">{u.name}</h4>
                    <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase">{u.loginId}</span>
                  </div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                    {u.role}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 w-full sm:w-auto">
                {u.status === 'pending' ? (
                  <>
                    <button onClick={() => handleApproval(u.loginId, true)} className="flex-1 bg-emerald-600 text-white font-black px-4 py-2 rounded-xl text-[9px] uppercase tracking-widest shadow-lg shadow-emerald-600/20 active:scale-95 transition-all">Aprovar</button>
                    <button onClick={() => handleApproval(u.loginId, false)} className="flex-1 bg-rose-50 text-rose-500 font-black px-4 py-2 rounded-xl text-[9px] uppercase tracking-widest active:scale-95 transition-all">Recusar</button>
                  </>
                ) : (
                  <>
                    {u.status !== 'native' && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => startEdit(u)}
                          className="w-9 h-9 bg-slate-50 text-slate-500 hover:bg-blue-50 hover:text-blue-600 rounded-xl flex items-center justify-center transition-all"
                          title="Editar Cadastro"
                        >
                          <i className="fa-solid fa-pen-to-square text-xs"></i>
                        </button>
                        <button 
                          onClick={() => setDeletingId(u.loginId)}
                          className="w-9 h-9 bg-slate-50 text-slate-500 hover:bg-rose-50 hover:text-rose-600 rounded-xl flex items-center justify-center transition-all"
                          title="Excluir Usuário"
                        >
                          <i className="fa-solid fa-trash-can text-xs"></i>
                        </button>
                      </div>
                    )}
                    <div className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] border border-slate-100 px-3 py-2 rounded-lg bg-slate-50">
                      {u.status === 'native' ? 'SISTEMA' : 'ATIVO'}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        {users.length === 0 && !isLoading && <div className="text-center py-20 text-slate-300 font-bold uppercase tracking-widest text-xs">Nenhum usuário encontrado</div>}
      </div>

      {/* Modal de Edição */}
      {editingUser && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] max-w-sm w-full p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-black text-slate-900 mb-6 text-center uppercase tracking-tight">Editar Usuário</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                <input 
                  type="text" 
                  value={editForm.name} 
                  onChange={e => setEditForm({...editForm, name: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Função / Cargo</label>
                <input 
                  type="text" 
                  value={editForm.role} 
                  onChange={e => setEditForm({...editForm, role: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nova Senha (Opcional)</label>
                <input 
                  type="password" 
                  placeholder="Deixe em branco para manter"
                  value={editForm.password} 
                  onChange={e => setEditForm({...editForm, password: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                />
              </div>
            </div>
            <div className="grid gap-2 mt-8">
              <button onClick={saveEdit} className="w-full py-4 bg-blue-600 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-lg shadow-blue-600/20 active:scale-95 transition-all">Salvar Alterações</button>
              <button onClick={() => setEditingUser(null)} className="w-full py-4 bg-slate-100 text-slate-500 font-black rounded-2xl text-[10px] uppercase tracking-widest active:scale-95">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Exclusão */}
      {deletingId && (
        <div className="fixed inset-0 z-[101] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] max-w-sm w-full p-8 shadow-2xl animate-in fade-in zoom-in duration-200 text-center">
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <i className="fa-solid fa-user-slash text-2xl"></i>
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Excluir Usuário?</h3>
            <p className="text-slate-500 text-[11px] font-medium leading-relaxed mb-8">
              Esta ação removerá permanentemente o acesso de <span className="font-bold text-slate-900">@{deletingId}</span> da nuvem. Esta operação não pode ser desfeita.
            </p>
            <div className="grid gap-2">
              <button onClick={handleDelete} className="w-full py-4 bg-rose-600 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-lg shadow-rose-600/20 active:scale-95 transition-all">Confirmar Exclusão</button>
              <button onClick={() => setDeletingId(null)} className="w-full py-4 bg-slate-100 text-slate-500 font-black rounded-2xl text-[10px] uppercase tracking-widest active:scale-95">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;

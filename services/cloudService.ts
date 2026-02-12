
import { db } from './firebaseConfig';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit,
  onSnapshot
} from "firebase/firestore";
import { User, TrainingRecord, LifeboatStatus, LifeboatType } from '../types';

/**
 * SERVIÇO DE NUVEM FIREBASE
 * Gerencia persistência real no Google Cloud Firestore.
 */

const NATIVE_USER_DATA: Record<string, { name: string, role: string, pass: string, isAdmin: boolean }> = {
  'odn1radiooperator': { name: 'Radio Operator', role: 'ADMINISTRADOR', pass: '1234', isAdmin: true },
  'admtarcisiodias': { name: 'Tarcisio Dias', role: 'RADIO OPERATOR', pass: '70866833', isAdmin: true }
};

export const cloudService = {
  // --- AUTENTICAÇÃO ---
  
  async login(loginId: string, pass: string): Promise<User> {
    const id = loginId.toLowerCase().trim();
    
    // 1. Verifica usuários fixos do sistema
    if (NATIVE_USER_DATA[id]) {
      if (NATIVE_USER_DATA[id].pass === pass) {
        return { 
          email: `${id}@muster.com`, 
          name: NATIVE_USER_DATA[id].name, 
          role: NATIVE_USER_DATA[id].role, 
          isAdmin: NATIVE_USER_DATA[id].isAdmin 
        };
      }
      throw new Error("Senha incorreta.");
    }

    // 2. Busca no Firestore
    const userRef = doc(db, "users", id);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      if (data.status === 'pending') throw new Error("Acesso aguardando aprovação.");
      if (data.password === pass) {
        return { 
          email: `${id}@muster.com`, 
          name: data.name, 
          role: data.role, 
          isAdmin: data.role === 'ADMINISTRADOR' || data.role === 'RADIO OPERATOR'
        };
      }
      throw new Error("Senha incorreta.");
    }

    throw new Error("Usuário não encontrado.");
  },

  async register(data: {loginId: string, name: string, role: string, pass: string}): Promise<void> {
    const id = data.loginId.toLowerCase().trim();
    const userRef = doc(db, "users", id);
    
    // Verifica se já existe (nativo ou nuvem)
    if (NATIVE_USER_DATA[id]) throw new Error("Este login é reservado pelo sistema.");
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) throw new Error("Este login já está em uso.");

    await setDoc(userRef, {
      name: data.name,
      role: data.role.toUpperCase(),
      password: data.pass,
      status: 'pending',
      requestDate: new Date().toISOString()
    });
  },

  async getAllUsers(): Promise<any[]> {
    const native = Object.entries(NATIVE_USER_DATA).map(([id, data]) => ({
      loginId: id, ...data, status: 'native', requestDate: 'Sistema'
    }));

    const usersCol = collection(db, "users");
    const userSnapshot = await getDocs(usersCol);
    const custom = userSnapshot.docs.map(doc => ({
      loginId: doc.id,
      ...doc.data()
    }));

    return [...native, ...custom];
  },

  async updateUserStatus(loginId: string, status: 'approved' | 'rejected'): Promise<void> {
    const userRef = doc(db, "users", loginId);
    if (status === 'rejected') {
      await deleteDoc(userRef);
    } else {
      await updateDoc(userRef, { status: 'approved' });
    }
  },

  async deleteUser(loginId: string): Promise<void> {
    const userRef = doc(db, "users", loginId);
    await deleteDoc(userRef);
  },

  async updateUserData(loginId: string, data: { name: string, role: string, password?: string }): Promise<void> {
    const userRef = doc(db, "users", loginId);
    const updatePayload: any = {
      name: data.name,
      role: data.role.toUpperCase(),
    };
    if (data.password) {
      updatePayload.password = data.password;
    }
    await updateDoc(userRef, updatePayload);
  },

  // --- HISTÓRICO ---

  async saveTrainingRecord(record: TrainingRecord): Promise<void> {
    const recordRef = doc(db, "history", record.id);
    await setDoc(recordRef, {
      ...record,
      timestamp: new Date().toISOString()
    });
  },

  async getHistory(): Promise<TrainingRecord[]> {
    const historyCol = collection(db, "history");
    const q = query(historyCol, orderBy("timestamp", "desc"), limit(50));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as TrainingRecord);
  },

  // --- STATUS DA FROTA (TEMPO REAL) ---

  async updateFleetStatus(status: Record<LifeboatType, LifeboatStatus>): Promise<void> {
    const fleetRef = doc(db, "fleet", "status");
    await setDoc(fleetRef, status);
  },

  async fetchFleetStatus(): Promise<Record<LifeboatType, LifeboatStatus> | null> {
    const fleetRef = doc(db, "fleet", "status");
    const snap = await getDoc(fleetRef);
    return snap.exists() ? (snap.data() as Record<LifeboatType, LifeboatStatus>) : null;
  },

  // Escuta em tempo real (para o Administrador ver mudanças sem dar refresh)
  subscribeToFleet(callback: (status: Record<LifeboatType, LifeboatStatus>) => void) {
    const fleetRef = doc(db, "fleet", "status");
    return onSnapshot(fleetRef, (doc) => {
      if (doc.exists()) {
        callback(doc.data() as Record<LifeboatType, LifeboatStatus>);
      }
    });
  }
};

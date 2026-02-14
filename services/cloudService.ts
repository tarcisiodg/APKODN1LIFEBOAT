
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
import { User, TrainingRecord, LifeboatStatus, LifeboatType, Berth } from '../types';

const NATIVE_USER_DATA: Record<string, { name: string, role: string, pass: string, isAdmin: boolean }> = {
  'odn1radiooperator': { name: 'Radio Operator', role: 'ADMINISTRADOR', pass: '1234', isAdmin: true },
  'admtarcisiodias': { name: 'Tarcisio Dias', role: 'RADIO OPERATOR', pass: '70866833', isAdmin: true }
};

export const cloudService = {
  async login(loginId: string, pass: string): Promise<User> {
    const id = loginId.toLowerCase().trim();
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
    const updatePayload: any = { name: data.name, role: data.role.toUpperCase() };
    if (data.password) updatePayload.password = data.password;
    await updateDoc(userRef, updatePayload);
  },

  async updateManualCounters(counters: Record<string, number>): Promise<void> {
    const countersRef = doc(db, "config", "manual_counters");
    await setDoc(countersRef, counters);
  },

  subscribeToManualCounters(callback: (counters: Record<string, number>) => void) {
    const countersRef = doc(db, "config", "manual_counters");
    return onSnapshot(countersRef, (doc) => {
      if (doc.exists()) {
        callback(doc.data() as Record<string, number>);
      } else {
        callback({});
      }
    });
  },

  async getReleasedCrew(): Promise<string[]> {
    const ref = doc(db, "config", "released_crew");
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data().ids || []) : [];
  },

  async updateReleasedCrew(ids: string[]): Promise<void> {
    const ref = doc(db, "config", "released_crew");
    await setDoc(ref, { ids, lastUpdate: new Date().toISOString() });
  },

  subscribeToReleasedCrew(callback: (ids: string[]) => void) {
    const ref = doc(db, "config", "released_crew");
    return onSnapshot(ref, (doc) => {
      if (doc.exists()) callback(doc.data().ids || []);
      else callback([]);
    });
  },
  
  async saveBerth(berth: Berth): Promise<void> {
    const berths = await this.getBerths();
    const existingIndex = berths.findIndex(b => b.id === berth.id);
    if (existingIndex >= 0) {
      berths[existingIndex] = berth;
    } else {
      berths.push(berth);
    }
    await this.saveBerths(berths);
  },

  async saveBerths(berths: Berth[]): Promise<void> {
    const pobRef = doc(db, "config", "pob");
    await setDoc(pobRef, { berths, lastUpdate: new Date().toISOString() });
  },

  async saveBerthNames(detailsMap: Record<string, { crewName: string, role: string, company: string }>): Promise<void> {
    const berths = await this.getBerths();
    const updated = berths.map(b => ({
      ...b,
      crewName: detailsMap[b.id]?.crewName || b.crewName,
      role: detailsMap[b.id]?.role || b.role || '',
      company: detailsMap[b.id]?.company || b.company || ''
    }));
    await this.saveBerths(updated);
  },

  async clearBerthNames(): Promise<void> {
    const berths = await this.getBerths();
    const cleared = berths.map(b => ({
      ...b,
      crewName: '',
      role: '',
      company: ''
    }));
    await this.saveBerths(cleared);
  },

  async clearBerths(): Promise<void> {
    const pobRef = doc(db, "config", "pob");
    await deleteDoc(pobRef);
  },

  async getBerths(): Promise<Berth[]> {
    try {
      const pobRef = doc(db, "config", "pob");
      const snap = await getDoc(pobRef);
      if (snap.exists() && snap.data().berths) {
        return snap.data().berths as Berth[];
      }
      return [];
    } catch (e) {
      console.error("Erro ao carregar POB:", e);
      return [];
    }
  },

  async saveTrainingRecord(record: TrainingRecord): Promise<void> {
    const recordRef = doc(db, "history", record.id);
    await setDoc(recordRef, { ...record, timestamp: new Date().toISOString() });
  },

  async getHistory(): Promise<TrainingRecord[]> {
    const historyCol = collection(db, "history");
    const q = query(historyCol, orderBy("timestamp", "desc"), limit(50));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as TrainingRecord);
  },

  async updateFleetStatus(status: Record<string, LifeboatStatus>): Promise<void> {
    const fleetRef = doc(db, "fleet", "status");
    await setDoc(fleetRef, status);
  },

  subscribeToFleet(callback: (status: Record<string, LifeboatStatus>) => void) {
    const fleetRef = doc(db, "fleet", "status");
    return onSnapshot(fleetRef, (doc) => {
      if (doc.exists()) callback(doc.data() as Record<string, LifeboatStatus>);
    });
  }
};

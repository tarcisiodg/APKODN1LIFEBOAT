
export interface User {
  email: string;
  name: string;
  role?: string;
  isAdmin?: boolean;
  employeeId?: string;
  department?: string;
}

export interface ScannedTag {
  id: string;
  timestamp: string;
  data: string;
  name?: string;
  role?: string;
  leito?: string; // Adicionado para exibir o leito no treinamento
}

export interface Berth {
  id: string; // Número do Leito
  tagId1: string; // ID Físico da Tag 1
  tagId2: string; // ID Físico da Tag 2
  tagId3: string; // ID Físico da Tag 3
  crewName: string;
  role?: string;    // Função do tripulante
  company?: string; // Empresa do tripulante
  lifeboat: LifeboatType;
  secondaryLifeboat?: LifeboatType;
}

export interface LifeboatStatus {
  count: number;
  isActive: boolean;
  startTime?: number;
  accumulatedSeconds?: number;
  operatorName?: string; 
  leaderName?: string;
  trainingType?: string;
  isRealScenario?: boolean;
  tags?: ScannedTag[];
  seconds?: number;
  isPaused?: boolean;
}

export interface ActiveSession {
  lifeboat: LifeboatType;
  leaderName: string;
  trainingType: 'Gás' | 'Fogo/Abandono';
  isRealScenario: boolean;
  tags: ScannedTag[];
  seconds: number;
  startTime: number;
  accumulatedSeconds: number;
  isPaused: boolean;
  isAdminView?: boolean;
  expectedCrew?: Berth[]; 
}

export interface TrainingRecord {
  id: string;
  date: string;
  lifeboat: LifeboatType;
  leaderName: string;
  trainingType: string;
  isRealScenario: boolean;
  crewCount: number;
  duration: string;
  summary: string;
  operator: string;
  tags?: ScannedTag[];
}

export type LifeboatType = 'Lifeboat 1' | 'Lifeboat 2' | 'Lifeboat 3' | 'Lifeboat 4' | 'Lifeboat 5' | 'Lifeboat 6';

export enum AppState {
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  TRAINING_CONFIG = 'TRAINING_CONFIG',
  SELECTION = 'SELECTION',
  TRAINING = 'TRAINING',
  HISTORY = 'HISTORY',
  USER_MANAGEMENT = 'USER_MANAGEMENT',
  NFC_ENROLLMENT = 'NFC_ENROLLMENT',
  BERTH_MANAGEMENT = 'BERTH_MANAGEMENT'
}


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
}

export interface LifeboatStatus {
  count: number;
  isActive: boolean;
  startTime?: number;
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
  isPaused: boolean;
  isAdminView?: boolean;
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
  USER_MANAGEMENT = 'USER_MANAGEMENT'
}

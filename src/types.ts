// Type definitions for 0xHunter API

export interface HunterConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export enum BugSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info'
}

export enum BugStatus {
  NEW = 'new',
  TRIAGED = 'triaged',
  ACCEPTED = 'accepted',
  FIXING = 'fixing',
  FIXED = 'fixed',
  WONT_FIX = 'wont_fix',
  DUPLICATE = 'duplicate'
}

export interface Bug {
  id: string;
  title: string;
  severity: string | null; // 'Critical', 'High', 'Medium', 'Low', etc.
  status: string; // 'Pending', 'Validated', 'Resolved', etc.
  description: string;
  impact?: string;
  target_url?: string | null;
  type?: string | null;
  classification_id?: string | null;
  evidence?: string | null;
  detection_date?: string;
  reported_by?: string;
  assigned_to?: string | null;
  tags?: string | null;
  created_at?: string;
  updated_at?: string;
  updated_by?: string;
  program_id?: string;
  program_title?: string;
  
  // AI-powered insights
  dev_explanation?: string;
  solution_prompt?: string;
  
  // Legacy fields for compatibility
  affectedFile?: string;
  affectedLines?: [number, number];
  affectedUrl?: string;
  cweId?: string;
  cvssScore?: number;
  proofOfConcept?: string;
  recommendation?: string;
  reportedBy?: string;
  reportedAt?: string;
  programName?: string;
}

export interface BugsResponse {
  bugs?: Bug[];
  reports?: Bug[];
  total?: number;
  page?: number;
  pageSize?: number;
}

// Para cuando la API devuelve un array directo
export type BugsResponseArray = Bug[];

export interface UpdateBugStatusRequest {
  status: BugStatus;
  comment?: string;
}

export type ActorType = 'admin' | 'user';

export type Rank = 'master' | 'director' | 'manager' | 'staff';

export interface Principal {
  actorType: ActorType;
  id: string;
  email: string;
  tenantId?: string;
  level?: number;
  rank?: Rank;
  labels?: string[];
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { code?: string; message: string } | null;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
  principal: Principal;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

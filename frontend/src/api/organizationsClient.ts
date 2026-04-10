import { supabase } from './supabase';

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  org_type: string;
  created_at: string;
  myRole?: string;
}

export interface OrgMember {
  id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'viewer';
  joined_at: string;
  profiles?: { id: string; email?: string; full_name?: string };
}

export interface Plan {
  id: string;
  name: string;
  slug: string;
  max_stores: number;
  max_staff_per_store: number;
  max_plugins: number;
  allowed_plugins: string[];
  price_monthly_jpy: number;
  is_active: boolean;
}

export interface Subscription {
  status: string;
  started_at: string;
  ends_at: string | null;
  plans: Plan | null;
}

export interface OrgUsage {
  stores: number;
  plugins: number;
}

export interface PlatformMember {
  id: string;
  user_id: string;
  role: 'super_admin' | 'admin' | 'support' | 'viewer';
  joined_at: string;
  profiles?: { id: string; email?: string; full_name?: string };
}

export const orgApi = {
  list: () => request<{ organizations: Organization[] }>('/organizations'),
  get: (orgId: string) =>
    request<{ organization: Organization; myRole: string; subscription: Subscription | null }>(
      `/organizations/${orgId}`
    ),
  create: (data: { name: string; slug: string; parentId?: string; orgType?: string }) =>
    request<{ organization: Organization }>('/organizations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (orgId: string, data: { name?: string; settings?: Record<string, unknown> }) =>
    request<{ organization: Organization }>(`/organizations/${orgId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  listMembers: (orgId: string) =>
    request<{ members: OrgMember[] }>(`/organizations/${orgId}/members`),
  addMember: (orgId: string, data: { email: string; role: string }) =>
    request<{ member: OrgMember }>(`/organizations/${orgId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  removeMember: (orgId: string, memberId: string) =>
    request<{ ok: boolean }>(`/organizations/${orgId}/members/${memberId}`, { method: 'DELETE' }),
  updateMemberRole: (orgId: string, memberId: string, role: string) =>
    request<{ ok: boolean }>(`/organizations/${orgId}/members/${memberId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),
  listStores: (orgId: string) =>
    request<{ stores: Array<{ id: string; name: string; address?: string; phone?: string }> }>(
      `/organizations/${orgId}/stores`
    ),
  assignStore: (orgId: string, storeId: string) =>
    request<{ ok: boolean }>(`/organizations/${orgId}/stores/${storeId}/assign`, {
      method: 'POST',
    }),
  getUsage: (orgId: string) =>
    request<{
      usage: OrgUsage;
      limits: {
        max_stores: number;
        max_staff_per_store: number;
        max_plugins: number;
        allowed_plugins: string[];
      };
      planName: string;
    }>(`/organizations/${orgId}/usage`),
};

export const platformApi = {
  me: () => request<{ role: string }>('/platform/me'),
  listOrganizations: () => request<{ organizations: Organization[] }>('/platform/organizations'),
  getOrganization: (orgId: string) =>
    request<{
      organization: Organization;
      subscription: { status: string; plans: Plan | null } | null;
      usage: {
        usage: OrgUsage;
        limits: {
          max_stores: number;
          max_staff_per_store: number;
          max_plugins: number;
          allowed_plugins: string[];
        };
        planName: string;
      };
    }>(`/platform/organizations/${orgId}`),
  updateSubscription: (orgId: string, data: { planId: string; status?: string }) =>
    request<{ ok: boolean }>(`/platform/organizations/${orgId}/subscription`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  listTeam: () => request<{ team: PlatformMember[] }>('/platform/team'),
  addTeamMember: (data: { email: string; role: string }) =>
    request<{ member: PlatformMember }>('/platform/team', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  removeTeamMember: (memberId: string) =>
    request<{ ok: boolean }>(`/platform/team/${memberId}`, { method: 'DELETE' }),
  listPlans: () => request<{ plans: Plan[] }>('/platform/plans'),
  createPlan: (data: Partial<Plan>) =>
    request<{ plan: Plan }>('/platform/plans', { method: 'POST', body: JSON.stringify(data) }),
  updatePlan: (planId: string, data: Partial<Plan>) =>
    request<{ plan: Plan }>(`/platform/plans/${planId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

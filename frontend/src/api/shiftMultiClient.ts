import { supabase } from './supabase';
import type {
  WeeklyResponse,
  OrgEmployee,
  ShiftConflict,
  SaveShiftResponse,
} from '../types/shiftMulti';

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

export const shiftMultiApi = {
  getWeeklyShifts: (orgId: string, date: string, days?: number) =>
    request<WeeklyResponse>(
      `/shift-multi/${orgId}/weekly?date=${date}${days ? `&days=${days}` : ''}`
    ),

  getOrgStaff: (orgId: string) =>
    request<{ employees: OrgEmployee[] }>(`/shift-multi/${orgId}/staff`),

  getConflicts: (orgId: string, date: string, days?: number) =>
    request<{ conflicts: ShiftConflict[] }>(
      `/shift-multi/${orgId}/conflicts?date=${date}${days ? `&days=${days}` : ''}`
    ),

  saveShift: (orgId: string, data: {
    storeId: string;
    staffId: string;
    date: string;
    startTime: string;
    endTime: string;
    breakMinutes?: number;
    note?: string;
    status?: string;
  }) =>
    request<SaveShiftResponse>(`/shift-multi/${orgId}/shifts`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  publishAll: (orgId: string, startDate: string, endDate: string, storeIds?: string[]) =>
    request<{ published: number }>(`/shift-multi/${orgId}/publish`, {
      method: 'POST',
      body: JSON.stringify({ startDate, endDate, storeIds }),
    }),

  deleteShift: (orgId: string, shiftId: string) =>
    request<{ ok: boolean }>(`/shift-multi/${orgId}/shifts/${shiftId}`, {
      method: 'DELETE',
    }),
};

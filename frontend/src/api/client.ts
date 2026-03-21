import { supabase } from './supabase';

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  // Supabase Auth のアクセストークンをヘッダーに付与
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
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Stores
  getStores: () => request<any>('/stores'),
  createStore: (name: string, address?: string) =>
    request<any>('/stores', { method: 'POST', body: JSON.stringify({ name, address }) }),
  getStoreStaff: (storeId: string) => request<any>(`/stores/${storeId}/staff`),
  addStaff: (storeId: string, email: string, role?: string, hourlyWage?: number) =>
    request<any>(`/stores/${storeId}/staff`, {
      method: 'POST',
      body: JSON.stringify({ email, role, hourlyWage }),
    }),

  // Timecard
  getTimecardStatus: (storeId: string) => request<any>(`/timecard/${storeId}/status`),
  clockIn: (storeId: string) =>
    request<any>(`/timecard/${storeId}/clock-in`, { method: 'POST' }),
  clockOut: (storeId: string, breakMinutes?: number) =>
    request<any>(`/timecard/${storeId}/clock-out`, {
      method: 'POST',
      body: JSON.stringify({ breakMinutes }),
    }),
  getDailyRecords: (storeId: string, date?: string) =>
    request<any>(`/timecard/${storeId}/daily${date ? `?date=${date}` : ''}`),
  getMonthlyRecords: (storeId: string, year?: number, month?: number) => {
    const params = new URLSearchParams();
    if (year) params.set('year', String(year));
    if (month !== undefined) params.set('month', String(month));
    return request<any>(`/timecard/${storeId}/monthly?${params}`);
  },
};

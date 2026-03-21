/**
 * ITAMIN CHECK プラグイン API クライアント
 * FastAPI バックエンド (port 3002) と通信
 */

import { supabase } from './supabase';

const CHECK_API = '/api/check';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${CHECK_API}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

export interface CheckItem {
  id: string;
  label: string;
  order: number;
  required: boolean;
}

export interface Checklist {
  id: string;
  store_id: string;
  timing: 'clock_in' | 'clock_out';
  items: CheckItem[];
}

export interface CheckResult {
  item_id: string;
  label: string;
  checked: boolean;
}

export interface CheckRecord {
  id: string;
  store_id: string;
  staff_id: string;
  timing: string;
  results: CheckResult[];
  all_checked: boolean;
  checked_at: string;
}

export const checkApi = {
  getChecklist: (storeId: string, timing: 'clock_in' | 'clock_out') =>
    request<{ checklist: Checklist }>(`/checklists/${storeId}/${timing}`),

  updateChecklist: (storeId: string, timing: 'clock_in' | 'clock_out', items: CheckItem[]) =>
    request<{ checklist: Checklist }>(`/checklists/${storeId}/${timing}`, {
      method: 'PUT',
      body: JSON.stringify({ items }),
    }),

  saveRecord: (data: {
    store_id: string;
    staff_id: string;
    timing: 'clock_in' | 'clock_out';
    results: CheckResult[];
  }) =>
    request<{ record: CheckRecord }>('/records/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getRecords: (storeId: string, params?: { start_date?: string; end_date?: string; staff_id?: string }) => {
    const query = new URLSearchParams();
    if (params?.start_date) query.set('start_date', params.start_date);
    if (params?.end_date) query.set('end_date', params.end_date);
    if (params?.staff_id) query.set('staff_id', params.staff_id);
    return request<{ records: CheckRecord[] }>(`/records/${storeId}?${query}`);
  },

  getCsvUrl: (storeId: string, params?: { start_date?: string; end_date?: string }) => {
    const query = new URLSearchParams();
    if (params?.start_date) query.set('start_date', params.start_date);
    if (params?.end_date) query.set('end_date', params.end_date);
    return `${CHECK_API}/records/${storeId}/csv?${query}`;
  },
};

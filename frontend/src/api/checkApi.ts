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
    throw new Error(error.detail || error.error || error.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export type CheckTiming = 'clock_in' | 'clock_out';
export type ChecklistTemplateLayer = 'base' | 'shift';
export type ShiftType = 'early' | 'mid' | 'late';

export interface CheckItem {
  id: string;
  label: string;
  order: number;
  required: boolean;
  type?: 'checkbox' | 'text';
}

export interface Checklist {
  id: string;
  store_id: string;
  timing: CheckTiming;
  items: CheckItem[];
}

export interface CheckResult {
  item_id: string;
  label: string;
  checked: boolean;
  value?: string;
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

export interface ChecklistTemplateItem {
  label: string;
  category?: string;
}

export interface ChecklistTemplate {
  id: string;
  store_id: string;
  name: string;
  layer: ChecklistTemplateLayer;
  timing: CheckTiming;
  items: ChecklistTemplateItem[];
  sort_order: number;
  created_at?: string;
}

export interface ShiftChecklistMapping {
  id: string;
  store_id: string;
  shift_type: ShiftType;
  template_id: string;
  template: ChecklistTemplate | null;
}

export interface MergedChecklistItem extends ChecklistTemplateItem {
  template_id: string;
  template_name: string;
  layer: ChecklistTemplateLayer;
  timing: CheckTiming;
  sort_order: number;
}

export const checkApi = {
  getChecklist: (storeId: string, timing: CheckTiming) =>
    request<{ checklist: Checklist }>(`/checklists/${storeId}/${timing}`),

  updateChecklist: (storeId: string, timing: CheckTiming, items: CheckItem[]) =>
    request<{ checklist: Checklist }>(`/checklists/${storeId}/${timing}`, {
      method: 'PUT',
      body: JSON.stringify({ items }),
    }),

  saveRecord: (data: {
    store_id: string;
    staff_id: string;
    timing: CheckTiming;
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

  getTemplates: (storeId: string) =>
    request<{ templates: ChecklistTemplate[] }>(`/templates/${storeId}`),

  createTemplate: (storeId: string, data: {
    name: string;
    layer: ChecklistTemplateLayer;
    timing: CheckTiming;
    items: ChecklistTemplateItem[];
    sort_order?: number;
  }) =>
    request<{ template: ChecklistTemplate }>(`/templates/${storeId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTemplate: (storeId: string, templateId: string, data: Partial<{
    name: string;
    layer: ChecklistTemplateLayer;
    timing: CheckTiming;
    items: ChecklistTemplateItem[];
    sort_order: number;
  }>) =>
    request<{ template: ChecklistTemplate }>(`/templates/${storeId}/${templateId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteTemplate: (storeId: string, templateId: string) =>
    request<{ ok: boolean }>(`/templates/${storeId}/${templateId}`, {
      method: 'DELETE',
    }),

  getShiftMap: (storeId: string) =>
    request<{ mappings: ShiftChecklistMapping[] }>(`/shift-map/${storeId}`),

  updateShiftMap: (storeId: string, mappings: Array<{ shift_type: ShiftType; template_id: string }>) =>
    request<{ mappings: ShiftChecklistMapping[] }>(`/shift-map/${storeId}`, {
      method: 'PUT',
      body: JSON.stringify({ mappings }),
    }),

  getTemplatesForShift: (storeId: string, shiftType: ShiftType, timing: CheckTiming) =>
    request<{
      store_id: string;
      shift_type: ShiftType;
      timing: CheckTiming;
      templates: ChecklistTemplate[];
      items: MergedChecklistItem[];
    }>(`/templates/${storeId}/for-shift/${shiftType}/${timing}`),
};

/**
 * ITAMIN HACCP プラグイン API クライアント
 * HACCP 準拠: timing TEXT / scope / CCP / 閾値 / 逸脱 / 測定層
 *
 * NOTE: バックエンドのプラグイン名は `check` → `haccp` にリネーム済み。
 * このファイル名と export 名 (`checkApi`) は git blame を保つため据え置き。
 */

import { supabase } from './supabase';

const CHECK_API = '/api/haccp';

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

// ── 型定義 ────────────────────────────────────────────────────────────────────

export type CheckTiming = 'clock_in' | 'clock_out' | 'store_opening' | 'store_closing' | 'store_daily' | 'ad_hoc';
export type CheckScope  = 'store' | 'personal';
export type CheckLayer  = 'base' | 'shift';
export type CheckItemType = 'checkbox' | 'numeric' | 'text' | 'photo' | 'select' | 'nfc_location';
export type TrackingMode = 'submission_only' | 'measurement_only' | 'both';
export type AuditLevel   = 'simple' | 'shift' | 'item' | 'approval';
export type DeviationSeverity = 'info' | 'warning' | 'ccp';
export type DeviationStatus   = 'open' | 'corrected' | 'approved' | 'closed';

export interface SystemTemplateItem {
  id: string;
  system_template_id: string;
  item_key: string;
  label: string;
  item_type: CheckItemType;
  required: boolean;
  min_value: number | null;
  max_value: number | null;
  unit: string | null;
  options: Record<string, unknown>;
  is_ccp: boolean;
  tracking_mode: TrackingMode;
  frequency_per_day: number | null;
  frequency_interval_minutes: number | null;
  deviation_action: string | null;
  sort_order: number;
}

export interface SystemTemplate {
  id: string;
  business_type: string;
  name: string;
  timing: CheckTiming;
  scope: CheckScope;
  layer: CheckLayer;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  items: SystemTemplateItem[];
}

export interface TemplateItem {
  id: string;
  store_id: string;
  template_id: string;
  item_key: string;
  label: string;
  item_type: CheckItemType;
  required: boolean;
  min_value: number | null;
  max_value: number | null;
  unit: string | null;
  options: Record<string, unknown>;
  is_ccp: boolean;
  tracking_mode: TrackingMode;
  frequency_per_day: number | null;
  frequency_interval_minutes: number | null;
  deviation_action: string | null;
  sort_order: number;
  switchbot_device_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChecklistTemplate {
  id: string;
  store_id: string;
  system_template_id: string | null;
  name: string;
  timing: CheckTiming;
  scope: CheckScope;
  layer: CheckLayer;
  version: number;
  is_active: boolean;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  items?: TemplateItem[];
}

export interface Assignment {
  id: string;
  store_id: string;
  timing: CheckTiming;
  scope: CheckScope;
  shift_type: string | null;
  template_id: string;
  created_at: string;
}

/** active エンドポイントの merged_items */
export interface ActiveItem extends TemplateItem {
  template_id: string;
  template_name: string;
  template_layer: CheckLayer;
}

/** 提出時の各項目 */
export interface SubmissionItemInput {
  template_item_id: string | null;
  item_key: string;
  bool_value?: boolean | null;
  numeric_value?: number | null;
  text_value?: string | null;
  select_value?: string | null;
  file_path?: string | null;
  checked_by?: string | null;
  checked_at?: string | null;
}

export interface Submission {
  id: string;
  store_id: string;
  membership_id: string;
  session_id: string | null;
  shift_slot_id: string | null;
  timing: CheckTiming;
  scope: CheckScope;
  template_id: string;
  template_version: number;
  all_passed: boolean;
  has_deviation: boolean;
  responsible_membership_id: string | null;
  submitted_at: string;
  submitted_by: string;
  approved_by: string | null;
  approved_at: string | null;
  snapshot: Record<string, unknown>;
}

export interface Measurement {
  id: string;
  store_id: string;
  template_item_id: string | null;
  item_key: string;
  bool_value: boolean | null;
  numeric_value: number | null;
  text_value: string | null;
  passed: boolean | null;
  measured_at: string;
  source: 'manual' | 'sensor' | 'import';
  context: Record<string, unknown>;
  created_at: string;
}

export interface DailySummary {
  date: string;
  item_key: string | null;
  count: number;
  numeric_count: number;
  min: number | null;
  max: number | null;
  avg: number | null;
  deviation_count: number;
}

export interface Deviation {
  id: string;
  store_id: string;
  submission_id: string | null;
  submission_item_id: string | null;
  measurement_id: string | null;
  template_item_id: string | null;
  item_key: string;
  severity: DeviationSeverity;
  status: DeviationStatus;
  detected_value: string | null;
  description: string | null;
  corrective_action: string | null;
  corrected_by: string | null;
  corrected_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── API メソッド ──────────────────────────────────────────────────────────────

export const checkApi = {
  // ── システムテンプレート ──────────────────────────────────────────────────
  getSystemTemplates: (businessType = 'cafe') =>
    request<{ system_templates: SystemTemplate[] }>(`/system-templates?business_type=${businessType}`),

  // ── 店舗テンプレート ──────────────────────────────────────────────────────
  getTemplates: (storeId: string, params?: { scope?: CheckScope; timing?: CheckTiming; layer?: CheckLayer }) => {
    const q = new URLSearchParams();
    if (params?.scope)   q.set('scope', params.scope);
    if (params?.timing)  q.set('timing', params.timing);
    if (params?.layer)   q.set('layer', params.layer);
    const qs = q.toString() ? `?${q}` : '';
    return request<{ templates: ChecklistTemplate[] }>(`/${storeId}/templates${qs}`);
  },

  fromSystemTemplate: (storeId: string, systemTemplateId: string) =>
    request<{ template: ChecklistTemplate }>(`/${storeId}/templates/from-system`, {
      method: 'POST',
      body: JSON.stringify({ system_template_id: systemTemplateId }),
    }),

  createTemplate: (storeId: string, data: {
    name: string;
    timing: CheckTiming;
    scope: CheckScope;
    layer: CheckLayer;
    description?: string;
    sort_order?: number;
  }) =>
    request<{ template: ChecklistTemplate }>(`/${storeId}/templates`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getTemplate: (storeId: string, templateId: string) =>
    request<{ template: ChecklistTemplate }>(`/${storeId}/templates/${templateId}`),

  updateTemplate: (storeId: string, templateId: string, data: Partial<{
    name: string;
    timing: CheckTiming;
    scope: CheckScope;
    layer: CheckLayer;
    description: string;
    is_active: boolean;
  }>) =>
    request<{ template: ChecklistTemplate }>(`/${storeId}/templates/${templateId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteTemplate: (storeId: string, templateId: string) =>
    request<{ ok: boolean }>(`/${storeId}/templates/${templateId}`, { method: 'DELETE' }),

  // ── テンプレート項目 ──────────────────────────────────────────────────────
  addItem: (storeId: string, templateId: string, data: {
    label: string;
    item_key?: string;
    item_type?: CheckItemType;
    required?: boolean;
    min_value?: number | null;
    max_value?: number | null;
    unit?: string | null;
    options?: Record<string, unknown>;
    is_ccp?: boolean;
    tracking_mode?: TrackingMode;
    frequency_per_day?: number | null;
    frequency_interval_minutes?: number | null;
    deviation_action?: string | null;
    sort_order?: number;
    switchbot_device_id?: string | null;
  }) =>
    request<{ item: TemplateItem }>(`/${storeId}/templates/${templateId}/items`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateItem: (storeId: string, itemId: string, data: Partial<Omit<TemplateItem, 'id' | 'store_id' | 'template_id' | 'created_at' | 'updated_at'>>) =>
    request<{ item: TemplateItem }>(`/${storeId}/template-items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteItem: (storeId: string, itemId: string) =>
    request<{ ok: boolean }>(`/${storeId}/template-items/${itemId}`, { method: 'DELETE' }),

  // ── 割当 ──────────────────────────────────────────────────────────────────
  getAssignments: (storeId: string) =>
    request<{ assignments: Assignment[] }>(`/${storeId}/assignments`),

  updateAssignments: (storeId: string, mappings: Array<{
    timing: CheckTiming;
    scope: CheckScope;
    shift_type?: string | null;
    template_id: string;
  }>) =>
    request<{ assignments: Assignment[] }>(`/${storeId}/assignments`, {
      method: 'PUT',
      body: JSON.stringify({ mappings }),
    }),

  // ── 実行時 ────────────────────────────────────────────────────────────────
  getActive: (storeId: string, scope: CheckScope, timing: CheckTiming, shiftType?: string) => {
    const q = new URLSearchParams({ scope, timing });
    if (shiftType) q.set('shift_type', shiftType);
    return request<{ templates: ChecklistTemplate[]; merged_items: ActiveItem[] }>(`/${storeId}/active?${q}`);
  },

  createSubmission: (storeId: string, data: {
    scope: CheckScope;
    timing: CheckTiming;
    template_id: string;
    membership_id: string;
    session_id?: string | null;
    shift_slot_id?: string | null;
    responsible_membership_id?: string | null;
    items: SubmissionItemInput[];
  }) =>
    request<{ submission: Submission }>(`/${storeId}/submissions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getSubmissions: (storeId: string, params?: {
    from?: string;
    to?: string;
    scope?: CheckScope;
    timing?: CheckTiming;
    membership_id?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.from)          q.set('from', params.from);
    if (params?.to)            q.set('to', params.to);
    if (params?.scope)         q.set('scope', params.scope);
    if (params?.timing)        q.set('timing', params.timing);
    if (params?.membership_id) q.set('membership_id', params.membership_id);
    const qs = q.toString() ? `?${q}` : '';
    return request<{ submissions: Submission[] }>(`/${storeId}/submissions${qs}`);
  },

  // ── 測定層 ────────────────────────────────────────────────────────────────
  createMeasurement: (storeId: string, data: {
    item_key: string;
    numeric_value?: number | null;
    bool_value?: boolean | null;
    text_value?: string | null;
    measured_at?: string;
    source?: 'manual' | 'sensor' | 'import';
    context?: Record<string, unknown>;
    template_item_id?: string | null;
  }) =>
    request<{ measurement: Measurement }>(`/${storeId}/measurements`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getMeasurements: (storeId: string, params?: { item_key?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.item_key) q.set('item_key', params.item_key);
    if (params?.from)     q.set('from', params.from);
    if (params?.to)       q.set('to', params.to);
    const qs = q.toString() ? `?${q}` : '';
    return request<{ measurements: Measurement[] }>(`/${storeId}/measurements${qs}`);
  },

  getDailySummary: (storeId: string, date: string, itemKey?: string) => {
    const q = new URLSearchParams({ date });
    if (itemKey) q.set('item_key', itemKey);
    return request<{ summary: DailySummary }>(`/${storeId}/measurements/daily-summary?${q}`);
  },

  // ── 逸脱 ──────────────────────────────────────────────────────────────────
  getDeviations: (storeId: string, params?: { status?: DeviationStatus; severity?: DeviationSeverity }) => {
    const q = new URLSearchParams();
    if (params?.status)   q.set('status', params.status);
    if (params?.severity) q.set('severity', params.severity);
    const qs = q.toString() ? `?${q}` : '';
    return request<{ deviations: Deviation[] }>(`/${storeId}/deviations${qs}`);
  },

  createDeviation: (storeId: string, data: {
    item_key: string;
    severity?: DeviationSeverity;
    description?: string;
    detected_value?: string;
    submission_id?: string | null;
    template_item_id?: string | null;
  }) =>
    request<{ deviation: Deviation }>(`/${storeId}/deviations`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateDeviation: (storeId: string, deviationId: string, data: Partial<{
    corrective_action: string;
    status: DeviationStatus;
  }>) =>
    request<{ deviation: Deviation }>(`/${storeId}/deviations/${deviationId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getNfcLocationStatus: (storeId: string, locationId: string, date: string) =>
    request<{ done: boolean; submitted_at?: string; staff_name?: string }>(
      `/${storeId}/nfc-location-status?location_id=${locationId}&date=${date}`
    ),
};

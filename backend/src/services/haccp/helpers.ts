/**
 * HACCP 共通ヘルパー
 *
 * templates / submissions / measurements / deviations ルータの間で共有する
 * 定数・型ガード・純粋関数をここに集約する。
 */

import { supabaseAdmin } from '../../config/supabase';

export const VALID_TIMINGS = ['clock_in', 'clock_out', 'store_opening', 'store_closing', 'store_daily', 'ad_hoc'] as const;
export const VALID_SCOPES = ['store', 'personal'] as const;
export const VALID_LAYERS = ['base', 'shift'] as const;
export const VALID_ITEM_TYPES = ['checkbox', 'numeric', 'text', 'photo', 'select', 'nfc_location'] as const;
export const VALID_TRACKING_MODES = ['submission_only', 'measurement_only', 'both'] as const;
export const VALID_AUDIT_LEVELS = ['simple', 'shift', 'item', 'approval'] as const;
export const VALID_SEVERITIES = ['info', 'warning', 'ccp'] as const;

export type HaccpTiming = typeof VALID_TIMINGS[number];
export type HaccpScope = typeof VALID_SCOPES[number];
export type HaccpLayer = typeof VALID_LAYERS[number];

export function isValidTiming(v: string): v is HaccpTiming {
  return VALID_TIMINGS.includes(v as HaccpTiming);
}

export function isValidScope(v: string): v is HaccpScope {
  return VALID_SCOPES.includes(v as HaccpScope);
}

export function isValidLayer(v: string): v is HaccpLayer {
  return VALID_LAYERS.includes(v as HaccpLayer);
}

export interface TemplateItemLike {
  item_type: string;
  min_value: number | null;
  max_value: number | null;
}

export interface SubmissionValues {
  bool_value?: boolean | null;
  numeric_value?: number | null;
  text_value?: string | null;
  select_value?: string | null;
  file_path?: string | null;
}

export function calcPassed(item: TemplateItemLike, values: SubmissionValues): boolean | null {
  switch (item.item_type) {
    case 'checkbox':
      return values.bool_value === true;
    case 'numeric': {
      const v = values.numeric_value;
      if (v == null) return null;
      if (item.min_value != null && v < item.min_value) return false;
      if (item.max_value != null && v > item.max_value) return false;
      return true;
    }
    case 'text':
      return (values.text_value ?? '').trim().length > 0;
    case 'select':
      return (values.select_value ?? '').length > 0;
    case 'photo':
      return (values.file_path ?? '').length > 0;
    case 'nfc_location':
      return values.bool_value === true;
    default:
      return null;
  }
}

export async function getAuditLevel(storeId: string): Promise<string> {
  // 旧 check プラグインの config をそのまま読む。v2 リネーム後も store_plugins 上の
  // plugin_name は 'haccp' に統一する (seed と register 側で面倒を見る)。
  const { data } = await supabaseAdmin
    .from('store_plugins')
    .select('config')
    .eq('store_id', storeId)
    .eq('plugin_name', 'haccp')
    .maybeSingle();
  return data?.config?.audit_level ?? 'simple';
}

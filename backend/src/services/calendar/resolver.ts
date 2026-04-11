/**
 * Store calendar resolver
 *
 * master (store_business_hours) + overrides (store_calendar_overrides) をマージして
 * 「ある日の実効営業時間」を返す純関数を提供する。
 *
 * 他プラグイン (予約 / HACCP / キオスクなど) はこのモジュールだけを import すれば
 * カレンダーのテーブル構造を知らずに済む。
 */
import { supabaseAdmin } from '../../config/supabase';

export interface EffectiveHours {
  date: string;              // YYYY-MM-DD (JST)
  dayOfWeek: number;         // 0=Sun..6=Sat
  isOpen: boolean;
  openTime: string | null;   // HH:MM (JST) or null when closed
  closeTime: string | null;  // HH:MM (JST) or null when closed
  source: 'override' | 'business_hours' | 'default';
  kind?: 'closed' | 'special_hours' | 'holiday';
  label?: string | null;
}

interface BusinessHoursRow {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

interface CalendarOverrideRow {
  date: string;
  kind: 'closed' | 'special_hours' | 'holiday';
  open_time: string | null;
  close_time: string | null;
  label: string | null;
}

function toHHMM(time: string | null): string | null {
  if (!time) return null;
  // '10:00:00' → '10:00'
  return time.slice(0, 5);
}

function jstDayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00+09:00').getDay();
}

export async function getEffectiveHours(
  storeId: string,
  date: string,
): Promise<EffectiveHours> {
  const [{ data: hours }, { data: override }] = await Promise.all([
    supabaseAdmin
      .from('store_business_hours')
      .select('day_of_week, open_time, close_time, is_closed')
      .eq('store_id', storeId),
    supabaseAdmin
      .from('store_calendar_overrides')
      .select('date, kind, open_time, close_time, label')
      .eq('store_id', storeId)
      .eq('date', date)
      .maybeSingle(),
  ]);

  const dow = jstDayOfWeek(date);

  if (override) {
    const ov = override as CalendarOverrideRow;
    if (ov.kind === 'closed' || ov.kind === 'holiday') {
      return {
        date,
        dayOfWeek: dow,
        isOpen: false,
        openTime: null,
        closeTime: null,
        source: 'override',
        kind: ov.kind,
        label: ov.label,
      };
    }
    if (ov.kind === 'special_hours' && ov.open_time && ov.close_time) {
      return {
        date,
        dayOfWeek: dow,
        isOpen: true,
        openTime: toHHMM(ov.open_time),
        closeTime: toHHMM(ov.close_time),
        source: 'override',
        kind: ov.kind,
        label: ov.label,
      };
    }
  }

  const row = (hours || []).find((h): h is BusinessHoursRow => (h as BusinessHoursRow).day_of_week === dow);
  if (!row) {
    return {
      date,
      dayOfWeek: dow,
      isOpen: true,
      openTime: '10:00',
      closeTime: '22:00',
      source: 'default',
    };
  }

  if (row.is_closed) {
    return {
      date,
      dayOfWeek: dow,
      isOpen: false,
      openTime: null,
      closeTime: null,
      source: 'business_hours',
    };
  }

  return {
    date,
    dayOfWeek: dow,
    isOpen: true,
    openTime: toHHMM(row.open_time),
    closeTime: toHHMM(row.close_time),
    source: 'business_hours',
  };
}

export async function getEffectiveHoursRange(
  storeId: string,
  from: string,
  to: string,
): Promise<EffectiveHours[]> {
  const [{ data: hours }, { data: overrides }] = await Promise.all([
    supabaseAdmin
      .from('store_business_hours')
      .select('day_of_week, open_time, close_time, is_closed')
      .eq('store_id', storeId),
    supabaseAdmin
      .from('store_calendar_overrides')
      .select('date, kind, open_time, close_time, label')
      .eq('store_id', storeId)
      .gte('date', from)
      .lte('date', to),
  ]);

  const byDate = new Map<string, CalendarOverrideRow>();
  for (const o of (overrides || []) as CalendarOverrideRow[]) {
    byDate.set(o.date, o);
  }

  const result: EffectiveHours[] = [];
  const start = new Date(from + 'T00:00:00+09:00');
  const end = new Date(to + 'T00:00:00+09:00');
  for (let t = new Date(start); t <= end; t = new Date(t.getTime() + 86400000)) {
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    const dow = t.getDay();
    const override = byDate.get(dateStr);

    if (override) {
      if (override.kind === 'closed' || override.kind === 'holiday') {
        result.push({
          date: dateStr,
          dayOfWeek: dow,
          isOpen: false,
          openTime: null,
          closeTime: null,
          source: 'override',
          kind: override.kind,
          label: override.label,
        });
        continue;
      }
      if (override.kind === 'special_hours' && override.open_time && override.close_time) {
        result.push({
          date: dateStr,
          dayOfWeek: dow,
          isOpen: true,
          openTime: toHHMM(override.open_time),
          closeTime: toHHMM(override.close_time),
          source: 'override',
          kind: override.kind,
          label: override.label,
        });
        continue;
      }
    }

    const row = (hours || []).find((h): h is BusinessHoursRow => (h as BusinessHoursRow).day_of_week === dow);
    if (!row) {
      result.push({
        date: dateStr,
        dayOfWeek: dow,
        isOpen: true,
        openTime: '10:00',
        closeTime: '22:00',
        source: 'default',
      });
      continue;
    }

    if (row.is_closed) {
      result.push({
        date: dateStr,
        dayOfWeek: dow,
        isOpen: false,
        openTime: null,
        closeTime: null,
        source: 'business_hours',
      });
      continue;
    }

    result.push({
      date: dateStr,
      dayOfWeek: dow,
      isOpen: true,
      openTime: toHHMM(row.open_time),
      closeTime: toHHMM(row.close_time),
      source: 'business_hours',
    });
  }

  return result;
}

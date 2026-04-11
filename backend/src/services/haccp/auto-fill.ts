/**
 * SwitchBot → HACCP 自動入力
 *
 * SwitchBot cron が温度/湿度 reading を取得したタイミングで呼ばれる。
 * checklist_template_items の switchbot_device_id にマッチする項目があれば
 * checklist_measurements に sensor source で 1 行書き込み、
 * CCP 閾値超過なら checklist_deviations にも自動起票する。
 *
 * 単体で呼べる pure 関数として export し、cron 以外 (例えば手動 trigger) でも再利用できるようにする。
 */

import { supabaseAdmin } from '../../config/supabase';

export interface SwitchBotReading {
  /** 摂氏温度など、temperature 項目なら `°C`, humidity なら `%` 等 */
  value: number;
  unit: string;
  /** ISO 8601 timestamp */
  recordedAt: string;
}

export interface AutoFillResult {
  matched: number;
  measurements: number;
  deviations: number;
}

/**
 * 1 デバイスの 1 reading を HACCP チェックリスト測定層に自動反映する。
 *
 * 冪等性: 同じ (store_id, template_item_id, recorded_at) の組で重複挿入しない。
 * SwitchBot cron は 5 分間隔程度で呼ばれるが、同じデバイスの同時刻 reading が
 * 複数回届くケースに備える。
 */
export async function autoFillFromSwitchBot(
  storeId: string,
  deviceId: string,
  reading: SwitchBotReading,
): Promise<AutoFillResult> {
  const { data: items, error } = await supabaseAdmin
    .from('checklist_template_items')
    .select('id, item_key, item_type, min_value, max_value, is_ccp, deviation_action, required')
    .eq('store_id', storeId)
    .eq('switchbot_device_id', deviceId);

  if (error) {
    throw new Error(`checklist_template_items lookup failed: ${error.message}`);
  }

  if (!items || items.length === 0) {
    return { matched: 0, measurements: 0, deviations: 0 };
  }

  let measurementsCreated = 0;
  let deviationsCreated = 0;

  for (const item of items) {
    if (item.item_type !== 'numeric') continue;

    // 閾値判定 (min_value / max_value のうち設定されているものだけチェック)
    let passed: boolean | null = true;
    if (item.min_value != null && reading.value < Number(item.min_value)) passed = false;
    if (item.max_value != null && reading.value > Number(item.max_value)) passed = false;

    // 同時刻重複防止: 既存の measurement を探してから insert
    const { data: existing } = await supabaseAdmin
      .from('checklist_measurements')
      .select('id')
      .eq('store_id', storeId)
      .eq('template_item_id', item.id)
      .eq('measured_at', reading.recordedAt)
      .eq('source', 'sensor')
      .maybeSingle();

    if (existing) {
      continue;
    }

    const { data: measurement, error: measErr } = await supabaseAdmin
      .from('checklist_measurements')
      .insert({
        store_id: storeId,
        template_item_id: item.id,
        item_key: item.item_key,
        numeric_value: reading.value,
        passed,
        measured_at: reading.recordedAt,
        source: 'sensor',
        context: {
          switchbot_device_id: deviceId,
          unit: reading.unit,
        },
      })
      .select('id')
      .single();

    if (measErr || !measurement) {
      console.error('[haccp auto-fill] measurement insert failed:', measErr?.message);
      continue;
    }

    measurementsCreated++;

    if (passed === false) {
      const severity = item.is_ccp ? 'ccp' : 'warning';
      const { error: devErr } = await supabaseAdmin
        .from('checklist_deviations')
        .insert({
          store_id: storeId,
          template_item_id: item.id,
          measurement_id: measurement.id,
          item_key: item.item_key,
          severity,
          status: 'open',
          detected_value: String(reading.value),
          description: item.deviation_action ?? null,
        });
      if (!devErr) deviationsCreated++;
    }
  }

  return { matched: items.length, measurements: measurementsCreated, deviations: deviationsCreated };
}

/**
 * LINE Messaging API Webhook
 * LINEチャットからテキストコマンドで打刻操作を行う。
 *
 * 対応コマンド:
 *   出勤 / しゅっきん → clock_in
 *   休憩 / きゅうけい → break_start
 *   休憩終了 / もどり → break_end
 *   退勤 / たいきん → clock_out
 *   状態 / ステータス → 当日状態表示
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../../config/supabase';
import {
  calcBusinessDate, nextSessionNo, calcBreakMinutes,
  checkIdempotency, writeEvent, getPolicy,
} from '../attendance/helpers';

const router = Router();

// ================================================================
// Webhook 署名検証
// ================================================================
function verifySignature(body: string, signature: string, channelSecret: string): boolean {
  const hash = crypto.createHmac('SHA256', channelSecret).update(body).digest('base64');
  return hash === signature;
}

// ================================================================
// LINE Reply API
// ================================================================
async function replyMessage(replyToken: string, text: string, accessToken: string) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  });
}

// ================================================================
// テキストコマンド → アクション解決
// ================================================================
type PunchAction = 'clock_in' | 'break_start' | 'break_end' | 'clock_out' | 'status' | null;

function parseCommand(text: string): PunchAction {
  const t = text.trim().toLowerCase();
  if (/^(出勤|しゅっきん)/.test(t)) return 'clock_in';
  if (/^(休憩終了|きゅうけいおわり|もどり|戻り)/.test(t)) return 'break_end';
  if (/^(休憩|きゅうけい)/.test(t)) return 'break_start';
  if (/^(退勤|たいきん)/.test(t)) return 'clock_out';
  if (/^(状態|ステータス|じょうたい)/.test(t)) return 'status';
  return null;
}

// ================================================================
// LINE userId → ITAMIN ユーザー + 店舗解決
// ================================================================
async function resolveLineUser(lineUserId: string): Promise<{
  userId: string;
  storeId: string;
  staffId: string;
  storeName: string;
} | null> {
  const { data: link } = await supabaseAdmin
    .from('line_user_links')
    .select('user_id')
    .eq('line_user_id', lineUserId)
    .eq('status', 'active')
    .maybeSingle();

  if (!link) return null;

  // ユーザーの所属店舗を取得（最初の1つ）
  const { data: membership } = await supabaseAdmin
    .from('store_staff')
    .select('id, store_id, store:stores(name)')
    .eq('user_id', link.user_id)
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  return {
    userId: link.user_id,
    storeId: membership.store_id,
    staffId: membership.id,
    storeName: (membership as any).store?.name || '',
  };
}

// ================================================================
// 打刻実行
// ================================================================
async function executePunch(action: PunchAction, userId: string, storeId: string): Promise<string> {
  const policy = await getPolicy(supabaseAdmin, storeId);
  const now = new Date();
  const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: policy.timezone });
  const businessDate = calcBusinessDate(now, policy.timezone, policy.business_day_cutoff_hour);

  if (action === 'status') {
    const { data: active } = await supabaseAdmin
      .from('attendance_records')
      .select('status, clock_in_at, breaks:attendance_breaks(*)')
      .eq('store_id', storeId)
      .eq('user_id', userId)
      .in('status', ['working', 'on_break'])
      .maybeSingle();

    if (!active) {
      const { data: completed } = await supabaseAdmin
        .from('attendance_records')
        .select('clock_in_at, clock_out_at, breaks:attendance_breaks(*)')
        .eq('store_id', storeId)
        .eq('user_id', userId)
        .eq('business_date', businessDate)
        .eq('status', 'completed')
        .order('clock_in_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (completed) {
        const inTime = new Date(completed.clock_in_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: policy.timezone });
        const outTime = new Date(completed.clock_out_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: policy.timezone });
        return `退勤済み\n出勤 ${inTime} → 退勤 ${outTime}`;
      }
      return '未出勤です';
    }

    const inTime = new Date(active.clock_in_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: policy.timezone });
    const breakMin = calcBreakMinutes(active.breaks || []);
    const statusLabel = active.status === 'on_break' ? '休憩中' : '勤務中';
    return `${statusLabel}\n出勤 ${inTime}${breakMin > 0 ? `\n休憩 ${breakMin}分` : ''}`;
  }

  if (action === 'clock_in') {
    const { data: open } = await supabaseAdmin
      .from('attendance_records').select('id')
      .eq('user_id', userId).in('status', ['working', 'on_break']).maybeSingle();
    if (open) return '既に勤務中です';

    const sessionNo = await nextSessionNo(supabaseAdmin, userId, businessDate);
    const { data: record, error } = await supabaseAdmin
      .from('attendance_records')
      .insert({
        store_id: storeId, user_id: userId, business_date: businessDate,
        session_no: sessionNo, status: 'working', clock_in_at: now.toISOString(),
        source: 'line_chat', clock_in_method: 'line_chat',
        created_by: userId, updated_by: userId,
      })
      .select().single();
    if (error) return 'エラーが発生しました';

    await writeEvent(supabaseAdmin, {
      storeId, userId, recordId: record.id,
      eventType: 'clock_in', source: 'line_chat',
    });
    return `出勤しました (${timeStr})`;
  }

  if (action === 'break_start') {
    const { data: session } = await supabaseAdmin
      .from('attendance_records').select('id')
      .eq('store_id', storeId).eq('user_id', userId).eq('status', 'working').maybeSingle();
    if (!session) return '勤務中ではありません';

    const { data: openBreak } = await supabaseAdmin
      .from('attendance_breaks').select('id')
      .eq('attendance_record_id', session.id).is('ended_at', null).maybeSingle();
    if (openBreak) return '既に休憩中です';

    await supabaseAdmin.from('attendance_breaks').insert({ attendance_record_id: session.id, started_at: now.toISOString() });
    await supabaseAdmin.from('attendance_records')
      .update({ status: 'on_break', updated_by: userId, updated_at: now.toISOString() })
      .eq('id', session.id);
    await writeEvent(supabaseAdmin, { storeId, userId, recordId: session.id, eventType: 'break_start', source: 'line_chat' });
    return `休憩開始 (${timeStr})`;
  }

  if (action === 'break_end') {
    const { data: session } = await supabaseAdmin
      .from('attendance_records').select('id')
      .eq('store_id', storeId).eq('user_id', userId).eq('status', 'on_break').maybeSingle();
    if (!session) return '休憩中ではありません';

    const { data: openBreak } = await supabaseAdmin
      .from('attendance_breaks').select('id')
      .eq('attendance_record_id', session.id).is('ended_at', null).maybeSingle();
    if (openBreak) {
      await supabaseAdmin.from('attendance_breaks').update({ ended_at: now.toISOString() }).eq('id', openBreak.id);
    }
    await supabaseAdmin.from('attendance_records')
      .update({ status: 'working', updated_by: userId, updated_at: now.toISOString() })
      .eq('id', session.id);
    await writeEvent(supabaseAdmin, { storeId, userId, recordId: session.id, eventType: 'break_end', source: 'line_chat' });
    return `休憩終了 (${timeStr})\nお仕事がんばりましょう`;
  }

  if (action === 'clock_out') {
    const { data: session } = await supabaseAdmin
      .from('attendance_records').select('id, status, clock_in_at')
      .eq('store_id', storeId).eq('user_id', userId)
      .in('status', ['working', 'on_break']).maybeSingle();
    if (!session) return '勤務中ではありません';

    if (session.status === 'on_break') {
      if (!policy.auto_close_break_before_clock_out) {
        return '休憩中です。先に「休憩終了」してから退勤してください';
      }
      const { data: openBreak } = await supabaseAdmin
        .from('attendance_breaks').select('id')
        .eq('attendance_record_id', session.id).is('ended_at', null).maybeSingle();
      if (openBreak) {
        await supabaseAdmin.from('attendance_breaks').update({ ended_at: now.toISOString() }).eq('id', openBreak.id);
      }
    }

    await supabaseAdmin.from('attendance_records')
      .update({ status: 'completed', clock_out_at: now.toISOString(), clock_out_method: 'line_chat', updated_by: userId, updated_at: now.toISOString() })
      .eq('id', session.id);
    await writeEvent(supabaseAdmin, { storeId, userId, recordId: session.id, eventType: 'clock_out', source: 'line_chat' });

    const inTime = new Date(session.clock_in_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: policy.timezone });
    return `退勤しました (${timeStr})\n${inTime} → ${timeStr}\nお疲れさまでした`;
  }

  return 'エラーが発生しました';
}

// ================================================================
// Webhook メイン
// ================================================================
router.post('/', async (req: Request, res: Response) => {
  // 署名検証のため raw body が必要（express.json の前に処理する必要があるが、
  // 今回は JSON.stringify(req.body) で再構築する簡易方式）
  const channelSecret = process.env.LINE_BOT_CHANNEL_SECRET || '';
  const accessToken = process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN || '';

  if (!channelSecret || !accessToken) {
    // 店舗別設定から取得を試みる
    // TODO: 複数店舗対応時はイベントのlineUserIdから店舗を特定
    res.status(200).json({ ok: true }); // LINE は 200 を期待
    return;
  }

  // 署名検証（簡易版: req.body が JSON parse 済みなので再 stringify）
  const signature = req.headers['x-line-signature'] as string;
  if (signature) {
    const rawBody = JSON.stringify(req.body);
    if (!verifySignature(rawBody, signature, channelSecret)) {
      console.error('[webhook] signature verification failed');
      res.status(200).json({ ok: true });
      return;
    }
  }

  const events = req.body?.events || [];

  for (const event of events) {
    if (event.type !== 'message' || event.message?.type !== 'text') continue;

    const lineUserId = event.source?.userId;
    const text = event.message.text;
    const replyToken = event.replyToken;

    if (!lineUserId || !replyToken) continue;

    const action = parseCommand(text);
    if (!action) {
      // 未対応コマンド → ヘルプ
      await replyMessage(replyToken, [
        '打刻コマンド:',
        '「出勤」→ 出勤打刻',
        '「休憩」→ 休憩開始',
        '「休憩終了」→ 休憩終了',
        '「退勤」→ 退勤打刻',
        '「状態」→ 今の状態確認',
      ].join('\n'), accessToken);
      continue;
    }

    const user = await resolveLineUser(lineUserId);
    if (!user) {
      await replyMessage(replyToken, 'LINE連携がされていません。管理者に連携コードを発行してもらってください。', accessToken);
      continue;
    }

    try {
      const result = await executePunch(action, user.userId, user.storeId);
      await replyMessage(replyToken, result, accessToken);
    } catch (e: any) {
      console.error('[webhook] punch error:', e);
      await replyMessage(replyToken, 'エラーが発生しました。しばらく待ってから再度お試しください。', accessToken);
    }
  }

  res.status(200).json({ ok: true });
});

export const lineWebhookRouter = router;

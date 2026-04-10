// ============================================================
// Reservation email dispatch (Resend HTTP API)
// ============================================================
// - RESEND_API_KEY 未設定の環境では noop (ローカル/テスト向け)
// - 外部パッケージを増やさないため fetch で直接叩く
// - 送信は reservation_notifications キューを読む cron から呼ぶ想定
//   (Phase 1 MVP では作成/キャンセル時に即時 dispatch も許容)

import { supabaseAdmin } from '../../config/supabase';
import type { ReservationRow, PublicStoreInfo } from './types';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

function defaultFrom(): string {
  return process.env.RESEND_FROM || 'ITAMIN 予約 <onboarding@resend.dev>';
}

export async function sendEmail(msg: EmailMessage): Promise<{ id?: string; skipped?: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[email] RESEND_API_KEY not set — skipping send', { to: msg.to, subject: msg.subject });
    return { skipped: true };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: msg.from || defaultFrom(),
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn('[email] resend failed', res.status, text);
      return { error: `resend ${res.status}: ${text}` };
    }
    const body = (await res.json()) as { id?: string };
    return { id: body.id };
  } catch (err) {
    console.warn('[email] resend fetch error', err);
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ------------------------------------------------------------
// Template helpers
// ------------------------------------------------------------
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
    weekday: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderConfirmEmail(params: {
  reservation: ReservationRow;
  store: { name: string; slug: string | null; phone: string | null };
}): EmailMessage | null {
  if (!params.reservation.customer_email) return null;
  const r = params.reservation;
  const when = fmtDateTime(r.starts_at);
  const store = params.store;

  const html = `
<!doctype html>
<html lang="ja"><body style="font-family: -apple-system, 'Hiragino Sans', sans-serif; color: #0f172a; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #0f172a;">ご予約ありがとうございます</h2>
  <p>${escapeHtml(r.customer_name)} 様</p>
  <p>${escapeHtml(store.name)} のご予約を承りました。</p>

  <div style="background: #f1f5f9; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
    <div style="font-size: 12px; color: #64748b;">日時</div>
    <div style="font-size: 18px; font-weight: 700; margin-bottom: 10px;">${escapeHtml(when)}</div>

    <div style="font-size: 12px; color: #64748b;">人数</div>
    <div style="margin-bottom: 10px;">${r.party_size}名</div>

    <div style="font-size: 12px; color: #64748b;">確認コード</div>
    <div style="font-family: monospace; font-size: 16px; letter-spacing: 0.1em; font-weight: 700;">${escapeHtml(r.confirmation_code)}</div>
  </div>

  ${r.notes ? `<p style="font-size: 13px; color: #475569;">備考: ${escapeHtml(r.notes)}</p>` : ''}

  <p style="font-size: 13px; color: #475569;">
    ご変更・キャンセルは${store.phone ? `お電話（${escapeHtml(store.phone)}）または` : ''}確認コードを添えてご連絡ください。
  </p>

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
  <p style="font-size: 11px; color: #94a3b8;">このメールは ITAMIN 予約システムから自動送信されました。</p>
</body></html>
`.trim();

  return {
    to: r.customer_email as string,
    subject: `【${store.name}】ご予約確認 (${fmtDateTime(r.starts_at)})`,
    html,
  };
}

export function renderCancelEmail(params: {
  reservation: ReservationRow;
  store: { name: string; phone: string | null };
}): EmailMessage | null {
  if (!params.reservation.customer_email) return null;
  const r = params.reservation;
  const when = fmtDateTime(r.starts_at);

  const html = `
<!doctype html>
<html lang="ja"><body style="font-family: -apple-system, 'Hiragino Sans', sans-serif; color: #0f172a; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2>ご予約のキャンセルを承りました</h2>
  <p>${escapeHtml(r.customer_name)} 様</p>
  <p>${escapeHtml(params.store.name)} の以下のご予約をキャンセルいたしました。</p>

  <div style="background: #fef2f2; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
    <div style="font-size: 12px; color: #64748b;">日時</div>
    <div style="font-weight: 700; margin-bottom: 8px;">${escapeHtml(when)}</div>
    <div style="font-size: 12px; color: #64748b;">確認コード</div>
    <div style="font-family: monospace;">${escapeHtml(r.confirmation_code)}</div>
  </div>

  <p style="font-size: 13px; color: #475569;">またのご利用を心よりお待ちしております。</p>
</body></html>
`.trim();

  return {
    to: r.customer_email as string,
    subject: `【${params.store.name}】ご予約キャンセル受付`,
    html,
  };
}

// ------------------------------------------------------------
// LINE push (optional channel)
// ------------------------------------------------------------
// 顧客の LINE userId が reservation_notifications.recipient に入っている場合のみ送信。
// 店舗の LINE チャネルアクセストークンは stores.line_channel_access_token を想定。
// (未設定なら skipped)

async function sendLinePush(
  recipientUserId: string,
  accessToken: string,
  text: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to: recipientUserId,
        messages: [{ type: 'text', text }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { error: `line ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function renderLineText(kind: string, reservation: ReservationRow, storeName: string): string {
  const when = fmtDateTime(reservation.starts_at);
  if (kind === 'confirm') {
    return `【${storeName}】ご予約を承りました\n${when}\n${reservation.party_size}名\n確認コード: ${reservation.confirmation_code}`;
  }
  if (kind === 'cancel') {
    return `【${storeName}】ご予約をキャンセルしました\n${when}\n確認コード: ${reservation.confirmation_code}`;
  }
  return `【${storeName}】${when} (${reservation.confirmation_code})`;
}

// ------------------------------------------------------------
// Notification queue worker
// ------------------------------------------------------------
// cron から呼ばれる想定。pending 通知を順次処理する。
export async function dispatchPendingNotifications(limit: number = 20): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  const { data: queue, error } = await supabaseAdmin
    .from('reservation_notifications')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.warn('[email] queue query failed', error.message);
    return { processed: 0, sent: 0, failed: 0, skipped: 0 };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const n of (queue || []) as Array<{
    id: string;
    reservation_id: string;
    channel: string;
    kind: string;
    recipient: string | null;
  }>) {
    // reservation + store を取る
    const { data: r } = await supabaseAdmin
      .from('reservations')
      .select('*')
      .eq('id', n.reservation_id)
      .maybeSingle();

    if (!r) {
      await supabaseAdmin
        .from('reservation_notifications')
        .update({ status: 'failed', error: 'reservation not found' })
        .eq('id', n.id);
      failed++;
      continue;
    }

    const reservation = r as ReservationRow;
    const { data: storeRow } = await supabaseAdmin
      .from('stores')
      .select('id, slug, name, phone, address')
      .eq('id', reservation.store_id)
      .maybeSingle();
    const store = (storeRow || { name: '店舗', slug: null, phone: null }) as Partial<PublicStoreInfo> & {
      name: string;
      slug: string | null;
      phone: string | null;
    };

    if (n.channel === 'line') {
      if (!n.recipient) {
        await supabaseAdmin
          .from('reservation_notifications')
          .update({ status: 'skipped', error: 'no LINE recipient (customer not linked)' })
          .eq('id', n.id);
        skipped++;
        continue;
      }
      // 店舗の LINE チャネルトークンを取る
      const { data: lineConfig } = await supabaseAdmin
        .from('line_channels')
        .select('access_token')
        .eq('store_id', reservation.store_id)
        .maybeSingle();
      const accessToken = (lineConfig as { access_token?: string } | null)?.access_token;
      if (!accessToken) {
        await supabaseAdmin
          .from('reservation_notifications')
          .update({ status: 'skipped', error: 'LINE channel not configured for store' })
          .eq('id', n.id);
        skipped++;
        continue;
      }
      const text = renderLineText(n.kind, reservation, store.name);
      const result = await sendLinePush(n.recipient, accessToken, text);
      if (result.error) {
        await supabaseAdmin
          .from('reservation_notifications')
          .update({ status: 'failed', error: result.error })
          .eq('id', n.id);
        failed++;
      } else {
        await supabaseAdmin
          .from('reservation_notifications')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', n.id);
        sent++;
      }
      continue;
    }

    if (n.channel !== 'email') {
      await supabaseAdmin
        .from('reservation_notifications')
        .update({ status: 'skipped', error: `channel ${n.channel} not supported` })
        .eq('id', n.id);
      skipped++;
      continue;
    }

    let msg: EmailMessage | null = null;
    if (n.kind === 'confirm') {
      msg = renderConfirmEmail({ reservation, store: { name: store.name, slug: store.slug, phone: store.phone } });
    } else if (n.kind === 'cancel') {
      msg = renderCancelEmail({ reservation, store: { name: store.name, phone: store.phone } });
    }

    if (!msg) {
      await supabaseAdmin
        .from('reservation_notifications')
        .update({ status: 'skipped', error: `kind ${n.kind} not implemented` })
        .eq('id', n.id);
      skipped++;
      continue;
    }

    const result = await sendEmail(msg);
    if (result.skipped) {
      await supabaseAdmin
        .from('reservation_notifications')
        .update({ status: 'skipped', error: 'RESEND_API_KEY not configured' })
        .eq('id', n.id);
      skipped++;
    } else if (result.error) {
      await supabaseAdmin
        .from('reservation_notifications')
        .update({ status: 'failed', error: result.error })
        .eq('id', n.id);
      failed++;
    } else {
      await supabaseAdmin
        .from('reservation_notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', n.id);
      sent++;
    }
  }

  return { processed: (queue || []).length, sent, failed, skipped };
}

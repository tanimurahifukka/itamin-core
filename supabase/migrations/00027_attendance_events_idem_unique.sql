-- idempotency_key を (store_id, user_id) スコープで一意化する。
-- 目的: 別テナントや別ユーザーが同一 idempotency_key を送信しても衝突扱いにならないようにし、
--      同時に同一テナント内の同一ユーザーによる重複 POST を DB レベルで確実に弾く。

CREATE UNIQUE INDEX IF NOT EXISTS attendance_events_store_user_idem_unique
  ON public.attendance_events (store_id, user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 旧: グローバルな idempotency_key unique があれば削除 (存在しない場合は何もしない)
DROP INDEX IF EXISTS public.attendance_events_idempotency_key_key;

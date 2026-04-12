-- ============================================================
-- 00034: Atomic capacity check + reservation insert
-- ============================================================
-- BUG-4: Fix race condition in capacity-based reservation.
-- Previously, count and insert were separate queries with a gap
-- where concurrent requests could both succeed and exceed capacity.
--
-- This function uses SELECT FOR UPDATE to lock active reservations
-- for the resource_ref, then atomically checks remaining capacity
-- and inserts the new reservation.
-- ============================================================

CREATE OR REPLACE FUNCTION public.reserve_with_capacity_check(
  p_store_id       UUID,
  p_resource_ref   UUID,
  p_capacity       INT,
  p_starts_at      TIMESTAMPTZ,
  p_ends_at        TIMESTAMPTZ,
  p_party_size     INT,
  p_type           TEXT,
  p_source         TEXT,
  p_confirmation_code TEXT,
  p_customer_id    UUID,
  p_customer_name  TEXT,
  p_customer_phone TEXT,
  p_customer_email TEXT,
  p_notes          TEXT,
  p_metadata       JSONB,
  p_created_by     UUID
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_booked INT;
  v_remaining INT;
  v_id UUID;
BEGIN
  -- Advisory lock on the resource_ref to serialize concurrent inserts
  -- (FOR UPDATE only locks existing rows; advisory lock covers the empty-table case)
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::TEXT || ':' || p_resource_ref::TEXT));

  -- Lock existing active reservations for this resource
  PERFORM id FROM public.reservations
    WHERE store_id = p_store_id
      AND resource_ref = p_resource_ref::TEXT
      AND status IN ('pending', 'confirmed', 'seated')
      AND starts_at < p_ends_at
      AND ends_at > p_starts_at
    FOR UPDATE;

  -- Count booked party size
  SELECT COALESCE(SUM(party_size), 0) INTO v_booked
    FROM public.reservations
    WHERE store_id = p_store_id
      AND resource_ref = p_resource_ref::TEXT
      AND status IN ('pending', 'confirmed', 'seated')
      AND starts_at < p_ends_at
      AND ends_at > p_starts_at;

  v_remaining := p_capacity - v_booked;

  IF v_remaining < p_party_size THEN
    IF v_remaining <= 0 THEN
      RAISE EXCEPTION 'この枠は満席です' USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION '残り % 名分しか受け付けられません', v_remaining USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.reservations (
    store_id, customer_id, reservation_type, status,
    starts_at, ends_at, party_size, resource_ref, source,
    confirmation_code, customer_name, customer_phone, customer_email,
    notes, metadata, created_by
  ) VALUES (
    p_store_id, p_customer_id, p_type, 'confirmed',
    p_starts_at, p_ends_at, p_party_size, p_resource_ref::TEXT, p_source,
    p_confirmation_code, p_customer_name, p_customer_phone, p_customer_email,
    p_notes, p_metadata, p_created_by
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- CRM-2: Helper to increment customer visit_count
CREATE OR REPLACE FUNCTION public.increment_customer_visit(p_customer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.customers
  SET visit_count = COALESCE(visit_count, 0) + 1,
      last_visited_at = now(),
      updated_at = now()
  WHERE id = p_customer_id;
END;
$$;

SELECT 'CAPACITY CHECK FUNCTION + VISIT INCREMENT CREATED' AS status;

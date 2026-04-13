-- ============================================================
-- 00035: Fix reserve_with_capacity_check + security hardening
-- ============================================================
-- C1: Remove ::TEXT casts on resource_ref (UUID column) to allow index usage
-- C2: Restrict function execution to service_role only
-- H7: Use 2-argument pg_advisory_xact_lock for 64-bit key space

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
SECURITY DEFINER
AS $$
DECLARE
  v_booked INT;
  v_remaining INT;
  v_id UUID;
BEGIN
  -- Advisory lock: 2-argument version for 64-bit key space (avoids hashtext collision)
  PERFORM pg_advisory_xact_lock(
    hashtext(p_store_id::TEXT),
    hashtext(p_resource_ref::TEXT)
  );

  -- Lock existing active reservations for this resource
  PERFORM id FROM public.reservations
    WHERE store_id = p_store_id
      AND resource_ref = p_resource_ref
      AND status IN ('pending', 'confirmed', 'seated')
      AND starts_at < p_ends_at
      AND ends_at > p_starts_at
    FOR UPDATE;

  -- Count booked party size
  SELECT COALESCE(SUM(party_size), 0) INTO v_booked
    FROM public.reservations
    WHERE store_id = p_store_id
      AND resource_ref = p_resource_ref
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
    p_starts_at, p_ends_at, p_party_size, p_resource_ref, p_source,
    p_confirmation_code, p_customer_name, p_customer_phone, p_customer_email,
    p_notes, p_metadata, p_created_by
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Restrict execution to service_role only
REVOKE ALL ON FUNCTION public.reserve_with_capacity_check(UUID,UUID,INT,TIMESTAMPTZ,TIMESTAMPTZ,INT,TEXT,TEXT,TEXT,UUID,TEXT,TEXT,TEXT,TEXT,JSONB,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_with_capacity_check(UUID,UUID,INT,TIMESTAMPTZ,TIMESTAMPTZ,INT,TEXT,TEXT,TEXT,UUID,TEXT,TEXT,TEXT,TEXT,JSONB,UUID) TO service_role;

REVOKE ALL ON FUNCTION public.increment_customer_visit(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_customer_visit(UUID) TO service_role;

-- Add composite index for capacity check queries
CREATE INDEX IF NOT EXISTS idx_reservations_resource_store_status
  ON public.reservations(store_id, resource_ref, starts_at, ends_at)
  WHERE status IN ('pending', 'confirmed', 'seated');

SELECT 'CAPACITY CHECK FIXED + HARDENED' AS status;

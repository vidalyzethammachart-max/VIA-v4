DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.role_request_status'::regtype
      AND enumlabel = 'cancelled'
  ) THEN
    ALTER TYPE public.role_request_status ADD VALUE 'cancelled';
  END IF;
END$$;

ALTER TABLE public.role_requests
  DROP CONSTRAINT IF EXISTS role_requests_review_consistency;

ALTER TABLE public.role_requests
  ADD CONSTRAINT role_requests_review_consistency CHECK (
    (status IN ('pending', 'cancelled') AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR
    (status IN ('approved', 'rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  );

DROP POLICY IF EXISTS role_requests_update_cancel_own ON public.role_requests;

CREATE POLICY role_requests_update_cancel_own
ON public.role_requests
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND status = 'pending'::public.role_request_status
)
WITH CHECK (
  auth.uid() = user_id
  AND status = 'cancelled'::public.role_request_status
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
);

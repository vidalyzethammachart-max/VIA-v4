-- Save the signed-in user's profile through a SECURITY DEFINER RPC so the
-- client does not need to upsert user_information directly through RLS.

CREATE OR REPLACE FUNCTION public.save_my_user_information(
  p_user_id text,
  p_email text,
  p_full_name text DEFAULT NULL,
  p_employee_number text DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
)
RETURNS public.user_information
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_auth_user_id text;
  v_profile public.user_information;
BEGIN
  v_auth_user_id := auth.uid()::text;

  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF NULLIF(trim(COALESCE(p_user_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'User ID is required' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.user_information (
    auth_user_id,
    user_id,
    email,
    full_name,
    employee_number,
    gender,
    avatar_url,
    role
  )
  VALUES (
    v_auth_user_id,
    trim(p_user_id),
    NULLIF(trim(COALESCE(p_email, '')), ''),
    NULLIF(trim(COALESCE(p_full_name, '')), ''),
    NULLIF(trim(COALESCE(p_employee_number, '')), ''),
    NULLIF(trim(COALESCE(p_gender, '')), ''),
    NULLIF(trim(COALESCE(p_avatar_url, '')), ''),
    'user'::public.app_role
  )
  ON CONFLICT (auth_user_id) DO UPDATE
  SET
    user_id = EXCLUDED.user_id,
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    employee_number = EXCLUDED.employee_number,
    gender = EXCLUDED.gender,
    avatar_url = EXCLUDED.avatar_url
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_my_user_information(text, text, text, text, text, text) TO authenticated;

-- Keep avatar storage policies idempotent and aligned with the client path:
-- profile-avatars/{auth.uid()}/avatar.jpg
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-avatars', 'profile-avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS profile_avatars_public_read ON storage.objects;
CREATE POLICY profile_avatars_public_read
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'profile-avatars');

DROP POLICY IF EXISTS profile_avatars_insert_own ON storage.objects;
CREATE POLICY profile_avatars_insert_own
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS profile_avatars_update_own ON storage.objects;
CREATE POLICY profile_avatars_update_own
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'profile-avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS profile_avatars_delete_own ON storage.objects;
CREATE POLICY profile_avatars_delete_own
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

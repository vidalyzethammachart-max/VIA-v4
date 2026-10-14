-- Read-only preflight: no user identifiers or evaluation contents.
WITH identities AS (
  SELECT id, case_key,
    public.normalize_video_case_key_part(order_number) AS order_part,
    public.normalize_video_case_key_part(subject_name) AS subject_part
  FROM public.video_cases
), grouped AS (
  SELECT order_part || '-' || subject_part AS new_key, count(*) AS count
  FROM identities WHERE order_part <> '' AND subject_part <> ''
  GROUP BY order_part || '-' || subject_part
)
SELECT (SELECT count(*) FROM identities) AS total_cases,
  (SELECT count(*) FROM grouped WHERE count > 1) AS conflicting_keys,
  (SELECT count(*) FROM identities WHERE order_part <> '' AND subject_part <> ''
    AND case_key IS DISTINCT FROM order_part || '-' || subject_part) AS keys_to_change;

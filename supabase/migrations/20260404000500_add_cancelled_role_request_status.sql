-- PostgreSQL requires a newly added enum value to be committed before use.
-- Keep this in a separate migration from constraints and policies that use it.
alter type public.role_request_status add value if not exists 'cancelled';

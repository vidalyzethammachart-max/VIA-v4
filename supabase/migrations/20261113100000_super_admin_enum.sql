-- Step 1 of 3 for the super admin role. Run this file ON ITS OWN: Postgres cannot use a new enum
-- value in the transaction that adds it, so everything that uses 'super_admin' is in the next file.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS evaluations_insert_own ON public.evaluations;
DROP POLICY IF EXISTS evaluations_select_own_or_editor ON public.evaluations;
DROP POLICY IF EXISTS evaluations_select_dashboard_authenticated ON public.evaluations;
DROP POLICY IF EXISTS evaluations_update_admin_only ON public.evaluations;

CREATE POLICY evaluations_insert_own
ON public.evaluations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY evaluations_select_own
ON public.evaluations
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.evaluations TO authenticated;

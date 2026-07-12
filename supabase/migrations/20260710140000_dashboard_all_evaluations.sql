ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS evaluations_select_own ON public.evaluations;
DROP POLICY IF EXISTS evaluations_select_own_or_editor ON public.evaluations;
DROP POLICY IF EXISTS evaluations_select_dashboard_authenticated ON public.evaluations;

-- The Dashboard is a shared overview, so every signed-in user can read evaluation scores.
CREATE POLICY evaluations_select_dashboard_authenticated
ON public.evaluations
FOR SELECT
TO authenticated
USING (true);

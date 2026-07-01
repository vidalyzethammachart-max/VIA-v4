ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS evaluations_delete_own ON public.evaluations;

CREATE POLICY evaluations_delete_own
ON public.evaluations
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

GRANT DELETE ON public.evaluations TO authenticated;

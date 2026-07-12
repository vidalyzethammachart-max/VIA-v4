ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS section_averages JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.calculate_evaluation_section_averages(p_rubric JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(jsonb_object_agg(section_id, average_score), '{}'::jsonb)
  FROM (
    SELECT
      section_id,
      ROUND(AVG(question_score::numeric), 2) AS average_score
    FROM jsonb_each(COALESCE(p_rubric, '{}'::jsonb)) AS section_data(section_id, questions)
    CROSS JOIN LATERAL jsonb_each_text(
      CASE
        WHEN jsonb_typeof(questions) = 'object' THEN questions
        ELSE '{}'::jsonb
      END
    ) AS question_data(question_id, question_score)
    WHERE question_score ~ '^[1-5](\.0+)?$'
    GROUP BY section_id
  ) AS averages;
$$;

CREATE OR REPLACE FUNCTION public.sync_evaluation_section_averages()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.section_averages := public.calculate_evaluation_section_averages(NEW.rubric);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_evaluation_section_averages ON public.evaluations;
CREATE TRIGGER trg_sync_evaluation_section_averages
BEFORE INSERT OR UPDATE OF rubric ON public.evaluations
FOR EACH ROW
EXECUTE FUNCTION public.sync_evaluation_section_averages();

UPDATE public.evaluations
SET section_averages = public.calculate_evaluation_section_averages(rubric);

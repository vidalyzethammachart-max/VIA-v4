CREATE OR REPLACE FUNCTION public.calculate_evaluation_section_averages(p_rubric JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(jsonb_object_agg(section_id, average_score), '{}'::jsonb)
  FROM (
    -- Native form payload: { "1": { "q1": 5, ... }, ... }
    SELECT
      section_id,
      ROUND(AVG(question_score::numeric), 2) AS average_score
    FROM jsonb_each(COALESCE(p_rubric, '{}'::jsonb)) AS section_data(section_id, questions)
    CROSS JOIN LATERAL jsonb_each_text(
      CASE WHEN jsonb_typeof(questions) = 'object' THEN questions ELSE '{}'::jsonb END
    ) AS question_data(question_id, question_score)
    WHERE jsonb_typeof(p_rubric) = 'object'
      AND question_score ~ '^[1-5](\\.0+)?$'
    GROUP BY section_id

    UNION ALL

    -- n8n/Postman payload: [{ "key": "language_and_script", "scores": [5, ...] }, ...]
    SELECT
      section.value ->> 'key' AS section_id,
      ROUND(AVG(score.value::numeric), 2) AS average_score
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_rubric) = 'array' THEN p_rubric ELSE '[]'::jsonb END
    ) AS section(value)
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(section.value -> 'scores') = 'array' THEN section.value -> 'scores'
        ELSE '[]'::jsonb
      END
    ) AS score(value)
    WHERE section.value ->> 'key' IS NOT NULL
      AND score.value ~ '^[1-5](\\.0+)?$'
    GROUP BY section.value ->> 'key'
  ) AS averages;
$$;

-- Recalculate existing rows where a rubric contains actual numeric scores.
UPDATE public.evaluations
SET section_averages = public.calculate_evaluation_section_averages(rubric);

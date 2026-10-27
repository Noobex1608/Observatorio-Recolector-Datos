-- Run once in the SQL editor of the Supabase project configured by SUPABASE_URL.
-- These are dedicated analytical replica tables; the existing forms and
-- form_questions tables are not modified. Only service_role may access them.
BEGIN;
CREATE TABLE IF NOT EXISTS public.surveys (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  description text,
  state text NOT NULL,
  link_uuid uuid,
  step_by_step boolean NOT NULL DEFAULT false,
  owner_user_id bigint NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.questions (
  id uuid PRIMARY KEY,
  survey_id uuid NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  type text NOT NULL,
  label text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  "order" integer NOT NULL,
  help_text text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS questions_survey_order_idx ON public.questions(survey_id, "order");
ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.surveys, public.questions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.surveys, public.questions TO service_role;

CREATE OR REPLACE FUNCTION public.sync_form_schema(p_survey jsonb, p_questions jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid := (p_survey->>'id')::uuid;
BEGIN
  IF jsonb_typeof(p_questions) <> 'array' OR v_id IS NULL THEN
    RAISE EXCEPTION 'Invalid survey payload';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_questions) q WHERE (q->>'survey_id')::uuid IS DISTINCT FROM v_id) THEN
    RAISE EXCEPTION 'Question belongs to another survey';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_id::text, 0));
  -- Older queued snapshots cannot overwrite a newer replica.
  IF EXISTS (SELECT 1 FROM public.surveys WHERE id = v_id AND updated_at > (p_survey->>'updated_at')::timestamptz) THEN
    RETURN;
  END IF;
  INSERT INTO public.surveys (id,title,description,state,link_uuid,step_by_step,owner_user_id,created_at,updated_at)
    SELECT id,title,description,state,link_uuid,step_by_step,owner_user_id,created_at,updated_at
    FROM jsonb_populate_record(NULL::public.surveys, p_survey)
  ON CONFLICT (id) DO UPDATE SET title=excluded.title,description=excluded.description,state=excluded.state,
    link_uuid=excluded.link_uuid,step_by_step=excluded.step_by_step,owner_user_id=excluded.owner_user_id,updated_at=excluded.updated_at;
  DELETE FROM public.questions WHERE survey_id = v_id;
  INSERT INTO public.questions (id,survey_id,type,label,required,"order",help_text,properties,created_at,updated_at)
    SELECT id,survey_id,type,label,required,"order",help_text,properties,created_at,updated_at
    FROM jsonb_populate_recordset(NULL::public.questions, p_questions);
END;
$$;
REVOKE ALL ON FUNCTION public.sync_form_schema(jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_form_schema(jsonb,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

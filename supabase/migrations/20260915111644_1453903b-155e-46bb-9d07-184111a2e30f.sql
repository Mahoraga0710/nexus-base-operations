-- 1. account status
DO $$ BEGIN
  CREATE TYPE public.account_status AS ENUM ('pending','active','suspended','disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status public.account_status NOT NULL DEFAULT 'active';

UPDATE public.profiles p SET email = u.email FROM auth.users u WHERE u.id = p.id AND p.email IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  desired TEXT;
  assigned public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data ->> 'avatar_url',
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    assigned := 'admin';
  ELSE
    desired := NEW.raw_user_meta_data ->> 'role';
    IF desired IN ('employee', 'client') THEN
      assigned := desired::public.app_role;
    ELSE
      assigned := 'client';
    END IF;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END; $function$;

-- 2. feedback
DO $$ BEGIN
  CREATE TYPE public.feedback_status AS ENUM ('open','acknowledged','resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  status public.feedback_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feedback_select ON public.feedback;
CREATE POLICY feedback_select ON public.feedback FOR SELECT TO authenticated
  USING (public.can_view_project(project_id, auth.uid()));
DROP POLICY IF EXISTS feedback_insert ON public.feedback;
CREATE POLICY feedback_insert ON public.feedback FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.can_view_project(project_id, auth.uid()));
DROP POLICY IF EXISTS feedback_update ON public.feedback;
CREATE POLICY feedback_update ON public.feedback FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (author_id = auth.uid() OR public.is_staff(auth.uid()));
DROP POLICY IF EXISTS feedback_delete_admin ON public.feedback;
CREATE POLICY feedback_delete_admin ON public.feedback FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_feedback_updated ON public.feedback;
CREATE TRIGGER trg_feedback_updated BEFORE UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_feedback_project ON public.feedback(project_id);

-- 3. files
CREATE TABLE IF NOT EXISTS public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  uploader_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT files_target_check CHECK (project_id IS NOT NULL OR task_id IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.files TO authenticated;
GRANT ALL ON public.files TO service_role;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS files_select ON public.files;
CREATE POLICY files_select ON public.files FOR SELECT TO authenticated
  USING (public.can_view_project(public.comment_project_id(project_id, task_id), auth.uid())
         AND (is_internal = false OR public.is_staff(auth.uid())));
DROP POLICY IF EXISTS files_insert ON public.files;
CREATE POLICY files_insert ON public.files FOR INSERT TO authenticated
  WITH CHECK (uploader_id = auth.uid()
    AND public.can_view_project(public.comment_project_id(project_id, task_id), auth.uid())
    AND (is_internal = false OR public.is_staff(auth.uid())));
DROP POLICY IF EXISTS files_update_own_or_staff ON public.files;
CREATE POLICY files_update_own_or_staff ON public.files FOR UPDATE TO authenticated
  USING (uploader_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (uploader_id = auth.uid() OR public.is_staff(auth.uid()));
DROP POLICY IF EXISTS files_delete ON public.files;
CREATE POLICY files_delete ON public.files FOR DELETE TO authenticated
  USING (uploader_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_files_updated ON public.files;
CREATE TRIGGER trg_files_updated BEFORE UPDATE ON public.files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_files_project ON public.files(project_id);
CREATE INDEX IF NOT EXISTS idx_files_task ON public.files(task_id);
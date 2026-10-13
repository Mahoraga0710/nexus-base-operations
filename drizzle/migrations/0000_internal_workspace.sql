ALTER TABLE public.projects ALTER COLUMN client_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, email)
  VALUES (NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data ->> 'avatar_url', NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  -- First account becomes admin; everyone else waits for an admin to approve them.
  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $function$;

DROP POLICY IF EXISTS activity_select ON public.activity_events;
CREATE POLICY activity_select_admin ON public.activity_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS projects_update_lead_or_admin ON public.projects;
CREATE POLICY projects_update_staff ON public.projects FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS tasks_delete_staff ON public.tasks;
CREATE POLICY tasks_delete_admin_or_creator ON public.tasks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR (created_by = auth.uid() AND public.is_staff(auth.uid())));

CREATE OR REPLACE FUNCTION public.log_task_activity()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_events (actor_id, entity_type, entity_id, project_id, event_type, summary, details)
    VALUES (auth.uid(), 'task', NEW.id, NEW.project_id, 'task_created', NEW.title,
            jsonb_build_object('assignee_id', NEW.assignee_id));
    IF NEW.assignee_id IS NOT NULL THEN
      INSERT INTO public.activity_events (actor_id, entity_type, entity_id, project_id, event_type, summary, details)
      VALUES (auth.uid(), 'task', NEW.id, NEW.project_id, 'task_assigned', NEW.title,
              jsonb_build_object('assignee_id', NEW.assignee_id));
      IF NEW.assignee_id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000') THEN
        INSERT INTO public.notifications (user_id, type, title, body, link)
        VALUES (NEW.assignee_id, 'task_assigned', 'New task assigned to you', NEW.title, '/tasks');
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.activity_events (actor_id, entity_type, entity_id, project_id, event_type, summary, details)
      VALUES (auth.uid(), 'task', NEW.id, NEW.project_id, 'task_status_changed', NEW.title,
              jsonb_build_object('from', OLD.status, 'to', NEW.status));
    END IF;
    IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id AND NEW.assignee_id IS NOT NULL THEN
      INSERT INTO public.activity_events (actor_id, entity_type, entity_id, project_id, event_type, summary, details)
      VALUES (auth.uid(), 'task', NEW.id, NEW.project_id, 'task_assigned', NEW.title,
              jsonb_build_object('assignee_id', NEW.assignee_id, 'previous_assignee_id', OLD.assignee_id));
      IF NEW.assignee_id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000') THEN
        INSERT INTO public.notifications (user_id, type, title, body, link)
        VALUES (NEW.assignee_id, 'task_assigned', 'Task assigned to you', NEW.title, '/tasks');
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.log_comment_activity()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE pid UUID; t RECORD;
BEGIN
  pid := public.comment_project_id(NEW.project_id, NEW.task_id);
  INSERT INTO public.activity_events (actor_id, entity_type, entity_id, project_id, event_type, summary, details)
  VALUES (NEW.author_id, 'comment', NEW.id, pid, 'comment_added', left(NEW.body, 140),
          jsonb_build_object('task_id', NEW.task_id));
  IF NEW.task_id IS NOT NULL THEN
    SELECT title, assignee_id INTO t FROM public.tasks WHERE id = NEW.task_id;
    IF t.assignee_id IS NOT NULL AND t.assignee_id <> NEW.author_id THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (t.assignee_id, 'comment', 'New comment on ' || t.title, left(NEW.body, 140), '/tasks');
    END IF;
  END IF;
  RETURN NEW;
END; $function$;
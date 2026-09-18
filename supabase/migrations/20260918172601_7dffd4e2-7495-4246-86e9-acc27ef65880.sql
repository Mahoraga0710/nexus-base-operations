-- New enum types
CREATE TYPE public.request_kind AS ENUM ('task', 'project');
CREATE TYPE public.request_status AS ENUM ('submitted', 'accepted', 'declined', 'completed');
CREATE TYPE public.plan_tier AS ENUM ('free', 'pro', 'enterprise');

-- Tasks can be in a client-requested state
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'requested';

-- Client requests
CREATE TABLE public.client_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind public.request_kind NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  priority public.priority_level NOT NULL DEFAULT 'medium',
  desired_date date,
  status public.request_status NOT NULL DEFAULT 'submitted',
  resolution_note text,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  created_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_requests_task_needs_project CHECK (kind <> 'task' OR project_id IS NOT NULL)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_requests TO authenticated;
GRANT ALL ON public.client_requests TO service_role;
ALTER TABLE public.client_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_requests_select ON public.client_requests
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR client_id = public.current_client_id());

CREATE POLICY client_requests_insert ON public.client_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND (
      public.is_staff(auth.uid())
      OR (
        client_id = public.current_client_id()
        AND status = 'submitted'
        AND (project_id IS NULL OR public.can_view_project(project_id, auth.uid()))
      )
    )
  );

CREATE POLICY client_requests_update_staff ON public.client_requests
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY client_requests_update_own_pending ON public.client_requests
  FOR UPDATE TO authenticated
  USING (requester_id = auth.uid() AND client_id = public.current_client_id() AND status = 'submitted')
  WITH CHECK (requester_id = auth.uid() AND client_id = public.current_client_id() AND status = 'submitted');

CREATE POLICY client_requests_delete_admin ON public.client_requests
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX client_requests_client_idx ON public.client_requests (client_id, created_at DESC);
CREATE INDEX client_requests_status_idx ON public.client_requests (status, created_at DESC);
CREATE INDEX client_requests_project_idx ON public.client_requests (project_id);

CREATE TRIGGER client_requests_set_updated_at
  BEFORE UPDATE ON public.client_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper: can the current user see a given request
CREATE OR REPLACE FUNCTION public.can_view_request(_request_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_requests r
    WHERE r.id = _request_id
      AND (public.is_staff(_user_id) OR r.client_id = public.current_client_id())
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_request(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_request(uuid, uuid) TO authenticated;

-- Reference links on a request
CREATE TABLE public.request_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.client_requests(id) ON DELETE CASCADE,
  url text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_links TO authenticated;
GRANT ALL ON public.request_links TO service_role;
ALTER TABLE public.request_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY request_links_select ON public.request_links
  FOR SELECT TO authenticated
  USING (public.can_view_request(request_id, auth.uid()));

CREATE POLICY request_links_insert ON public.request_links
  FOR INSERT TO authenticated
  WITH CHECK (public.can_view_request(request_id, auth.uid()));

CREATE POLICY request_links_delete ON public.request_links
  FOR DELETE TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.client_requests r
      WHERE r.id = request_id AND r.requester_id = auth.uid() AND r.status = 'submitted'
    )
  );

CREATE INDEX request_links_request_idx ON public.request_links (request_id);

-- Files may belong to a request
ALTER TABLE public.files ADD COLUMN request_id uuid REFERENCES public.client_requests(id) ON DELETE CASCADE;
CREATE INDEX files_request_idx ON public.files (request_id);

DROP POLICY IF EXISTS files_select ON public.files;
CREATE POLICY files_select ON public.files
  FOR SELECT TO authenticated
  USING (
    (
      (request_id IS NOT NULL AND public.can_view_request(request_id, auth.uid()))
      OR (request_id IS NULL AND public.can_view_project(public.comment_project_id(project_id, task_id), auth.uid()))
    )
    AND (is_internal = false OR public.is_staff(auth.uid()))
  );

DROP POLICY IF EXISTS files_insert ON public.files;
CREATE POLICY files_insert ON public.files
  FOR INSERT TO authenticated
  WITH CHECK (
    uploader_id = auth.uid()
    AND (
      (request_id IS NOT NULL AND public.can_view_request(request_id, auth.uid()))
      OR (request_id IS NULL AND public.can_view_project(public.comment_project_id(project_id, task_id), auth.uid()))
    )
    AND (is_internal = false OR public.is_staff(auth.uid()))
  );

-- Subscriptions per client company
CREATE TABLE public.client_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  tier public.plan_tier NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.client_subscriptions TO authenticated;
GRANT ALL ON public.client_subscriptions TO service_role;
ALTER TABLE public.client_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_subscriptions_select ON public.client_subscriptions
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR client_id = public.current_client_id());

CREATE TRIGGER client_subscriptions_set_updated_at
  BEFORE UPDATE ON public.client_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Daily request usage per company
CREATE TABLE public.request_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  request_count integer NOT NULL DEFAULT 0,
  last_request_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, usage_date)
);

GRANT SELECT ON public.request_usage TO authenticated;
GRANT ALL ON public.request_usage TO service_role;
ALTER TABLE public.request_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY request_usage_select ON public.request_usage
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR client_id = public.current_client_id());

CREATE TRIGGER request_usage_set_updated_at
  BEFORE UPDATE ON public.request_usage
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Daily allowance per tier
CREATE OR REPLACE FUNCTION public.tier_daily_limit(_tier public.plan_tier)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _tier
    WHEN 'free' THEN 5
    WHEN 'pro' THEN 50
    ELSE NULL
  END
$$;

REVOKE EXECUTE ON FUNCTION public.tier_daily_limit(public.plan_tier) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tier_daily_limit(public.plan_tier) TO authenticated;

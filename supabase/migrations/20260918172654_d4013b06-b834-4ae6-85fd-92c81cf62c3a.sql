CREATE OR REPLACE FUNCTION public.enforce_request_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tier public.plan_tier;
  _limit integer;
  _today date := (now() AT TIME ZONE 'utc')::date;
  _row public.request_usage%ROWTYPE;
BEGIN
  SELECT COALESCE(s.tier, 'free') INTO _tier
  FROM public.clients c
  LEFT JOIN public.client_subscriptions s ON s.client_id = c.id
  WHERE c.id = NEW.client_id;

  IF _tier IS NULL THEN
    _tier := 'free';
  END IF;

  _limit := public.tier_daily_limit(_tier);

  INSERT INTO public.request_usage (client_id, usage_date, request_count, last_request_at)
  VALUES (NEW.client_id, _today, 0, NULL)
  ON CONFLICT (client_id, usage_date) DO NOTHING;

  SELECT * INTO _row
  FROM public.request_usage
  WHERE client_id = NEW.client_id AND usage_date = _today
  FOR UPDATE;

  IF _row.last_request_at IS NOT NULL AND _row.last_request_at > now() - interval '20 seconds' THEN
    RAISE EXCEPTION 'REQUEST_COOLDOWN: please wait a few seconds before submitting another request';
  END IF;

  IF _limit IS NOT NULL AND _row.request_count >= _limit THEN
    RAISE EXCEPTION 'REQUEST_LIMIT_REACHED: daily request limit of % reached for this plan', _limit;
  END IF;

  UPDATE public.request_usage
  SET request_count = _row.request_count + 1,
      last_request_at = now()
  WHERE id = _row.id;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_request_quota() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER client_requests_enforce_quota
  BEFORE INSERT ON public.client_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_request_quota();

CREATE OR REPLACE FUNCTION public.my_request_allowance()
RETURNS TABLE (tier public.plan_tier, daily_limit integer, used_today integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(s.tier, 'free'::public.plan_tier) AS tier,
    public.tier_daily_limit(COALESCE(s.tier, 'free'::public.plan_tier)) AS daily_limit,
    COALESCE(u.request_count, 0) AS used_today
  FROM (SELECT public.current_client_id() AS cid) base
  LEFT JOIN public.client_subscriptions s ON s.client_id = base.cid
  LEFT JOIN public.request_usage u
    ON u.client_id = base.cid AND u.usage_date = (now() AT TIME ZONE 'utc')::date
  WHERE base.cid IS NOT NULL
$$;

REVOKE EXECUTE ON FUNCTION public.my_request_allowance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_request_allowance() TO authenticated;

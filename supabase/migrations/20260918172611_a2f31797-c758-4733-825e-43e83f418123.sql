CREATE OR REPLACE FUNCTION public.tier_daily_limit(_tier public.plan_tier)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _tier
    WHEN 'free' THEN 5
    WHEN 'pro' THEN 50
    ELSE NULL
  END
$$;

import { createServerFn } from "@tanstack/react-start";

/** Publishable Turnstile site key, or null when the captcha is not configured yet. */
export const getTurnstileSiteKey = createServerFn({ method: "GET" }).handler(async () => {
  const siteKey = process.env["TURNSTILE_SITE_KEY"] ?? null;
  const secretConfigured = Boolean(process.env["TURNSTILE_SECRET_KEY"]);
  return { siteKey: siteKey && secretConfigured ? siteKey : null };
});

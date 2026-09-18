// Server-only Cloudflare Turnstile verification helpers.

export function turnstileConfigured(): boolean {
  return Boolean(process.env["TURNSTILE_SECRET_KEY"]);
}

export async function verifyTurnstile(token: string | undefined, ip?: string | null): Promise<void> {
  const secret = process.env["TURNSTILE_SECRET_KEY"];
  // When no secret is configured the captcha is not active yet; do not block users.
  if (!secret) return;

  if (!token) {
    throw new Error("Captcha verification failed. Please reload the page and try again.");
  }

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const result = (await res.json()) as { success?: boolean };
  if (!result.success) {
    throw new Error("Captcha verification failed. Please reload the page and try again.");
  }
}

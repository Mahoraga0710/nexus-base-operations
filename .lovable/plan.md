# Client requests, anti-spam, and plans

Planning only — nothing is built yet. Existing pages, shell and data stay as they are; this adds new pieces around them.

## 1. Client requests

Two paths, depending on what the client wants:

- **Task request on an existing project** — appears straight away as a task in a `requested` state. Staff accept, assign and schedule it; until then no work is implied.
- **New project request** — goes into a review queue. Staff read it, then approve (which creates a real project) or decline with a reason.

Both kinds of request support:
- **Reference links** — any number of URLs with an optional label.
- **Reference files** — uploads (images, PDFs, docs) attached to the request, using the existing files record plus a new private storage area. Clients only ever see their own company's files; staff-internal files remain hidden from them.
- **Status visibility** — the client sees every request their company made and its current state.
- **Notifications** — the client is notified when a request is accepted, declined or completed; staff are notified when a new request arrives.

## 2. Anti-spam

- **Invisible captcha (Cloudflare Turnstile)** on sign-up, sign-in, password reset and the request form. The check is verified on our server, not in the browser, so a bot cannot skip it.
- **Email confirmation** stays required, so throwaway accounts cost effort.
- **Daily request limit** enforced in the database, counted per client company: a request over the limit is refused by the backend even if someone calls it directly.
- **Short cooldown** between consecutive requests from one account to stop rapid-fire submissions.
- No credit card is required to use the free tier.

You will need to create a free Cloudflare Turnstile site and give me its two keys when we start building this part.

## 3. Plans and limits

Plans belong to the **client company**, so everyone at that company shares one allowance.

| Plan | Requests per day |
| --- | --- |
| Free | 5 |
| Pro | higher limit (to be set) |
| Enterprise | unlimited |

Only new task/project requests count toward the limit. Browsing, comments, feedback and file viewing stay unrestricted.

When a company hits its daily limit, the request form is replaced by an upgrade panel: what their plan allows, when the allowance resets, and what Pro and Enterprise add — matching the existing graphite/teal look, not a generic popup.

Payments use Lovable's built-in Stripe, so there is no Stripe account to set up. It needs a Pro workspace plan, and we can build and test the whole flow in a test mode before real money moves. Still to decide before building: the Pro and Enterprise prices, the Pro daily limit, and whether plans are monthly, yearly or both.

## Technical notes

- **New tables**: `client_requests` (kind task/project, title, body, requesting user, client company, target project when applicable, status, resolution note, resulting task/project id), `request_links` (request id, url, label), `subscription_plans` / `client_subscriptions` (company id, tier, Stripe customer + subscription ids, current period, status), `request_usage` (company id, date, count) for the daily counter.
- **Schema changes**: add `requested` to the task status enum; reuse the existing `files` table with a nullable `request_id`; add a private storage bucket for request attachments with policies mirroring the files RLS.
- **RLS**: clients read and insert only rows where `client_id = current_client_id()`; staff read all; only staff may change request status or write the resolution; usage and subscription rows are read-only to clients and written by server code. Grants issued alongside each new table.
- **Server functions** (not edge functions, per this stack): `submitClientRequest` — verifies Turnstile token, checks cooldown, atomically increments and checks the daily counter against the company's tier limit, inserts the request, links, file rows and activity/notification entries; `verifyTurnstile` used by the auth forms; `createCheckoutSession` / webhook handler under `src/routes/api/public/` for subscription lifecycle.
- **Limit enforcement** lives in a security-definer function so it cannot be bypassed from the client.
- **Secrets**: `TURNSTILE_SECRET_KEY` (server), site key in client code.

## Build order

1. Requests schema + RLS, storage bucket for attachments.
2. Client request forms (task + new project) with links and file uploads.
3. Staff review queue: accept/decline, convert to task or project.
4. Turnstile on auth forms and request submission, verified server-side.
5. Plans, daily limit enforcement, upgrade panel.
6. Stripe checkout, webhook, plan changes.
7. Verification pass: cross-company access attempts, limit bypass attempts, persistence after refresh.

## Open questions before building

- Pro and Enterprise pricing and billing interval, and the Pro daily limit.
- Should a declined request still count against the daily limit?
- Maximum attachment size and file count per request.

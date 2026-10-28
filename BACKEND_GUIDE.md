# Recall backend guide and handoff

Last updated 2026-10-28. This file explains how the cloud side of Recall works, how to add features to it, where the project stands, and how to continue in a new chat. The older handoff files (`Recall_Cloud_Sync_Handoff_Phase3a_Status.md`, the original plan and `Recall_Security_Update_for_Next_Chat.md`) are superseded by this one where they disagree. The security update is merged into section 11.

Confidence tags used below: **[Certain]** checked in code or tests, **[Likely]** strong inference, **[Guessing]** not measured.

---

## 1. What exists

Recall is a static site (plain HTML, CSS, JavaScript, no build step) that works fully as a guest with progress saved in the browser. On top of that sits an **optional** account layer: sign in, and progress, incorrect questions, flags and exam history sync across devices.

| Layer | Choice | Where it lives |
| --- | --- | --- |
| Front end | Static files, Cloudflare Pages, auto-deploys from `main` of `github.com/recall-med/recall4` | Live at `https://recall-med.pages.dev` |
| Sign-in | Firebase Authentication (Spark plan, no card). Google and email/password. | `assets/js/auth.js` |
| API | Cloudflare Pages Functions | `functions/api/*` |
| Database | Cloudflare D1 (SQLite), database `recall-db`, bound as `DB` | `db/schema.sql` |
| Sync engine and account window | Wraps the existing storage code, does not edit it | `assets/js/sync.js`, `assets/css/account.css` |
| Switch | `config/sync-config.json` (`cloudEnabled`) | Currently `false` |

Cloudflare settings that matter: env var `FIREBASE_PROJECT_ID=recall-med`; Functions set to **Fail closed** (a capped day returns an error, never HTML); D1 bound as `DB` on Production. `ADMIN_UIDS` is **not set yet** (needed for the admin dashboard). Firebase Firestore and Storage must stay **off** (they can prompt for billing).

Do not add a root `package.json` or a root `wrangler.toml` to the repo. Either can override dashboard settings or trigger a build step.

---

## 2. Repository map (cloud-related files)

```
config/sync-config.json         the on/off switch
_headers                        security headers for the static site (Cloudflare Pages)
db/schema.sql                   the three tables (already applied to recall-db)
functions/
  _lib/auth.js                  verifies Firebase tokens (hand-written WebCrypto RS256, no libraries); verifyClaims() returns the claims
  _lib/db.js                    touchUser, JSON helpers
  _lib/http.js                  json(), readJson(), HttpError, errorResponse()
  _lib/merge.js                 the conflict rule (server copy)
  _lib/validate.js              LIMITS and input checks
  api/_middleware.js            runs before every /api route: checks the token, sets data.uid and data.authTime
  api/health.js                 public check
  api/state.js                  full account state
  api/sync.js                   upload changes and receive merged state
  api/reset.js                  reset progress
  api/session.js                in-progress exam transfer (server done, no front end yet)
  api/account.js                POST {confirm:"delete"}: delete everything for the user
  api/admin/summary.js          admin totals (server done, no front end yet)
assets/js/sync.js               sync engine, account window, guest import, reset/delete flows
assets/js/auth.js               Firebase provider (loaded on demand)
assets/css/account.css          account window, loading cover and toast colours (additive file)
backend-tests/run.mjs           backend tests (local Worker + local D1)
backend-tests/run-frontend.mjs  front-end tests (jsdom, fake sign-in provider)
```

`storage.js`, `exam.js` and `app.js` were **not** changed for sync. `sync.js` wraps their methods at load time.

---

## 3. Data model

```
users(uid PK, reset_epoch, session_version, created_at, last_seen, settings, session)
scopes(uid, scope_key, progress, incorrect, flags, version, PK(uid, scope_key))
attempts(uid, attempt_id, epoch, created_at, client_ts, module, exam_type, subject, sub_subject,
         scope, score, correct, total, attempted, time_sec, review, PK(uid, attempt_id))
```

- `scope_key` = `MODULE|examType|subject|subSubject`, four parts, each `[A-Za-z0-9_-]{1,40}`.
- The cloud stores **question ids only**, never question text. Text is rebuilt from `data/**.json`. **Question ids are permanent**: never renumber or reuse one, or students' incorrect and flagged lists point at the wrong questions.
- Statistics are **derived from attempts** on the server. There are no client-side counters to double count. `attempt_id` is the primary key and inserts use `INSERT OR IGNORE`, so a resent exam is stored once.
- The server stores **no email addresses**. Emails live only in Firebase.

### Conflict rule (same code on server `merge.js` and client `sync.js`)

Each synced entry is `{epoch, rev, updatedAt, ...}`. The winner is: higher `epoch`, then higher `rev`, then later `updatedAt` (client time clamped to server time), then a string compare as a final tiebreak. Removals are **tombstones** (`removed: true`). **Flags ignore the epoch**, so they survive resets.

### Reset

`POST /api/reset {fromEpoch}` raises `reset_epoch` by one, only if it still equals `fromEpoch` (safe to repeat). Older-epoch progress, incorrect answers and attempts are ignored on read. A device that was offline during a reset has its stale data dropped (`droppedStale: true`) and adopts the reset.

---

## 4. API reference

All JSON. Everything except health needs `Authorization: Bearer <Firebase ID token>`. The user id always comes from the verified token, never from the request body.

| Route | Purpose |
| --- | --- |
| `GET /api/health` | `{ok:true}`. `?db=1` also checks the database binding. Public. |
| `GET /api/state` | Epoch, settings, session, scopes, derived stats, last 30 attempts |
| `POST /api/sync` | Body `{baseEpoch, deviceId, scopes?, attempts?, settings?}`. Returns merged scopes, stats, accepted and rejected attempt ids |
| `POST /api/reset` | Body `{fromEpoch}` |
| `GET/PUT /api/session` | In-progress exam transfer with explicit takeover. Server tested, **no front end yet** |
| `POST /api/account` | Body `{confirm:"delete"}`. Needs a sign-in no older than 10 minutes (otherwise 403 `recent_login_required`). Deletes attempts, scopes and the user row in one atomic batch. Repeating it is harmless |
| `GET /api/admin/summary[?refresh=1]` | Admin only (uid listed in `ADMIN_UIDS`). Aggregates only, cached 10 minutes. **No front end yet** |

Errors look like `{ok:false, error, message}`. D1 quota errors become 503 `resource_exhausted`.

Limits (`functions/_lib/validate.js`): 256 KB body, 200 entries per sync, 40 scopes, **30 attempts per call, 60 attempts per hour per user**, review up to 300 questions, session 64 KB, settings 2 KB, one progress entry 1 KB.

### Token checks (`functions/_lib/auth.js`)
Algorithm RS256, `kid` present in Google's key list, signature, issuer `https://securetoken.google.com/recall-med`, audience, expiry, issued-at, and a valid `sub`. A test-only key override is honoured **only** when the request host is localhost.

---

## 5. How the front end syncs (`assets/js/sync.js`)

- Local first: the app always reads and writes the browser's storage. Sync copies changes up and brings other devices' changes down.
- Bookkeeping lives in `dqb_sync` (per-entry versions, dirty set, upload queue, pending reset, base epoch, uid). Device id in `dqb_device_id`.
- Sync runs after changes (debounced about 4 s), after an exam is submitted, on reconnect, when the tab hides, when the app opens (pull throttled to 60 s), and on "Sync now". Failures back off with jitter. A non-JSON or non-`ok` response is never treated as success.
- **Sign in from guest:** the guest's progress is copied to `dqb_backup_guest`, the device is cleared, the account is loaded. A brand-new empty account (never reset) then receives the guest progress automatically. An account that already has data is only **offered** the import (button in the account window, with a confirm step). Import only adds what the account lacks and never overwrites. After import the copy is renamed `dqb_backup_guest_imported` and never deleted.
- **Different account on the same device:** the old account's leftovers go to `dqb_backup_account_<uid12>` and are never uploaded to the new account.
- **Sign out:** syncs first (8 s cap), asks before discarding unsynced changes, then clears progress keys.
- **Reset progress** (signed in): in the account window, "Your data". It reuses the existing confirmation, clears scores, progress and incorrect questions on all devices, keeps flags. The header trash icon is hidden while signed in.
- **Delete account:** asks for the password (or a Google re-sign-in), deletes the cloud data, deletes the Firebase sign-in, clears the device. If the sign-in removal fails after the data is gone, the device still signs out and clears, and the person is told to finish from a fresh sign-in.
- **Loading cover:** while a freshly signed-in device fetches its account, a full-screen "Loading your progress" cover hides the empty dashboard. It is removed when the load ends, on failure, and after 8 s at most.
- **Switch:** nothing is visible unless `cloudEnabled` is `true` or the device opted in with `?cloud=1` (stored as `dqb_cloud_preview`; `?cloud=0` removes it).
- Public hooks: `window.Sync` (`syncNow`, `isActive`, `owner`, `pending`, `status`).

---

## 6. Recipes for adding features

**Add a new endpoint.** Create `functions/api/<name>.js` exporting `onRequest({request, env, data})`. The middleware already verifies the token and gives you `data.uid`. Copy the shape of `functions/api/account.js`: check the method, validate the body, run D1 queries with `.bind(...)` (never string-concatenate input), return `json(...)`, and wrap everything in `try/catch` that returns `errorResponse(err)`. Add it to the "must be refused without a token" list and write tests in `backend-tests/run.mjs`.

**Add a column or table.** Edit `db/schema.sql` so new installs match, **and** run the matching `ALTER TABLE` / `CREATE TABLE` in the Cloudflare D1 console for the live database (the schema file is not re-applied automatically). Use `CREATE TABLE IF NOT EXISTS`. Remember every extra row written per exam counts against the free write cap.

**Add a new kind of synced data.** Decide whether it fits an existing scope entry. If not, add validation in `validate.js`, merge handling in `merge.js` **and** the matching client code in `sync.js` (the two merge implementations must stay identical), then extend both test suites.

**Add an admin metric.** Add a query in `functions/api/admin/summary.js`. Keep it aggregated (no per-person data) and cheap, because the result is cached for 10 minutes and each load scans attempt rows.

**Change a limit.** Edit `LIMITS` in `validate.js`. Keep the client in step (it chunks attempts at 30 per call).

**Rules that keep it safe:** never trust a uid from the request body; never return other users' rows; keep error bodies JSON; keep every write idempotent (a resent request must not duplicate anything); keep the front end working with the API unreachable (guest behaviour must never depend on the cloud).

---

## 7. Checks you can run in the Cloudflare D1 console

```sql
SELECT uid, reset_epoch, created_at, last_seen FROM users ORDER BY last_seen DESC LIMIT 20;
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM scopes;
SELECT COUNT(*) FROM attempts;
SELECT date(created_at/1000,'unixepoch') AS day, COUNT(*) FROM attempts GROUP BY day ORDER BY day DESC LIMIT 14;
```

Dashboards to watch: Cloudflare, Workers & Pages, Usage (requests and CPU time); D1, Metrics (rows read and written).

---

## 8. Testing

Both suites start a **local** Worker and a **local** database with `wrangler pages dev`. Nothing touches the live site.

```
git clone https://github.com/recall-med/recall4.git site && cd site/backend-tests
npm install
node run.mjs            # backend: expect 83 passed, 0 failed
node run-frontend.mjs   # front end in jsdom: expect 98 passed, 0 failed
```

The front-end suite uses a fake sign-in provider and a simulated browser (jsdom), so it cannot prove real Firebase sign-in, the Google popup, or how things look on a phone. Test those by hand.

---

## 9. Where we are

| Phase | What | Status |
| --- | --- | --- |
| 0 | Audit of the repo | Done |
| 1 | Accounts and dashboards (D1, Firebase, env var) | Done |
| 2 | Backend code and tests | Done, live |
| 3a | Sign-in UI and sync engine behind the flag | Done, live, verified on a real phone |
| 4 | Guest progress import | Done, live, both paths verified on a real phone |
| 4+ | Reset progress moved to the account window; Delete account (`/api/account`); false "reset on another device" notice fixed; loading cover; navy notifications | Built and tested in the sandbox; Reset progress in the account window and the last three still need a phone check |
| 4++ | Security hardening: safe headers file, recent sign-in required to delete an account, retention line in the account window | Built and tested in the sandbox; needs the sign-in re-test after upload |
| 3b | Service worker (offline caching) and the full Content-Security-Policy | Not started |
| 5 | Cross-device exam resume, past-attempt review, admin dashboard front end | Not started (server parts exist) |
| 6 | Pilot with 20 to 30 students, then announce | Not started |

Test status: backend 83 of 83, front end 98 of 98 (jsdom).

### Verified on real devices
Email sign-up and sign-in, studying uploads data, second-device pull, automatic import for a new account, offered import for an existing account, sign-out and sign-in, Delete account with a password (the real Firebase deletion).

### Not verified yet
1. Google sign-in popup on phones (in-app browsers such as Telegram and Instagram may fail; a message is shown). Delete account through Google re-sign-in is untested for the same reason.
2. Behaviour with many real users at once. All load figures are **[Guessing]** until measured. The tightest limit is probably D1 row writes (100,000 per day on the free plan).
3. CPU time per request: your own testing averaged about 2.6 ms, against a 10 ms free-plan limit, but heavy syncs were not measured.
4. The Firebase key restriction (done by the owner, not yet confirmed by screenshot or by a sign-in test).
5. Whether `DB` is bound on Preview deployments (only matters for non-`main` branches). Do not bind the production database to Preview.
6. Visual check of the newest changes (loading cover, navy notifications in both themes).

---

## 10. Known limits and honest caveats

- Imported guest exams have no per-question review and show the import time on other devices.
- Guest totals that have no matching exam in history are not carried over, because totals are derived from exams.
- More than 60 guest exams take more than an hour to finish uploading (the per-hour limit); nothing is lost while they wait.
- Whole-module exams over 300 questions count, but their per-question review is not stored.
- `settings` sync exists but the app does not use settings yet.
- Counters come from client-submitted attempts, so analytics are a rough guide, not tamper-proof. Exams are practice only.
- Firebase password-reset emails have their own sending limits (unconfirmed). Google sign-in is the more reliable path on exam night.
- Daily Cloudflare limits reset at 00:00 UTC (about 02:00 to 03:00 in Cairo), so a late study night can cross the reset.
- The backend tests folder and `db/schema.sql` are publicly downloadable on the site (they contain no secrets). The Firebase web config in `auth.js` is public by design.
- Rolling back a bad deploy: Cloudflare, Workers & Pages, the project, Deployments, Rollback. Switching sync off for everyone: set `cloudEnabled` to `false` and commit.

---

## 11. Security (standing priority)

The app is free, but students' emails, study history and exam results are personal data. Treat security as part of every change.

### The GitHub "publicly leaked secret" alert
- **What it is [Certain]:** the Firebase web API key (`AIzaSy...`) that sits in `assets/js/auth.js`. Every Firebase web app has to ship this key in its client code, and Google documents it as a public project identifier, not a secret. GitHub flags every Google-format key it finds, so the alert is a false positive in the usual sense.
- **What it does not allow [Certain]:** reading or changing anyone's data. The backend trusts only a verified Firebase ID token and takes the user id from the token, never from the request.
- **What it does allow (the real, smaller risk):** anyone with the key can call Firebase's sign-up, sign-in and password-reset endpoints directly: bot accounts filling the `users` table, password-reset emails sent to addresses the attacker picks, and use of the project's Firebase quotas. Existing limits that help: 60 exam uploads per hour per account; Firebase also throttles per IP **[Likely]**.
- **Do not regenerate the key.** That would break sign-in until `auth.js` is updated and redeployed. Restrict it instead.

### Key restriction (Google Cloud console, no billing needed)
Status: the owner reports the website restriction is **done**. It is **not yet verified by screenshot**, and sign-in has not been re-tested after it. To verify:
1. Open `https://console.cloud.google.com/apis/credentials?project=recall-med`, open the key ending in `...g9j74cU`, reload, and check that Application restrictions shows **Websites** with two rows: `https://recall-med.pages.dev/*` and `https://recall-med.firebaseapp.com/*` (the second is needed for the Google popup). Decline any "activate" or "start free trial" prompt.
2. Wait about 5 minutes after any change, then on a phone: sign out and sign in with **email**; sign out and sign in with **Google**; open a **private tab** at `https://recall-med.pages.dev/?cloud=1` and sign in (closest to a student's first visit).
3. If anything fails, switch Application restrictions back to **None** and note the exact message shown.
4. Only after sign-in is confirmed: close the GitHub alert as **False positive**.
5. In Firebase, Authentication, Settings, User actions: confirm **email enumeration protection** is on (unverified).

The API restriction was left at Firebase's default list (it includes the Identity Toolkit and Token Service APIs, so sign-in and token refresh work). Narrowing it to those two is optional, after the website restriction is proven. A website restriction is a speed bump, not a lock, because a script can fake the referrer header. If a new address is ever added (custom domain), add it to the key **and** to Firebase Authorized domains. Sign-in will not work on preview deployment links; that is expected.

**Never set `Referrer-Policy: no-referrer`** (or any policy that removes the origin from cross-origin requests) in `_headers`, because the website restriction depends on the referrer. `strict-origin-when-cross-origin` is safe.

### The bigger weak spot: no rate limiting on `/api/*`
Anyone can call `/api/*` without any key, and every request counts against Cloudflare's daily Functions limit. Because Functions are set to **Fail closed**, a flood that exhausts the limit would pause cloud sync for **everyone** (studying keeps working locally; changes queue and upload after the reset at 00:00 UTC).
- Requests without a valid token are rejected before any database work, so a flood costs requests but not D1 writes **[Certain]**.
- **Rate limiting rules are free** on Cloudflare's Free plan: one rule, counted per client IP in a short fixed window, matched on the path (for example `/api/`) **[Certain, per Cloudflare's rate-limiting docs and plan tables]**. The catch is that these rules are configured per **zone**, meaning a domain added to your Cloudflare account **[Likely]**. A bare `recall-med.pages.dev` address is not a zone in your account, so the Security, WAF menu is probably unavailable for it. To check: open the Cloudflare dashboard and see whether any domain is listed under Websites. If none is, you cannot use it. A domain costs money (roughly the price of a `.com` per year), which breaks the $0 rule.
- If you ever get a domain: one rule on `/api/`, for example block an IP that sends more than about 100 requests in 10 seconds. A normal sync is a handful of requests. Many students can share one campus IP, so do not set it low.
- Whether Pages Functions can use Cloudflare's separate in-code rate-limiting binding for Workers is **unverified [Guessing]**. Check Cloudflare's Pages bindings docs before relying on it.
- Realistic options: accept the risk for now (the damage is a paused sync, not lost or exposed data), or move to a custom domain later. Decide this before the wide rollout and write the decision down.

### Done in the security round
- `_headers` with the safe set above (no `no-referrer`, no Cross-Origin-Opener-Policy, no enforced CSP, on purpose).
- Deleting an account now needs a sign-in no older than 10 minutes, checked on the server from the token's `auth_time`. If the app ever shows "sign out, sign in again, then delete your account", that is this check. **[Likely]** Firebase's re-confirmation step refreshes `auth_time`, so the normal flow works; if it does not, a fresh sign-in certainly does, and the message says so.
- API responses were already `no-store` and `nosniff`; unchanged.
- The account window states that progress is kept until the account is deleted.

### Other security work, in priority order
| Priority | Item | Notes |
| --- | --- | --- |
| 1 | Rate limiting (above) | Decide: accept the risk, or custom domain. Test that exam-night traffic is not blocked. |
| 2 | Security headers | **Partly done:** `_headers` sets `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `frame-ancestors 'none'` and a Permissions-Policy. **Still open:** a full CSP allowing only what sign-in needs (`gstatic.com` scripts, Google and Firebase auth domains and popup, same-origin API). It cannot be tested without real Google and Firebase sign-in, and a wrong CSP breaks sign-in for everyone, so it waits for Phase 3b and a real-phone test. |
| 3 | Bot sign-ups | Firebase App Check or email verification is not enforced (deliberate, to avoid blocking students before exams). Decide and document. |
| 4 | Account and data deletion | **Done.** Delete account removes cloud data and the Firebase sign-in, and the server requires a sign-in no older than 10 minutes. The account window now says progress is kept until the account is deleted. Emails exist only in Firebase and go when the account is deleted. |
| 5 | Public repo exposure | `backend-tests/` and `db/schema.sql` are downloadable on the live site. No secrets inside. **Left as is:** Pages has no free way to exclude a folder without a build step, and moving them would break the test setup. |
| 6 | Pinned Firebase SDK | `auth.js` loads Firebase `10.14.1` from `gstatic.com` with no integrity check (dynamic imports cannot use it). **Verified by use** (real sign-ins and a real account deletion worked). Keep the version pinned, never `latest`. |
| 7 | Admin access | Set `ADMIN_UIDS` **only** in Cloudflare variables. Copy the owner's uid as **text** from the D1 `users` table; do not retype it from a screenshot (capital I vs lowercase l). The admin route returns aggregates only, never emails or per-user rows. |

### Hard rules
- Never add the test-only key override variable (named in `functions/_lib/auth.js`), a service-account key or any private key to Cloudflare variables or the repo. The code honours that override only on localhost, and a repo test fails if keys, `wrangler.toml` or `.dev.vars` are committed, or if that variable's name appears anywhere except `auth.js` and the test files.
- Never commit a root `wrangler.toml` (it overrides dashboard settings).
- Never set `Cross-Origin-Opener-Policy` in `_headers`: it breaks the Google sign-in popup.
- Never trust a user id from the request; it comes only from the verified token.
- When unsure whether something is secret or safe, say so and tag it **[Certain] / [Likely] / [Guessing]**.

---

## 12. Next steps, in order

1. **Upload and check the newest changes** on a phone: the loading cover after sign-in, navy notifications in light and dark mode, a flag notification in dark mode, email and Google sign-in still working after `_headers` goes live, and Delete account on a throwaway account.
2. **Verify the key restriction** (section 11): screenshot of the two website rows after a reload, then the email, Google and private-tab sign-in checks. Then close the GitHub alert as a false positive and confirm email enumeration protection. This also covers Google sign-in; test Google account deletion with a throwaway account.
3. **Small pilot.** Set `cloudEnabled` to `true` only when ready, or give a few classmates the `?cloud=1` link. Watch the Cloudflare usage page and D1 metrics for a few days, before any exam week.
4. **Phase 5:** decide what the admin dashboard must show (candidates: accounts, active users today and this week, exams per day and per module, accuracy by subject, average exam time, sync failures). Then set `ADMIN_UIDS` (copy your uid as text from the D1 `users` table, do not retype it), and build `admin.html`. Wire `/api/session` for "Resume from another device".
5. **Phase 3b:** service worker for offline caching, plus the full CSP on top of `_headers` (section 11). It must have a kill switch so a bad cache can never strand students, and it needs real-phone testing, including sign-in under the new CSP.
6. **Decide the rate-limiting question** (section 11) before announcing to everyone.
7. **Phase 6:** pilot with 20 to 30 students, compare real numbers with the estimates, then announce to everyone.
8. Optional: narrow the API restriction to the two sign-in APIs; self-host the three fonts.

---

## 13. Continuing in a new chat

1. Start the new chat **inside the same Claude Project** ("Medical Question bank REPO") so its saved notes are available.
2. Upload this file. Say, for example: *"Continue Recall from BACKEND_GUIDE.md. Start with step 1 of the next steps."*
3. The repo is public. The assistant can fetch it with `git clone https://github.com/recall-med/recall4.git` in its sandbox, then run both test suites (section 8). Fetching raw GitHub URLs only works if the URL appeared earlier in the chat.
4. Working style the assistant should follow:
   - Owner goes by Notnt, a medical student, not a developer. Everything is done through web dashboards and the GitHub web uploader. No command line.
   - Short, direct answers. Tag claims **[Certain] / [Likely] / [Guessing]**. Put the uncomfortable truth first.
   - Deliver **only new or changed files**, say exactly where each goes, never a full-project zip.
   - No emojis in the UI. Do not rewrite existing CSS or change base variables; add rules in `account.css` instead. Keep dark mode working. Small surgical changes. **Ask before consequential or ambiguous UI decisions.**
   - The owner owns the budget limit: zero dollars, no card, free plans only. Keep replies and tool use compact because of usage limits.
   - Test in the sandbox before delivering, and say plainly what could not be tested (real Firebase, real phones).

### Quick reference

| Item | Value |
| --- | --- |
| Live site | `https://recall-med.pages.dev` (test sign-in on one device with `?cloud=1`) |
| Repo | `https://github.com/recall-med/recall4`, branch `main` |
| D1 database | `recall-db`, binding `DB` |
| Firebase project | `recall-med` (Spark plan) |
| Env var set | `FIREBASE_PROJECT_ID=recall-med` |
| Env var pending | `ADMIN_UIDS` |
| Switch file | `config/sync-config.json` |

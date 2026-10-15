# Server operations

This document describes the implemented application boundary and handoff for subsequent issues. Read it before changing server behavior. Uses Next.js Server Actions rather than a separate public REST API; generated action IDs and multipart transport are framework details, not a stable external API.

## Create a group — issue #7

The Group entry page `/` submits `groupName` through `app/actions/create-group.ts`. The server operation uses `db/server.ts` and the existing initialized SQLite database. It does not read request Host/forwarded headers to construct links and does not establish a session, create a member, or select a profile.

### Input and validation

- `groupName` must be text. Trim outer JavaScript Unicode whitespace; accept 1–80 Unicode code points after trimming. Preserve internal whitespace and display case. Reject blank/whitespace-only, overlong, non-text/File, and embedded-NUL values on the server before database access.
- Same display names are allowed: each successful submission creates a distinct group ID and invitation. Names are not authentication or unique group identity.
- The form associates field errors with the input, retains what was entered, announces pending/error feedback, and disables fields/submission while an action is in flight. A later deliberate submission remains available, labeled Create another group after success.

### Origin configuration

**`WATCHNEXT_APP_ORIGIN`** is server-only configuration, loaded by Next from the environment or untracked `.env.local`. Default when unset: **`http://127.0.0.1:3000`**. See [the database guide](database.md) for the separate `WATCHNEXT_DATABASE_PATH` setting and explicit database initialization.

An explicit value must be an HTTP/HTTPS origin, with an optional single trailing slash, and no credentials, non-root path, query, or fragment. Empty/blank values, whitespace-surrounded values, URI shorthand, and normalized-away paths are rejected, not replaced with the default. Canonical URL origin serialization removes the allowed trailing slash/default port and normalizes hostname case. Never infer this setting from Host or forwarded request headers.

Example: `https://watch.example/` yields `https://watch.example/invite/<token>`. This is a configuration example, not a hosted service. Set the configured port to match the server used for a demonstration. `localhost`, its subdomains, IPv4 127/8, and IPv6 `::1` show a visible explanation that the URL points to this computer and friends cannot open it from their own computers. Public hosting/network-access setup remains #30.

### Transaction and invitation credential

`lib/groups.ts` validates input/configuration, calls `node:crypto.randomBytes(32)`, and base64url-encodes those 32 bytes (256 bits of entropy; 43 URL-safe characters). It uses independent random UUIDs for the group/invitation IDs. Inside one `BEGIN IMMEDIATE` transaction it inserts exactly one group and one invitation, committing together or rolling back both on an error. No member or session record is created.

Only `SHA-256(token)` as lowercase hex is persisted in `invitations.token_hash`. The raw token is present only in memory and the returned/displayed URL; it is not written to database fields, logs, fixtures, or repository files. Keep returned URLs private, avoid logging action responses, and redact them from any screenshots or retained debugging artifacts. A hash cannot reconstruct a link, so this operation does not promise to redisplay a lost raw token later.

Delegated first-release policy: invitation credentials do **not** expire automatically. `revoked_at` is initially NULL. Invitation resolution in [#8](https://github.com/xiaodlb/watchnext/issues/8) validates token shape, hashes it identically, rejects revoked/unknown invitations, and establishes group access under the trust-based model. Revocation/rotation UI, email invites, and accounts remain outside this increment.

The URL format is `<configured origin>/invite/<token>`. Issue #8 implements resolution and a token-free `/group` destination. The destination shows the actual group name and makes clear that profile creation/selection is still coming in #9. A loopback URL still works only on the same computer.

### Returned state and UI behavior

The action returns one safe discriminated state:

| `kind` | Fields | Meaning |
| --- | --- | --- |
| `idle` | none | Initial client state |
| `invalid` | `nameError` | Field-associated validation failure; no write |
| `error` | `message` | Retryable origin/storage failure; no success URL, SQL, local path, stack trace, or raw credential |
| `created` | `name`, `inviteUrl`, `loopback` | Trimmed saved name and the private one-time returned URL |

Database exceptions are caught without logging them. A synthetic invitation-insert failure is tested to roll back the newly inserted group. The UI retains the controlled group name through failure, shows no stale success URL for that failure, and permits retry. A disabled in-flight form prevents accidental second submission; it is not a general idempotency/account/rate-limit system.

The invite URL is read-only, keyboard-focusable, and selected on focus. Copy invite link calls Clipboard API `writeText` with exactly the displayed URL, announcing success only after the promise resolves. Missing Clipboard API or rejected permission displays instructions to select/copy manually; the field remains available and retry stays enabled. No automatic email/message is sent.

### Verification boundaries

Focused tests cover Unicode bounds/non-text/NUL names, same-name identity separation, random credential shape/hash-only storage, transactional rollback and retry, strict origin/loopback handling, safe server error states, input retention/pending prevention, and both clipboard fallback cases.

Server integration/browser verification must set `WATCHNEXT_DATABASE_PATH` to an explicitly initialized temporary fixture before server startup, and set `WATCHNEXT_APP_ORIGIN` to the verification origin. Never initialize or inspect the normal user's database for tests. Use both 375px and 1280px for the group form, errors, and success states; mask any generated invitation URL in retained images. Profile behavior remains in #9.

## Invitation resolution and browser sessions — issue #8

`GET /invite/<token>` accepts only the canonical 43-character base64url representation of exactly 32 bytes. Decode/re-encode equality rejects alternate encodings of the same bytes. SHA-256 lookup must find a non-revoked invitation. Missing `/invite`, malformed, unknown, revoked, or storage-unavailable requests redirect to the same generic `/access-error` page without revealing group data or replacing an existing valid cookie. The error page has a real Return to Group entry link.

A valid invitation creates a fresh 32-byte random opaque session credential, stores only its SHA-256 hash in `group_sessions`, and sends it as a cookie before a 303 redirect to **`/group`**. The redirect stays on the request origin so the host-only cookie remains usable even when a local alias was used. Invitation responses set `Cache-Control: no-store` and `Referrer-Policy: no-referrer` so the bearer path is not forwarded as a referrer to the destination. Do not build links using request headers; new invite links still use the configured origin.

Cookie policy: `watchnext_session`, **HttpOnly**, **SameSite=Lax**, **Path=/**, no Domain, Max-Age, or Expires. Secure is enabled for an HTTPS request or configured HTTPS origin. It is a browser-session cookie: reload retains context, a separate browser context has no access, and browser session restoration can retain cookies. Closing a browser is not a guaranteed server revocation event.

The server session row binds the hash to one group and backing invitation, with optional `active_member_id`. Every access checks the current session, existing group, and non-revoked backing invitation. Deleted/unknown sessions and revoked/missing invitations cannot retain access. Server rows have no automatic expiry in this first-release policy; explicit row deletion or backing-invitation revocation invalidates them. This does not create an invitation expiry scheme. Later operational cleanup may remove unused rows without changing group/history records.

Opening a valid different-group invitation atomically inserts the new session and removes the browser's prior session row, sets the new cookie and clears active-member context. Invalid invitations leave the old context untouched. Reopening the same group rotates the credential while retaining any real same-group selected member; it never fabricates one or changes personal history. No profile UI is supplied by #8. The additive `0002_group_sessions.sql` migration includes group-consistent invitation/member foreign keys; existing migrations remain immutable. Run `pnpm db:init` after pulling it.

`/group` is dynamically rendered and calls the server guard before rendering any private group name. Missing/stale/forged access renders the generic error content. Valid access shows the real name, explains that anyone with the invite can select a name/profile **without verifying personal identity**, and states that profile selection comes next.

### Reusable read and mutation guard

App code imports `getActiveGroup` / `requireRecordAccess` from server-only `lib/access.ts`. The latter delegates to `lib/request-access.ts` and checks both session validity and the target's actual group in the database. Supported target kinds are group, title, and member; the kind selects fixed server-owned SQL. It never treats a submitted group ID as authority. If a payload contains a group ID, it must match the validated session and the actual target ownership. Unknown and wrong-group records produce the same safe `AccessError`.

Future reads call this guard before returning data; mutations call it with `mutation: true` before writing. Mutations additionally require POST/PUT/PATCH/DELETE, an exact Origin match to validated `WATCHNEXT_APP_ORIGIN`, and no cross-site Fetch Metadata. Missing Origin is denied. Next Server Actions also retain their framework same-origin protection; no wildcard allowed-origins configuration is added. SameSite and cookie possession alone are not the mutation protection. [Next Server Action protection](https://nextjs.org/docs/app/guides/data-security#allowed-origins-advanced)

Focused test-only request handlers exercise actual guard calls before reading/updating synthetic records. They demonstrate same-group success, known other-group denial, forged payload group rejection, missing/malformed/fabricated/stale cookies, revoked invitations, missing/cross-origin mutation headers, and unchanged denied records. No debug API or unrelated CRUD endpoint is shipped. Caller endpoints must catch `AccessError` and return generic access errors; do not serialize internal session/group data or raw database errors accidentally.

### Credential logging boundary

`next.config.mjs` disables development incoming-request logs, Server Function argument logs, and browser-console forwarding. These can otherwise contain the raw `/invite/<token>` path or action state. Application session helpers log no credentials or exceptions. Production request handling also performs no application access logging. [Next logging configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/logging)

Console settings alone do not protect Next's generated `.next/dev/trace`: its default request spans contain full invitation URLs. Therefore **start the app with `pnpm dev` / `pnpm start`**. Their Node `--import` preload sets `NEXT_TRACE_SPAN_THRESHOLD_MS=9007199254740991` before Next initializes, suppressing routine span recording while retaining normal compiler/error diagnostics. This is an **internal hook verified against pinned Next 16.4.1**, not a stable public API. The config fails closed during serving when the preload value is missing, rather than allowing an unprotected direct `next dev/start`. Build-phase diagnostics remain available. Do not enable trace-upload or bypass the launcher with external profiling when handling real bearer links.

`tests/framework-privacy.test.ts` probes the actual pinned tracer in a fresh process and verifies no request span is retained, and checks the startup guard. On a Next upgrade, rerun these tests **and** real dev/production invite requests with stdout/stderr and generated trace-file scanning before accepting the upgrade. The internal hook must be replaced if the framework changes; a passing console-only check is insufficient.

Verify both supported launch modes with isolated fixtures, and scan captured routine stdout/stderr **and generated trace files after shutdown** for generated invite and session values without printing them or saving unredacted captures. This covers framework logging, not just explicit console calls. External reverse proxies, browser history, network inspection tools, and future monitoring need their own equivalent redaction policy; none are introduced here.

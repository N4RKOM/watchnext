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

Delegated first-release policy: credentials do **not** expire automatically. `revoked_at` is initially NULL. Invitation resolution in [#8](https://github.com/xiaodlb/watchnext/issues/8) must validate token shape, hash it identically, look up the hash, reject revoked/unknown invitations, and establish group access under the trust-based model. Revocation/rotation UI, email invites, and accounts are outside #7.

The URL format is `<configured origin>/invite/<token>`. In this increment the resolver route/session is not implemented; the success message explicitly says joining by invite is not available yet. Do not claim that copying a link means another browser can already join.

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

Server integration/browser verification must set `WATCHNEXT_DATABASE_PATH` to an explicitly initialized temporary fixture before server startup, and set `WATCHNEXT_APP_ORIGIN` to the verification origin. Never initialize or inspect the normal user's database for tests. Use both 375px and 1280px for the group form, errors, and success states; mask any generated invitation URL in retained images. Future invitation/session/profile behavior remains in #8/#9.

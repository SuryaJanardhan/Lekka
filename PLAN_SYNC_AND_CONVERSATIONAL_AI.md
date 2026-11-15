# Plan: Sync Reliability and Conversational AI

## Goal

Resolve the sync warnings seen in the Android app and make Lekka AI handle follow-up questions naturally while staying grounded in the user's ledger, bounded for the Groq free tier, and read-only.

## Current State

- Production sync APIs are responding successfully. The latest checked status was revision `715`, with no ingestion in progress and the last successful ingestion at `2026-11-14T18:59:14Z`.
- Production system status showed no Gmail sync error and recent ingestion jobs succeeded.
- A browser session from the configured `localhost` origin loaded the production ledger and monthly Stats data. The `127.0.0.1` origin was rejected by CORS as designed.
- Backend commit `026e599` is deployed. General chat now receives up to two short prior turns, and explanatory follow-ups reuse the previous validated, read-only ledger query.
- A live general follow-up succeeded. A live ledger follow-up returned its calculated result but deferred the AI explanation. One earlier general AI request returned 502, while a subsequent general request succeeded.
- AI status last reported two configured keys, a ready read-only connection, and remaining daily quota. The current explanation path catches provider failures and budget failures together, so the app's "deferred" message does not identify which case occurred.
- The API limits, local encryption, incremental sync, and security changes are already merged to `main`. No Firebase Auth migration is planned; the existing single-user shared API credential remains an accepted limitation.
- The latest Android build for the Stats color fix was submitted to EAS: https://expo.dev/accounts/surya-expo-2nd-acc/projects/lekka/builds/7fa614d7-6976-4ec4-937e-c1fe42566345

## Plan

### 1. Reproduce the Android sync warning

- Capture the exact in-app status/error and Settings debug-log entries from one affected app session, along with the installed build ID and approximate time. Redact bearer values, email addresses, transaction text, and amounts.
- Re-run the same sequence against production: encrypted cache hydration, sync-status check, incremental changes request, snapshot persistence, and outbox reconciliation.
- Compare the app request outcome with server status, revision, ingestion state, HTTP status, and safe response metadata. Do not dump ledger content or credentials into logs.
- Check specific failure boundaries: Android WebView CORS/origin, 401/403, rate-limit 429, API timeout, IndexedDB/Keystore decrypt failure, invalid incremental response, stale revision, and pending outbox operations.

### 2. Fix only the reproduced sync fault

- Add a regression test at the failing client or backend boundary before changing behavior.
- Keep the last good encrypted snapshot on every failed or partial response.
- Preserve retry/idempotency behavior and do not allow a retry to duplicate a transaction.
- Make the UI distinguish cached data, pending writes, backend rejection, and temporary connection failure instead of collapsing them into a generic sync warning.

### 3. Diagnose the AI 502 and deferred reply

- Add or use privacy-safe diagnostics that identify provider HTTP status, provider error code/type, local budget rejection, and timeout. Never log prompts, transaction data, API keys, or response bodies.
- Separate user-facing states: request too large, per-minute/daily budget reached, provider cooldown/auth issue, and temporary upstream failure. Retain deterministic ledger facts when a model call fails.
- Verify general chat and ledger-skill requests independently; the general request succeeding does not prove the finance explanation call is healthy.

### 4. Improve grounded conversational answers

- Keep the existing bounded chat history and carry the prior skill's validated filters across clear follow-ups such as "why is that high?" and "tell me more".
- Add compact calculated evidence for category explanations: total, transaction count, average transaction, and largest transaction. If a comparison is needed to justify "high", compare the same category with the prior period using read-only aggregation and state the comparison window.
- Ask the model to explain only those facts, distinguish arithmetic from inference, avoid inventing motives, and offer a useful next action when evidence is insufficient.
- Keep prompts compact, make model calls only when natural-language explanation adds value, and preserve the 4xx/rate-limit/free-tier call limits.

### 5. Verify and release

- Backend: build; run all non-live unit tests; test sync controller/service, chat routing, provider failure classifications, and budget boundaries.
- Client: run cache/outbox/security tests and a real-browser Android-sized flow with the production backend, checking cached reopen and a pending write round trip.
- Production smoke: confirm authenticated sync status, compact snapshot, incremental delta, AI status, one general follow-up, and one factual ledger follow-up. Keep financial outputs out of test logs.
- Commit each major change on a feature branch, merge tested commits to `main`, and verify the corresponding Vercel deployment.
- Build a new EAS APK only if client code or native configuration changes. Backend-only changes do not require an APK rebuild.

## Acceptance Criteria

- The app's reported sync state matches live API/cache/outbox state, and a recoverable network failure does not discard cached data or duplicate writes.
- General chat can use recent conversation context without receiving the whole ledger.
- A follow-up to a ledger result re-runs the same validated filters and explains only calculated facts, including a comparison when claiming a change is "high".
- Budget and upstream failures are reported accurately; deterministic totals remain available.
- Release checks pass, production deployment is verified, and the user receives the commit and build link when a new APK is needed.

## Deliberate Constraints

- Single user; no Firebase Authentication work.
- Four-digit PIN remains the local privacy lock, not API authentication.
- Keep the existing shared API credential model as an explicitly accepted tradeoff.
- Do not log or export financial content as diagnostics.

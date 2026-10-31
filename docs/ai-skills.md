# Compact AI Skills

The existing chat and saved conversations remain the UI. A code dispatcher selects a bounded read-only skill; there is no extra supervisor model, arbitrary model-generated MongoDB query or vector database.

## Tools

| Command | Behavior | Normal model calls |
| --- | --- | --- |
| `@spending` | Confirmed debit/credit totals filtered by date, category and payment mode | 0 |
| `@compare` | Compare two named periods, including counts and exact differences | 0 |
| `@search` | Literal receipt/merchant/sender search, three results per page | 0 |
| `@review` | Pending category decisions in the chosen period | 0 |
| `@rules` | Read saved category rules and priorities, three per page | 0 |
| `@watch` | Possible duplicates, unusually large debits and category increases | 0 without flags; at most 1 explanation call |

Typing `@` opens the picker; selection preserves the draft. Settings contains descriptions, examples, request caps and read-connection status. Known financial questions also route automatically. Conversation context stores only validated filters so pagination and follow-ups need no model interpretation call. It is not financial evidence: all amounts come from confirmed server records, never optimistic outbox values.

Periods use IST boundaries. Named weeks start Monday; last seven days is a separate rolling calendar-day range. Date ranges are limited to five years; result pages to 100. Raw queries and operators are not accepted. Search regex metacharacters are escaped. Amounts are aggregated as integer paise; credits never count as spending. Explanations are optional and cannot replace the calculated source result.

## Read Isolation

Set `MONGODB_READONLY_URI` in ignored `backend/.env` and encrypted Vercel settings. It must use a separate Atlas user with `read` on the intended database. The gateway checks the connection's privileges before using it, rejects write/admin permissions, and has no fallback to `MONGODB_URI`.

Allowed retrieval is implemented in fixed server code against ledger entries, categories and saved rules. Fields are projected and records bounded; full receipts, secrets, push tokens and operation payloads are not returned to the model. Queries have a three-second database timeout. The ordinary application connection retains responsibility for budgets, job checkpoints and notifications, not the model.

## Free-Tier Controls

Chat/watch requests have an 800-token conservative upper-bound check using UTF-8 bytes plus framing allowance; actual tokenizer counts are usually lower. Answers are capped at 200 output tokens. Email parsing retains its existing bounded receipt workflow but uses the same provider pool. Its reservations also use a conservative byte bound; excessive extraction context goes to manual review instead of retrying forever. Batch notes process at most five entries at a time.

Shared server-side limits are 5 logical requests and 6,000 reserved tokens per minute, 100 logical requests and 80,000 reserved tokens per UTC day. Reservations are atomic across instances. All distinct configured Groq keys share these app limits; round-robin selection and key cooldowns survive restarts. Identical model requests reuse a five-minute response cache. Invalid/cooled keys are skipped. A provider 429 pauses the model pool using Retry-After; switching keys is not treated as extra organization quota. No paid plan or alternative paid provider is enabled. External account usage/provider limits can still cause deferral.

The response either contains accurate calculated results or a clear setup/budget error. It does not pretend that a rate-limited model produced an answer. Explicit explanation requests fall back to labelled calculated results when unavailable. Large pages stay in database pagination rather than being fed wholesale into a model.

## Spending Watch

Automatic ingestion schedules one durable private Vercel queue check per IST day, including empty ingestions so manually added records can be checked next time. A persisted processed-record checkpoint survives longer gaps; each check scans at most 200 records and carries a partial-coverage cursor forward. On-demand `@watch` inspects a bounded recent processed-record window. Checks are advisory, not fraud or duplicate guarantees.

Candidates are computed before optional AI narration. Potential duplicates require the same merchant/amount within ten minutes. Large-payment flags require at least five baseline debits and a payment above both INR 1,000 and three times the baseline average. Category increases require at least three prior-period records, doubling and an increase of INR 1,000. Current partial periods are labelled. Deduplication precedes the three-finding cap; category-growth identity includes its comparison window.

No findings means no narration call and no notification. New findings produce one grouped in-app alert and remote push, with stored delivery progress so retries do not resend to healthy installations unnecessarily. Durable job recovery runs beside existing cron recovery; financial outbox semantics are unchanged. There are no automatic ledger edits or deletions.

## Verification

`npm run test:ai-ui` in `app` covers the actual composer, picker and Settings reference in Chrome, including keyboard/touch and small viewports. `scripts/aiCatalog.test.mjs` covers mention parsing/draft preservation. Backend AI unit tests cover dates, filters, budgets and watch thresholds.

`backend/scripts/compose.ai-test.yml` provisions an isolated authorization-enabled MongoDB replica set at port 27130. Set `AI_TEST_URI` only to its `lekka_ai_test` database to run AI integration tests. They verify that the reader credential itself cannot write, totals match IST boundaries, search cannot inject regex, key rotation is persistent, caching saves quota, rejected reservations roll back, and Watch produces no duplicate alerts. Production verification reads credentials/records only; no write-denial probe or test financial record is created in Atlas.

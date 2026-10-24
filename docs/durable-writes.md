# Durable Writes

Implemented for ledger create/edit/delete/category assignment, category create/rename, rule create/edit/delete and notification read/clear. The new client uses an IndexedDB outbox, a MongoDB operation journal and a private Vercel Queues worker. Legacy APK write endpoints remain available. Ingestion, AI chat, export and push registration keep their existing paths. No Redis is required.

## Fast UI Without False Success

Persist each operation in a local IndexedDB transaction before projecting its change into the UI. Use a stable operation ID and stable entity ID, not a new ID on every attempt. If local persistence fails, keep the form and report the error instead of pretending the transaction was queued.

Pending changes remain visibly Pending sync. Confirmed spending totals stay separate from pending changes. Navigation does not wait for a network call. New snapshots are overlaid with still-pending operations so a refresh cannot erase them.

## Durable Server Acceptance

The API stores the operation ID, canonical payload hash, target, ordering metadata and pending state in a MongoDB operation journal before acknowledging acceptance. An existing ID with the same payload returns its existing status; the same ID with a different payload is rejected.

A private Vercel Queues consumer processes accepted operations without depending on the APK staying open. Queue messages contain only an operation ID, not financial payloads. The MongoDB journal remains the source of truth without a TTL: failed publishing, expired queue messages and interrupted workers are recoverable from it. Existing ingestion and digest invocations republish eligible work, and foreground status checks do the same. Queue messages use seven-day retention; journal records do not expire. Recovery sweeps therefore remain necessary during a prolonged outage. The queue's durable delivery and retry contract is documented in [Vercel Queues](https://vercel.com/docs/queues).

## Atomic Commit

For each supported command, commit its ledger or metadata changes, dependent database changes, data revision and completed-operation receipt together in one MongoDB transaction. Repeated delivery must return the stored result rather than applying the command again. Transaction callbacks must not send external push messages: persist any required notification work atomically and deliver it after commit.

Commands are ordered per installation using persisted predecessor IDs, with additional same-entity dependencies and timestamp version checks. A blocked predecessor pauses its successors until resolved. Edits from another installation or a newer confirmed snapshot cannot be silently overwritten. MongoDB transaction sessions cover the command, learned rules, review dismissal, revision and completed-operation receipt together. Push confirmations are delivered outside the transaction, using a stable Android notification tag for retry deduplication.

Snapshot reconciliation hides a completed local projection only after that installation observes a persisted snapshot covering its revision. Completed local receipts are retained so another tab with older in-memory data can still project the confirmed change; cache failure cannot remove that recovery copy. Confirmed totals use the server snapshot, not optimistic amounts.

## Retry and Recovery

Timeouts, network failures, rate limits and temporary server errors retry with capped exponential backoff and jitter, retaining the same operation ID. A timed-out request may already have committed, so retrying with a fresh ID is unsafe. Pending financial operations are not silently expired or discarded after an attempt limit.

Invalid data, missing records and edit conflicts become Needs attention. Settings lists each pending/rejected change and supports retry or explicit discard; after discarding an invalid change, use the normal form to enter its correction. A never-accepted rejected command can be tombstoned safely so it cannot block subsequent uploads. Authentication failures pause automatic sending; Retry sync or reopening/resuming can retry after credentials or connectivity have been corrected. Reopening resumes local uploads; server-accepted work continues independently through the durable worker and recovery sweep.

This does not promise zero failed HTTP calls or a transaction spanning the phone and server. ACID applies to the database commit. Device-only pending changes cannot survive uninstalling the app or losing the phone before upload.

## Verification

Run `node --test scripts/outbox.test.mjs` from `app` for client replay, persistence-failure, authentication and projection behavior. Browser verification uses actual IndexedDB and closes/reopens the page while a write is offline, then confirms stable-ID replay and one applied result. Real MongoDB integration tests require a separate replica set at port 27129, database `lekka_operation_test`, and `OPERATION_TEST_URI`; the test refuses any other URI and never writes financial fixtures into production. The suite covers duplicate delivery, mid-transaction failure, lease interruption, ordering, stale conflicts, rejected-dependency resolution and atomic category/rule/review changes. Production smoke uses a notification-clear operation with a 1970 cutoff, affecting no existing financial records or current notifications.

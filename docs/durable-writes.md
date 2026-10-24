# Durable Writes Proposal

Status: proposed, not implemented. Current app writes still wait for the existing API and database response. No Redis, MQ, local write outbox or server operation worker is enabled.

## Fast UI Without False Success

Persist each operation in a local IndexedDB transaction before projecting its change into the UI. Use a stable operation ID and stable entity ID, not a new ID on every attempt. If local persistence fails, keep the form and report the error instead of pretending the transaction was queued.

Pending changes remain visibly Pending sync. Confirmed spending totals stay separate from pending changes. Navigation does not wait for a network call. New snapshots are overlaid with still-pending operations so a refresh cannot erase them.

## Durable Server Acceptance

The API stores the operation ID, canonical payload hash, target, ordering metadata and pending state in a MongoDB operation journal before acknowledging acceptance. An existing ID with the same payload returns its existing status; the same ID with a different payload is rejected.

A durable worker processes accepted operations without depending on the APK staying open. A queue can wake the worker, but the MongoDB journal remains the source of truth: failed publishing, expired queue messages and interrupted workers must be recoverable from it. Redis alone is not this guarantee. Existing ingestion must remain independent.

## Atomic Commit

For each supported command, commit its ledger or metadata changes, dependent database changes, data revision and completed-operation receipt together in one MongoDB transaction. Repeated delivery must return the stored result rather than applying the command again. Transaction callbacks must not send external push messages: persist any required notification work atomically and deliver it after commit.

Preserve command order per entity. Use entity versions to detect concurrent changes, including changes from another installation or ingestion. Do not silently overwrite a newer edit. Snapshot reconciliation must observe the completed operation's revision before discarding its local projection.

## Retry and Recovery

Timeouts, network failures, rate limits and temporary server errors retry with capped exponential backoff and jitter, retaining the same operation ID. A timed-out request may already have committed, so retrying with a fresh ID is unsafe. Pending financial operations are not silently expired or discarded after an attempt limit.

Invalid data, missing records and edit conflicts become Needs attention, with correction or explicit discard available. Authentication failures pause sending until credentials are corrected. Reopening the app resumes local uploads; server-accepted work continues independently through the durable worker and recovery sweep.

This does not promise zero failed HTTP calls or a transaction spanning the phone and server. ACID applies to the database commit. Device-only pending changes cannot survive uninstalling the app or losing the phone before upload.

Before enabling this contract, test timeout-after-commit replay, duplicate delivery, transaction rollback, worker interruption, ordered create/edit/delete, offline restart, quota/storage failure, permanent errors and snapshot reconciliation. Roll it out to a new APK only after the deployed server protocol passes those checks.

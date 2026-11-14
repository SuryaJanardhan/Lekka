# Encrypted cache-first app data

The app stores compact production ledger entries, categories, rules, reports and notifications as one AES-GCM encrypted IndexedDB snapshot. The random data key is stored through the native Android Keystore vault. PIN and biometric locking apply before hydration. API secrets and device tokens are not stored in the snapshot. Android backup is disabled.

Chat history is stored as encrypted ciphertext. Offline outbox payloads, prior records, server results and errors are encrypted; only retry/order metadata remains visible to IndexedDB. Existing plaintext PIN, snapshot, chat and outbox values are migrated when first read by the upgraded app.

## Reads

- First launch without a cache: one authenticated `GET /api/sync/snapshot`.
- Fresh same-day reopen or screen change: saved data, no startup health check or entity reads.
- Daily check: `GET /api/sync/status` compares a small revision value. A changed revision requests `GET /api/sync/changes` using the saved cursor; an unchanged revision keeps the cache.
- If the midnight job has not completed, status becomes eligible again after 30 minutes. An active ingestion postpones status for one minute. There is no permanent background polling loop: checks happen on opening/resuming or explicit events.
- An ongoing ingestion cannot expose a half-imported snapshot. Snapshot reads also retry if the data revision changes during collection.
- Push marks data stale. Repeated notification keys are ignored; a three-second debounce coalesces a burst of alerts. Tapping a notification refreshes immediately when needed. Notification listeners remain active regardless of caching.
- Refresh requests incremental changes even when the cache is fresh. A complete snapshot is reserved for first launch or explicit recovery. AI chat and explicit export remain online operations.

## Writes

Add, edit, delete, category, rule and notification actions persist an encrypted local operation before projecting the change. Uploading and server-side processing happen without holding the form open. Pending amounts do not change confirmed statistics. Server operation completion commits its data revision atomically, then the app refreshes changes covering that revision. See [durable writes](durable-writes.md).

Only stable-ID outbox commands are automatically replayed; direct legacy writes, ingestion, chat and push registration are not blindly replayed. A failed upload stays pending. A saved server operation stays projected until a covering snapshot is persisted. Completed local receipts are retained for stale-tab and offline-cache recovery, not counted as new pending work once reconciled. A successful server write followed by a failed cache refresh never becomes a second financial transaction.

Initial snapshot persistence uses one IndexedDB transaction. Incremental sync replaces changed IDs, applies server deletion tombstones, and replaces the small authoritative category/rule/notification sets. A failed download, invalid payload, decryption failure or storage failure keeps the last persisted snapshot intact. Storage failures leave sync pending instead of claiming that the new data was cached.

Normal snapshots omit OCR text, AI reasoning, category-learning evidence and complete email bodies. The device receives an 800-character normalized receipt preview plus the fields required by the ledger UI.

## Native push and testing

The app registers its FCM token with the backend once per IST day or when the token changes, rather than checking backend push status on every unlock. Local registration caching does not disable native listeners, permission checks or token rotation. Disabling notifications clears that registration cache.

`npm run test:cache` in `app` tests freshness, daily checks, delayed ingestion, concurrent refreshes, incremental deletion tombstones, offline recovery, quota failure, push deduplication and write invalidation. Backend tests cover compact snapshots, incremental changes, revision acknowledgment, active-ingestion gating and complete-response failures.

Snapshot reports use the current IST month, including month/year rollover. Stored transaction dates are not modified. Settings shows the last snapshot sync time; Saved data is not an assertion of current network connectivity.

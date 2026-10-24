# Cache-first app data

The app stores production ledger entries, categories, rules, reports and notifications as one IndexedDB snapshot. PIN and biometric locking still apply before hydration. API secrets and device tokens are not stored in the snapshot. localStorage holds only sync metadata, existing preferences and a hash of the last registered push token.

## Reads

- First launch without a cache: one authenticated `GET /api/sync/snapshot`.
- Fresh same-day reopen or screen change: saved data, no startup health check or entity reads.
- Daily check: `GET /api/sync/status` compares a small revision value. A changed revision downloads one snapshot; an unchanged revision keeps the cache.
- If the midnight job has not completed, status becomes eligible again after 30 minutes. An active ingestion postpones status for one minute. There is no permanent background polling loop: checks happen on opening/resuming or explicit events.
- An ongoing ingestion cannot expose a half-imported snapshot. Snapshot reads also retry if the data revision changes during collection.
- Push marks data stale. Repeated notification keys are ignored; a three-second debounce coalesces a burst of alerts. Tapping a notification refreshes immediately when needed. Notification listeners remain active regardless of caching.
- Refresh always forces a new snapshot. AI chat and explicit export remain online operations.

## Writes

Add, edit, delete, category, rule and notification actions persist a local operation before projecting the change. Uploading and server-side processing happen without holding the form open. Pending amounts do not change confirmed statistics. Server operation completion commits its data revision atomically, then the app refreshes a complete snapshot covering that revision. See [durable writes](durable-writes.md).

Only stable-ID outbox commands are automatically replayed; direct legacy writes, ingestion, chat and push registration are not blindly replayed. A failed upload stays pending. A saved server operation stays projected until a covering snapshot is persisted. Completed local receipts are retained for stale-tab and offline-cache recovery, not counted as new pending work once reconciled. A successful server write followed by a failed cache refresh never becomes a second financial transaction.

Snapshot persistence uses one IndexedDB transaction. Arrays are replaced, not merged, so deleted entries cannot return. A failed download, incomplete payload or storage failure keeps the last persisted snapshot intact. Storage failures leave sync pending instead of claiming that the new data was cached.

## Native push and testing

The app registers its FCM token with the backend once per IST day or when the token changes, rather than checking backend push status on every unlock. Local registration caching does not disable native listeners, permission checks or token rotation. Disabling notifications clears that registration cache.

`npm run test:cache` in `app` tests freshness, daily checks, delayed ingestion, concurrent refreshes, deletion replacement, offline recovery, quota failure, push deduplication and write invalidation. Backend tests cover full-ledger snapshots, revision acknowledgment, active-ingestion gating and complete-response failures. Browser verification uses real IndexedDB and checks cold reopen network counts, write-then-refresh order and failed-refresh recovery without creating production test expenses.

Snapshot reports use the current IST month, including month/year rollover. Stored transaction dates are not modified. Settings shows the last snapshot sync time; Saved data is not an assertion of current network connectivity.

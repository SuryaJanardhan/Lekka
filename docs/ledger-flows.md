# Debits, credits and categories

Amounts are positive numbers with a separate DEBIT or CREDIT direction. Missing direction on older records means DEBIT. Debits are spending; credits are incoming money. Net flow is credits minus debits, not an account balance. Reports expose each flow separately, including category, mode, daily, monthly and yearly totals.

New transactions default to UPI. Generic older ONLINE or missing mode labels display as UPI; explicit Cash, Card and Friend Paid choices are kept. Modes remain editable. Category source is retained internally for classification and review logic, but is not displayed in transaction details.

An approved matching rule can assign a category directly. Otherwise both debit and credit emails go through category review, even if AI is confident. Confirming a category trains sender plus verified merchant (or exact subject) plus transaction direction. Old auto-learned debit patterns cannot silently classify new credits.

Rules supports creating and editing all conditions, category and priority. Conditions are ANDed, matching is case-insensitive, and higher priority wins; ties use the most recently updated rule. Editing preserves every condition and removes the old generated learning key so later automatic feedback cannot overwrite the edited rule accidentally. Rule changes affect future imports, not historical category choices.

Every database category appears in the category legend, including zero-value categories. Only positive values draw donut segments. Colors are distinct and stable by category ID; the stored category names and colors are not rewritten. Debits and Credits selectors choose the map and trend series. Incoming credits never inflate spending.

## Notes and biometrics

AI notes are validated five-word descriptions, separate from the original receipt. Transaction details show the core fields and short note, not the full email. Original receipt data stays in the backend for parsing, rules and exports. Blank notes and unambiguous old automatic copies of long receipts can be backfilled in bounded batches. Nonempty custom notes and notes marked USER are not overwritten. New imports get summaries during parsing; automatic nightly ingestion also enriches a bounded batch of remaining blank notes. Provider failures leave notes blank rather than copying the receipt or inventing a description.

Enabled native biometrics prompt once when launching locked. Cancellation leaves PIN/manual biometric unlock available and does not cause a prompt loop. Authentication must complete before unlocking. No APK build is required for backend fixes, but native/UI changes need a later APK to verify on the phone.

Legacy APK snapshot/list requests remain debit-only. Credit-aware clients explicitly request includeCredits=true and use a separate local cache scope. Legacy ignored-credit recovery targets only real ignored-credit receipts, never test mail, and does not rewind the regular ingestion cursor or import today's new debit mail early. Message-ID deduplication and deleted-record receipts remain in place.

## Responsiveness proposal, not enabled

For personal use, a durable IndexedDB operation outbox is preferable to adding Redis/MQ. A future implementation should persist a pending operation before changing the UI, show Pending sync honestly, assign idempotency keys for server-side duplicate protection, preserve per-record operation ordering, and retry only safe operations. Pending money must be distinguished from confirmed totals. Until separately approved, writes remain DB-first with immediate loading feedback; there is no offline financial-write queue.

# Test and diagnose Gmail ingestion

Lekka reads one collector Inbox. Bank receipts from other Gmail accounts must arrive there through Gmail forwarding. It does not send email, read the source account's Sent folder, or configure Google forwarding with an IMAP app password.

## Check actual mail and filters

From `backend`, run `npm run mail:preview`. This calls the deployed production API, reads Inbox data without marking mail read, and never creates an expense, notification, or ingestion checkpoint.

The result reports the connected mailbox, selected senders, trusted forwarders, private test recipient, matching-message count, sample subjects/reasons, parsed amount previews, and whether a message was already recorded. A zero `matchingSearchCount` means no matching mail was found in this Inbox; a successful connection alone is not an import.

Preview amounts use the regular deterministic parser. Full ingestion additionally tries AI when no amount was found. Messages without an amount after parsing become review notifications, never invented expenses.

Chat and ingestion share credential lookup: the first non-empty `GROQ_API_KEY`, `GROQ_API_KEY_1` or `GROQ_API_KEY_2` is used. These are production credential aliases, not a local or mock mode. A failed run does not advance the mailbox checkpoint, so retrying after a configuration fix recovers waiting emails; existing Message-ID receipts prevent duplicates.

## Send two real test messages

1. Get `testRecipient` from the preview output. This private Gmail plus-address reaches the existing collector account; no new Gmail account is needed.
2. From your other Gmail account, send a message directly to that address:

   Subject: `[LEKKA TEST] Invoice A`

   Body: `Paid INR 123.45 to Lekka Test Shop. Reference LEKKA-T1.`

3. Send another message to the same address:

   Subject: `[LEKKA TEST] Receipt without amount`

   Body: `Receipt details received. The amount is not provided. Please review manually.`

4. Confirm both messages arrived in the collector Inbox. Check Spam/All Mail if they are missing. Run the preview again: both should be matched, and the first should show `detectedAmount: 123.45`.
5. In Lekka, use Settings > Manual Gmail ingestion once. Expect one expense and one missing-amount review notification. Repeating ingestion must not duplicate either result.
6. Delete the test expense from Lekka after checking it, and mark the test email notification reviewed. Processed-message receipts prevent deleted test transactions from reappearing after a filter reset. Sending a fresh email creates a new message ID and allows another test.

The private test recipient AND `[LEKKA TEST]` subject prefix are both required for messages from an ordinary personal address. Ordinary personal messages to the collector remain excluded. Test inputs are real received emails and go through the production parser, AI, database, and notification paths; no canned transactions are inserted. They are marked `parsedJson.ingestionTest` and retain the test subject.

## Configure selective Gmail forwarding

In the Gmail account that receives the bank emails:

1. Open Settings > See all settings > Forwarding and POP/IMAP > Add a forwarding address.
2. Enter the collector address shown by the preview (`mailbox`).
3. Open that collector Inbox and confirm Google's verification link.
4. Back in the source account, create filters matching the selected bank sender addresses, with Forward it to the verified collector. Keep the original copies. Global forwarding can stay disabled when filters forward only selected messages.
5. Confirm a new matching bank email arrives in the collector Inbox. A direct test email validates delivery and Lekka's parsing; it does not prove that a separate bank-forwarding filter is configured correctly.

Automatic forwarding and manual forwarding are different. Manual forwards usually have your personal address as the outer sender. Set that exact address in `TRUSTED_FORWARDER_EMAILS` to accept its Gmail inline forwards or attached `.eml` messages, and redeploy. The original forwarded sender must still match the bank allowlist. Untrusted quoted `From:` text never grants permission.

Sources: [Google forwarding setup](https://support.google.com/mail/answer/10957?hl=en), [Gmail plus-address aliases](https://support.google.com/mail/answer/22370?hl=en#zippy=%2Cfilter-using-your-gmail-alias).

## Debit-only categories and learning

After admission and duplicate checks, Lekka reads body text and OCR from attached images. Confirmed credits, refunds, cashback and reversals are recorded as ignored, never as spending. Unclear direction, unpaid bills, failed payments or missing amounts require review when AI cannot confirm a completed debit. Manual expense amounts must be positive; negative values are rejected.

Category matching uses user-created or user-confirmed rules first. Without an approved match, every email goes to Review, even if AI suggests a category with high confidence. AI sees the current category names and must choose from that list; an unmatched suggestion becomes unassigned. AI never trains rules automatically, and legacy AI-learned rules are ignored. The configured personal categories are Office Travel, Food, Drinks, Groceries, Medicines, Clothes and Movies. Only an empty category list permits AI to suggest an initial category, still pending review.

Saving an entry's category confirms it and trains a user rule, scoped to exact sender plus a merchant actually present in the body, or exact subject when no reliable merchant exists. For example, `alerts@axis.bank.in` plus body keyword `HungerBox` maps to Food only after the user saves that choice. A different merchant or sender does not match. Repeating a correction updates the learned rule. User-created rules have priority 10 by default and user confirmations 20. Legacy auto-generated keyword-only rules are ignored. The edit form also trains pending category confirmations while preserving original receipt evidence.

In Review, open an entry and choose Category > New category to create one without leaving the sheet. Creating a category selects it but does not approve the transaction or train a rule until Save category or Save changes is pressed. Duplicate names show an inline error without losing the name. Unassigned entries start with Choose category rather than silently selecting the first option. Settings > Categories can rename categories in place; transactions and rules keep the same category ID, and AI receives the updated names. AI never renames categories.

The X beside Notifications in Review clears all in-app notifications with a short animation. It marks alerts read and dismissed rather than deleting their metadata: reminders stop, cleared alerts stay hidden after refresh, and processed-email deduplication remains intact. It does not remove ledger entries or pending transaction reviews. Failed clear requests leave notifications visible. This does not cancel notifications already delivered to Android's system tray.

## Checkpoint and audit behavior

IMAP searches matching senders/recipients across the Inbox before downloading bodies. Initial recovery is bounded to the newest `GMAIL_IMAP_SCAN_LIMIT` matching messages; subsequent runs resume older-first from the last handled UID. `GMAIL_INGEST_LIMIT` bounds body downloads per run. If `hasMore` is true, another manual ingestion continues the backlog. Older messages outside the initial recovery window are counted explicitly.

Original message dates do not control IMAP eligibility. Fetches use stable UIDs, and cursor updates happen only after processing succeeds. Concurrent ingestion is blocked with a short lease. Missing-amount notifications are deduplicated too. OAuth uses full MIME payloads and retains fixed-window pagination progress.

`GET /api/system/sync-status` includes the latest scan diagnostics and `processedEmails`, including sender, subject, result, and test flag. The run history distinguishes scheduled cron invocations from manual tests. No bank data can be imported until a matching message actually reaches the configured Inbox.

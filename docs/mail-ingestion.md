# Test and diagnose Gmail ingestion

Lekka reads one collector Inbox. Bank receipts from other Gmail accounts must arrive there through Gmail forwarding. It does not send email, read the source account's Sent folder, or configure Google forwarding with an IMAP app password.

## Check actual mail and filters

From `backend`, run `npm run mail:preview`. This calls the deployed production API, reads Inbox data without marking mail read, and never creates an expense, notification, or ingestion checkpoint.

The result reports the connected mailbox, selected senders, trusted forwarders, private test recipient, matching-message count, sample subjects/reasons, parsed amount previews, and whether a message was already recorded. A zero `matchingSearchCount` means no matching mail was found in this Inbox; a successful connection alone is not an import.

Preview amounts use the regular deterministic parser. Full ingestion additionally tries AI when no amount was found. Messages without an amount after parsing become review notifications, never invented expenses.

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

## Checkpoint and audit behavior

IMAP searches matching senders/recipients across the Inbox before downloading bodies. Initial recovery is bounded to the newest `GMAIL_IMAP_SCAN_LIMIT` matching messages; subsequent runs resume older-first from the last handled UID. `GMAIL_INGEST_LIMIT` bounds body downloads per run. If `hasMore` is true, another manual ingestion continues the backlog. Older messages outside the initial recovery window are counted explicitly.

Original message dates do not control IMAP eligibility. Fetches use stable UIDs, and cursor updates happen only after processing succeeds. Concurrent ingestion is blocked with a short lease. Missing-amount notifications are deduplicated too. OAuth uses full MIME payloads and retains fixed-window pagination progress.

`GET /api/system/sync-status` includes the latest scan diagnostics and `processedEmails`, including sender, subject, result, and test flag. The run history distinguishes scheduled cron invocations from manual tests. No bank data can be imported until a matching message actually reaches the configured Inbox.

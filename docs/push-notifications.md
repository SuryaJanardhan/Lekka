# Lekka remote notifications

Vercel sends messages through Firebase Cloud Messaging (FCM). Android displays them when Lekka is in the background or closed. Firebase is only the delivery service; the ledger stays in MongoDB.

## Firebase setup

1. Open https://console.firebase.google.com/ and select the Firebase project used for Lekka. An existing project can contain other Android apps too.
2. Open Project settings > General > Your apps > Add app > Android.
3. Enter package name `com.lekka.app`. An SHA certificate fingerprint is not needed for FCM.
4. Download `google-services.json` and place it at `app/android/app/google-services.json`.
5. Open Project settings > Cloud Messaging. Confirm Firebase Cloud Messaging API (V1) is enabled. Use its enable link if needed.
6. Open Project settings > Service accounts > Firebase Admin SDK > Generate new private key. Keep this JSON outside the repository, for example `/home/surya/.config/lekka/firebase-service-account.json`.

Both files must belong to the same Firebase project. Never commit the service-account key or paste it into chat. A legacy server key or Firebase CLI login token is not required.

## Deployment configuration

- Vercel production: set `FIREBASE_SERVICE_ACCOUNT_JSON` to the complete service-account JSON and redeploy the backend. It is never bundled into the APK.
- EAS: set `GOOGLE_SERVICES_JSON` as a file environment variable containing the Android configuration. The build hook copies it into the Android app and validates package name `com.lekka.app`.
- The build hook stops if the Android Firebase configuration is absent. This prevents silently producing an APK with broken remote notifications.
- Keep the existing `CRON_SECRET` for authenticated Vercel scheduled calls.

## Notification cases

| Trigger | Information | Opens |
| --- | --- | --- |
| Morning check, 9 AM IST, only if work remains | Review/uncategorized counts, missing-amount emails, and real examples with sender or merchant context | Review |
| Sunday, 9 PM IST | Recorded weekly spending, expense count, month total, and pending work | Stats |
| Last day of month, 9 PM IST | Recorded monthly spending and expense count; includes weekly total when also a Sunday | Stats |
| Ingestion finds no amount, including after AI parsing | Selected sender's email needs manual review | Review |
| Automatic ingestion adds expenses | New expenses and pending-review count | Ledger or Review |
| Automatic ingestion fails | Sync needs attention | Settings |
| Backend reminder API | Requested financial reminder | Stats |
| Manual expense saved | Existing local confirmation | No navigation |
| Manual Gmail sync finishes | Existing local sync confirmation | No navigation |

Spending reports use the real ledger and show the actual cutoff time, so the evening report does not claim to include later spending. Weekdays do not produce generic evening spending pushes. Morning checks remain quiet when nothing needs attention. Dispatch keys prevent duplicate reports. Invalid FCM tokens are removed. Remote notifications can be disabled in Settings; this removes the phone from backend delivery.

Unread review emails appear before notification history. Mark a reviewed email using its check button; it then stops contributing to pending reminders. Uncategorized expenses appear in the Review queue and stop contributing once a category is assigned. Missing-amount emails never become expenses automatically.

Android native foreground presentation is enabled, so pushes display as system notifications when Lekka is open as well as when it is in the background. Receiving a push refreshes the in-app list without showing a duplicate toast. Empty automatic syncs and biometric/PIN feedback do not generate remote alerts. Manual sync keeps its existing local confirmation without a duplicate remote sync alert.

The morning and evening checks are separate daily cron jobs at `30 3 * * *` and `30 15 * * *` UTC. The evening check selects Sunday or month-end reports and otherwise skips sending. The ingestion schedule remains `30 18 * * *` UTC. Vercel Hobby scheduling has hour-level precision rather than exact-minute guarantees.

## Actual job history

`GET /api/system/sync-status` returns the last Gmail attempt/result, the configured IST schedule, and recent job runs. Each new invocation records start, finish, result, and source (`VERCEL_CRON` or `MANUAL`), including skips and errors. Manual API tests are not evidence of automatic cron execution. Older jobs are not backfilled with invented records. An unfinished run has no completion timestamp.

## Real-device verification

After UI approval, build and install the new APK, unlock once, and grant Android notification permission. Settings should show remote notifications as Connected. Registration requires opening the app once; it remains registered afterward.

Close the app normally and invoke the protected reminder endpoint with the existing API secret to verify delivery without changing daily report deduplication:

`POST /api/notifications/reminder`

Opening a spending report or reminder should open Stats after PIN/biometric unlock; actionable review alerts open Review. Test foreground display too. The digest endpoints remain `GET /api/notifications/digest?kind=morning` and `?kind=evening`; they may legitimately skip when there is no pending work or no report due. Android force-stop and disabled notification permission can prevent delivery.

Verification includes compilation, IST/week/month/leap-year boundaries, notification policy, browser layout, saved chat history, and production AI calls. Vercel-to-FCM delivery was accepted for a registered Android phone, and the user confirmed background system notification receipt. Foreground presentation is enabled in the Android configuration; verify it after installing the rebuilt APK.

References: [Capacitor 6 push notifications](https://capacitorjs.com/docs/v6/apis/push-notifications), [FCM Android delivery](https://firebase.google.com/docs/cloud-messaging/android/receive-messages), [Vercel scheduling limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

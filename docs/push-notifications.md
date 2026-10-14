# Lekka remote notifications

Vercel sends messages through Firebase Cloud Messaging (FCM). Android displays them when Lekka is in the background or closed. Firebase is only the delivery service; the ledger stays in MongoDB.

## Firebase setup

1. Open https://console.firebase.google.com/ and create a project named Lekka. Google Analytics is optional and can be disabled.
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
| Morning, 9 AM IST | Yesterday's expenses, month total, pending reviews | Stats |
| Evening, 9 PM IST | Today's expenses, month total, pending reviews | Stats |
| Ingestion finds no amount, including after AI parsing | Selected sender's email needs manual review | Review |
| Automatic ingestion adds expenses | New expenses and pending-review count | Ledger or Review |
| Automatic ingestion fails | Sync needs attention | Settings |
| Backend reminder API | Requested financial reminder | Stats |
| Manual expense saved | Existing local confirmation | No navigation |
| Manual Gmail sync finishes | Existing local sync confirmation | No navigation |

Summaries use the real ledger, including a truthful zero-spend summary on quiet days. Daily dispatch keys prevent duplicate scheduled summaries. Invalid FCM tokens are removed. Remote notifications can be disabled in Settings; this removes the phone from backend delivery.

Android native foreground presentation is enabled, so pushes display as system notifications when Lekka is open as well as when it is in the background. Receiving a push refreshes the in-app list without showing a duplicate toast. Empty automatic syncs and biometric/PIN feedback do not generate remote alerts. Manual sync keeps its existing local confirmation without a duplicate remote sync alert.

The morning and evening schedules are separate daily cron jobs at `30 3 * * *` and `30 15 * * *` UTC. The ingestion schedule remains `30 18 * * *` UTC. Vercel Hobby scheduling may run within the scheduled hour rather than at the exact minute.

## Real-device verification

After UI approval, build and install the new APK, unlock once, and grant Android notification permission. Settings should show remote notifications as Connected. Registration requires opening the app once; it remains registered afterward.

Close the app normally and invoke the protected digest endpoint with the existing API secret to verify delivery:

`GET /api/notifications/digest?kind=morning`

Opening the received notification should open Stats after PIN/biometric unlock. Check the evening summary and ingestion review alert as well. Repeating the same digest on the same date should return Already sent or in progress. Android force-stop and disabled notification permission can prevent delivery.

Current verification covers compilation, summary date boundaries, browser layout, saved chat history, production AI calls, and an authenticated FCM payload validation with no notification sent. Firebase credentials have been configured in Vercel and EAS. Final phone delivery still needs a registered APK.

References: [Capacitor 6 push notifications](https://capacitorjs.com/docs/v6/apis/push-notifications), [FCM Android delivery](https://firebase.google.com/docs/cloud-messaging/android/receive-messages), [Vercel scheduling limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

# Android terminal: live VGTC integration

## Operational contract

VGTC owns employee records. Create, edit, and delete people in the portal. The terminal downloads every profile returned by VGTC's profile list, enrolls those profiles, and submits attendance over the internet. It must never invent a person from an unknown fingerprint, preserve deleted people by merging an old roster, or report a successful attendance write while the server is unavailable.

The portal's per-profile and bulk attendance switches write `attendanceEnabled`. Stopping attendance leaves the profile visible for enrollment and status inspection. A stopped face or fingerprint scan writes a separate `ATTENDANCE_STOPPED` audit event and does not create an attendance punch. The app refreshes the roster periodically, while the server checks the latest profile state for every scan, including when the app has an older roster.

The supported scanner is R307 / AS608 using USB serial. Templates remain inside that scanner. The API stores the scanner slot ID together with the terminal identity; a slot number alone is not a globally unique employee identity. Replacing a scanner or clearing its memory requires enrollment again. Android's built-in fingerprint unlock is not employee identification.

Face matching runs on the phone. Enrollment saves private phone copies and uploads image copies to private Cloud Storage. The first enrollment image becomes the profile photo. The portal loads authenticated API image URLs; a phone `file://` path cannot be opened remotely over the internet. Phone copies survive an app restart but not necessarily uninstall, clear-data, or device loss. Cloud copies require a configured durable bucket.

## Deployment and device verification

Deploy the server and portal together before installing the new APK. For kiosk authentication, configure `TERMINAL_KEY` in App Hosting Secret Manager, uncomment its `apphosting.yaml` entry, and enter the same value on the terminal setup screen. A VGTC user login with attendance permission also works without that secret. Configure a real private Firebase Storage bucket in `FIREBASE_STORAGE_BUCKET`; the blank placeholder will not store production images. Grant the backend service account object access to that bucket. Do not make biometric images public. A development filesystem fallback is not suitable for App Hosting's ephemeral instances. Deploy the composite Firestore indexes in [server/firestore.indexes.json](../server/firestore.indexes.json) so stopped-attempt queries work in production and local Firebase.

For local testing, enter the local server URL on the phone and ensure it is reachable on the same network. A phone's `localhost` refers to the phone, not the development PC. Production uses the HTTPS VGTC URL. Connection setup validates the authenticated roster before entering the kiosk.

Verify on an actual phone and scanner:

1. Configure the HTTPS VGTC server and terminal credentials; confirm the authenticated roster loads.
2. Check every VGTC profile appears on the terminal, including custom types and profiles without biometrics. Delete one in VGTC; confirm it disappears and an old biometric match cannot submit attendance.
3. Enroll face photos, inspect phone copies, restart the app, and open the profile photo and complete gallery in VGTC.
4. Enroll a finger using both sensor captures. Check the returned slot ID belongs only to that person on this terminal. Test a different person's finger and an unknown finger.
5. Check one success beep, three fast rejection beeps, and spoken guidance in Indian English and Hindi. Install the required Android TTS language voices if unavailable.
6. Disable internet during enrollment and attendance. Confirm no success state or accepted attendance appears. Restore internet and retry.
7. Check manual override and emergency checkout: server rejection must leave local duty unchanged.
8. Stop one person's attendance in the portal, then stop all. Scan that person's enrolled face and finger: each attempt must appear as `ATTENDANCE_STOPPED` in the portal, with no attendance punch. Resume them and confirm a new scan can save attendance.

## Firebase request categories and cost

HTTP GET/POST does not determine Firebase billing. The Android app calls the VGTC Express server; server database operations determine Firestore charges. One POST can perform both reads and several writes. Reading a 100-document roster is normally 100 document reads, not one read.

- Roster: one shared Firestore listener per active server instance; first snapshot reads the `N` profile documents, then each changed document incurs listener reads. Repeated terminal HTTP polls reuse the current snapshot and do not reread all `N` profiles.
- Accepted attendance: usually 3–4 profile/summary document reads and 4 document writes in one transaction. Transaction retries can add reads.
- Stopped biometric attempt: usually 1 profile read plus 1 audit-event write, without an attendance punch. A stop racing an in-flight scan can add reads.
- Portal stop/start: `N` profile validation reads and `N` profile writes for `N` selected people.
- Stopped-attempt feed: one shared listener per server instance; initial query reads up to 200 recent stopped events, then changed events. Repeated portal HTTP polls reuse its snapshot.
- Enrollment: validation reads and profile writes. Fingerprint uniqueness checks can add reads/writes.
- Staff deletion: Firestore document deletes, plus any cleanup operations.
- Photo upload: Cloud Storage upload operations, stored bytes, and any profile metadata reads/writes.
- Photo viewing: profile authorization read, Cloud Storage download operation, and applicable network transfer.
- Local face matching, sensor matching, phone file access, voice, and beeps: no Firebase operation.
- HTTP traffic, live connections, and CPU: separate App Hosting/Cloud Run charges may apply.

For eligible Firestore Standard free-tier usage, the daily allowance is 50,000 document reads, 20,000 writes, and 20,000 deletes for one database per project. These quotas are shared with the rest of VGTC and reset around midnight Pacific time. Storage and transfer have separate allowances. See [Firebase billing](https://firebase.google.com/docs/firestore/pricing).

Illustration only, using the official pricing page's default Iowa list rates checked 2 October 2026: reads $0.03, writes $0.09, deletes $0.01 per 100,000 operations beyond quota. These are not a quote for this project's database location or INR billing currency. At those rates, 100,000 **billable** reads plus 100,000 **billable** writes cost $0.12, excluding storage, network, hosting, taxes, and other operations. See [Firestore regional prices](https://cloud.google.com/firestore/pricing).

For each day, estimate `max(0, totalReads - remainingReadAllowance) * readRate / 100000`, and repeat for writes/deletes. Add Storage and hosting separately. Use the actual remaining allowance after other VGTC modules, actual database region, terminal count, staff count, operating hours, image sizes, and reconnect frequency. An exact rupee monthly bill cannot be inferred from HTTP request counts alone.

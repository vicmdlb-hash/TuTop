# TuTop Build118 — Physical acceptance runbook

Status: **READY FOR PHYSICAL QA / DEVICE A NOT TESTED**

## Exact candidate
- PR #100 / build118
- source SHA: `e93ca0bb237e7fa438df5801fc627f065d9441e6`
- version: `0.9.2-beta.8`
- Android versionCode: `90212`
- workflow run: `35526553288` SUCCESS
- artifact ID: `10609901887`
- artifact archive: `TuTop-build118-e93ca0bb237e7fa438df5801fc627f065d9441e6`
- APK: `TuTop-build118-e93ca0bb237e-publication-self-heal-staging.apk`
- APK size: `21,551,791` bytes
- APK SHA-256: `6fadbdb05d6d3b2386eeffc3e2885e9f406190ed9710914048bd1a14a69ac8f7`

Issue #20 is the physical SSOT. Build117 and older epochs are historical once Build118 is installed.

## What Build118 adds
The runtime now has a one-shot publication session self-heal. On a narrow 401/403/PERMISSION_DENIED/expired-token class, TuTop refreshes verified session state once and retries the **same deterministic operation ID** once. It cannot loop. If the original write reached Firestore, idempotent recovery returns the same listing instead of duplicating it. Draft remains saved on failure.

This is extra defense; it is not physical proof until Device A observes the path.

## First Device A session
1. Verify exact APK SHA-256.
2. Install this exact Build118.
3. Start a new evidence epoch; do not copy Build117 PASS/FAIL.
4. First functional priority: use the same Publish route/account context that historically failed.
5. Confirm the result and then test Topi, draft persistence, camera/gallery, microphone, location opt-in, relaunch/session, weak network, visuals and accessibility.

Never record password, OTP, raw ID/refresh/FCM/App Check token, phone number or hardware ID.

## Remaining grouped sessions
- Shared-device A→logout→B: #52 #56 #60.
- Two-buyer reservation: #50.
- Moderation: #35 #36 #62; blocked until an authorized staging moderator exists.
- Two-device push: #11 #37.

All templates remain pending/false until real evidence exists. Release remains blocked by unresolved physical/external/legal gates even if A_CORE passes.

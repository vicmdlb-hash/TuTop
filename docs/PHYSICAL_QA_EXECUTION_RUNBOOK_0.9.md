# TuTop Build118 — Physical acceptance runbook

Status: **READY FOR PHYSICAL QA / DEVICE A NOT TESTED**.

## Exact candidate
- PR #100 / build118
- source SHA: `e93ca0bb237e7fa438df5801fc627f065d9441e6`
- version: `0.9.2-beta.8`
- versionCode: `90212`
- workflow run: `35526553288` SUCCESS
- artifact ID: `10609901887`
- GitHub artifact: `TuTop-build118-e93ca0bb237e7fa438df5801fc627f065d9441e6`
- APK file: `TuTop-build118-e93ca0bb237e-publication-self-heal-staging.apk`
- APK size: `21,551,791` bytes
- APK SHA-256: `6fadbdb05d6d3b2386eeffc3e2885e9f406190ed9710914048bd1a14a69ac8f7`

Issue #20 remains the physical SSOT. Build117 and older physical candidate bindings are historical.

## What changed specifically for publication
Build118 keeps all Build117 fixes and adds a one-shot publication session self-heal:
1. first publish attempt uses the existing deterministic operation ID;
2. only on narrowly recoverable auth/session/permission errors, TuTop refreshes verified-email session state;
3. verified accounts force-refresh the Firebase ID token and persist it;
4. publish retries exactly once using the **same** operation ID;
5. idempotent listing recovery prevents duplicate listing creation;
6. if refresh/retry still fails, the durable draft remains saved and the user receives a specific message.

This is not physical PASS until observed on Device A.

## First physical sequence — A_CORE
After installing the exact APK:
1. sign in with the same real staging account/path that historically failed;
2. open the existing or new publish draft;
3. publish using the same university/campus route that failed on build116;
4. record PASS/FAIL and whether self-heal diagnostics were observed;
5. do not reinstall between first failure and the immediate retry observation unless the app itself cannot continue.

Then validate Topi draft transfer, draft persistence after process kill, camera/Photo Picker, microphone/es-MX voice, explicit location consent, relaunch/session persistence, weak-network timeout behavior, Light/Dark/System visuals, text scaling/TalkBack, keyboard/Back/lifecycle/safe areas/rotation.

## Remaining grouped sessions
- Shared-device A→logout→B isolation: #52 #56 #60.
- Two-buyer reservation: #50.
- Moderation: #35 #36 #62; blocked until an authorized staging moderation identity exists.
- Two-device push: #11 #37, with exact event/outbox correlation.

## Evidence truth
All Build118 templates start pending/false. Never copy Build117 PASS/FAIL counts. Never store passwords, OTPs, raw ID/refresh/FCM/App Check tokens, phone numbers or hardware IDs.

Physical QA cannot authorize Play/production/billing by itself.

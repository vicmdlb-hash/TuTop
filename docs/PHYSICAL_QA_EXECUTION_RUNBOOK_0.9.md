# TuTop Build117 — Physical acceptance runbook

Status: **READY FOR PHYSICAL QA / DEVICE A NOT TESTED**.

## Exact candidate
- PR #97 / build117
- source SHA: `a578a214f17f3a0ddb7c0d8c6039866f0252c015`
- version: `0.9.2-beta.7`
- versionCode: `90211`
- workflow run: `35495399790` SUCCESS
- artifact ID: `10600229165`
- GitHub artifact: `TuTop-build117-a578a214f17f3a0ddb7c0d8c6039866f0252c015`
- APK file: `TuTop-build117-a578a214f17f-all-fixes-staging.apk`
- APK size: `21,551,223` bytes
- APK SHA-256: `28d9970866367179de769324e722487f26e04bbde498e412b3364905b79d23c6`

Issue #20 remains the physical SSOT. CI/staging PASS is not physical PASS.

## Before installation
1. Verify the APK SHA-256 matches exactly.
2. Record installation mode: upgrade / clean / reinstall.
3. Start a new Build117 evidence session. Do not copy build110/build116 PASS/FAIL values.
4. Never record password, OTP, raw ID/refresh/FCM/App Check token, phone number or hardware ID.

## Session A_CORE — first priority
The first test after Build117 starts is the **same Publish path that failed on build116**.

Then in the same Device A session verify:
- auth + verified university/campus identity;
- publish listing;
- Topi structured compose transfers usable draft fields;
- draft survives process kill/reopen;
- Camera + Photo Picker;
- microphone / es-MX speech recognition;
- location is only attached after explicit per-listing opt-in;
- relaunch/session persistence;
- weak/stalled network ends with bounded error/recovery, never false success;
- approved branding in Light/Dark/System;
- text scaling + TalkBack/focus;
- keyboard, Android Back, lifecycle, safe areas and rotation.

This session covers issues #10 #12 #20 #31 #33 #38 #39 #44 #45.

## Shared-device account switch
Using two real staging accounts on the same phone:
A uses location/personalization/push → logout → B login → prove B cannot inherit A location cache, search/recent/interests or FCM ownership. Include offline logout → reconnect cleanup when feasible.

Covers #52 #56 #60.

## Two-buyer reservation
Use a seller and two authentic buyers/profiles. Prove reserved availability and atomic conflict blocking.

Covers #50.

## Moderation
Currently blocked by the separate fact that staging has zero authorized moderation admins. Do not invent/elevate one merely for QA. Once an authorized identity exists:
pending must not look public → approve → public → remoderate/reject → Nearby invalidates stale approved state.

Covers #35 #36 #62.

## Push two-device
With two physical devices/profiles and a trusted real marketplace event:
foreground, background, cold-start, tap/deep-link, exact outbox/notification correlation and recipient UID isolation.

Covers #11 #37; observe #52 again if account switching is part of the test.

## Evidence truth
All templates are reset to pending/false for Build117. Only physically observed results may become PASS/FAIL/BLOCKED. Keep sessions <=6h and evidence <=24h for the two-device final gate.

Full release remains blocked even if Device A core passes until remaining external/two-device/legal/release gates are resolved.

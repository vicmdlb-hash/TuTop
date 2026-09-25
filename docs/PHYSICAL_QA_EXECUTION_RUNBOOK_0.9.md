# TuTop Build121 — Physical acceptance runbook

Status: **READY FOR PHYSICAL QA / DEVICE A NOT TESTED**.

## Exact candidate
- PR #120 / Build121
- source SHA: `579bdecd7e193b8661276f114b9d3e097792d8d6`
- version: `0.9.2-beta.11`
- versionCode: `90215`
- workflow run: `36064382977` SUCCESS
- artifact ID: `10835643904`
- GitHub artifact: `TuTop-build121-579bdecd7e193b8661276f114b9d3e097792d8d6`
- APK file: `TuTop-build121-579bdecd7e19-post120-physical-repair-staging.apk`
- APK SHA-256: `acd939e5aa4d078270b2fb485e9a41741638e4501cd3c3167871c9ca7bc6f6b8`

Issue #20 remains the physical SSOT. CI/staging PASS is not physical PASS.

## Before installation
1. Verify the APK SHA-256 matches exactly.
2. Record installation mode: upgrade / clean / reinstall.
3. Start a new Build121 evidence session. Do not copy Build118/Build119/Build120 PASS/FAIL values.
4. Never record password, OTP, raw ID/refresh/FCM/App Check token, phone number or hardware ID.

## Session A_CORE — first priority
The first Build121 session must start with the **failure cluster that Build121 was explicitly promoted to repair: second-account/email verification, Topi real AI, notification activation/token health, and real two-device FCM/account isolation**.

Then verify, in this exact causal order:
1. install/boot without crash;
2. second controlled account can verify email and enter the same verified identity reliably;
3. Topi real Firebase AI returns a usable response on Device A and, when available, Device B;
4. Android notification permission visibly reflects the real state;
5. FCM token registration health reaches registered/reconciled state without exposing the token;
6. A → logout (including offline/reconnect when feasible) → B leaves exactly one current token owner and no cross-account personalization/location residue;
7. with Device B available, an authentic A→B marketplace event reaches foreground/background/cold-start and tap opens the exact deep-link;
8. ProductDetail opens without React #300;
9. the historical Publish path succeeds;
10. a `Todo México` listing can publish **without mandatory Paquetería** when another valid delivery method is selected.

After that causal cluster, continue with:
- auth + verified email + university/campus identity;
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

Do **not** expect source/control changes made after Build121 promotion to appear in this APK. Build121 runtime identity is frozen to source `579bdecd7e193b8661276f114b9d3e097792d8d6`; later PR #120 docs/tests/control-plane work does not alter the installed APK.

This session covers issues #10 #12 #20 #31 #33 #38 #39 #44 #45.

## Shared-device account switch
Using two real staging accounts on the same phone:
A uses location/personalization/push → logout → B login → prove B cannot inherit A location cache, search/recent/interests or FCM ownership. Include offline logout → reconnect cleanup when feasible.

Covers #52 #56 #60.

## Two-buyer reservation
Use a seller and two authentic buyers/profiles. Prove reserved availability and atomic conflict blocking.

Covers #50.

## Moderation
Currently blocked by a fresh read-only staging audit: `admins_total=0`, `active_admins=0`, `first_admin_record_needed=true`. Do not invent/elevate one merely for QA. Once an authorized identity exists:
pending must not look public → approve → public → remoderate/reject → Nearby invalidates stale approved state.

Covers #35 #36 #62.

## Push two-device
With two physical devices/profiles and a trusted real marketplace event:
foreground, background, cold-start, tap/deep-link, exact outbox/notification correlation and recipient UID isolation.

Covers #11 #37; observe #52 again if account switching is part of the test.

## Evidence truth
All templates are reset to pending/false for Build121. Only physically observed results may become PASS/FAIL/BLOCKED. Keep sessions <=6h and evidence <=24h for the two-device final gate.

Full release remains blocked even if Device A core passes until remaining external/two-device/legal/release gates are resolved.

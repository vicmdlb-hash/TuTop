# TuTop Build120 — Physical acceptance runbook

Status: **READY FOR PHYSICAL QA / DEVICE A NOT TESTED**.

## Exact candidate
- PR #107 / Build120
- source SHA: `554f4ef6d0429b0059738d8cd6e1b6e4890bda91`
- version: `0.9.2-beta.10`
- versionCode: `90214`
- workflow run: `35560814829` SUCCESS
- artifact ID: `10622421310`
- GitHub artifact: `TuTop-build120-554f4ef6d0429b0059738d8cd6e1b6e4890bda91`
- APK file: `TuTop-build120-554f4ef6d042-deviceA-publication-repair-staging.apk`
- APK size: `21,552,607` bytes
- APK SHA-256: `9855a2e51587f3115f9c270c28d61b1f5c4aa4db7813dacc16b3fe700d458cc0`

Issue #20 remains the physical SSOT. CI/staging PASS is not physical PASS.

## Before installation
1. Verify the APK SHA-256 matches exactly.
2. Record installation mode: upgrade / clean / reinstall.
3. Start a new Build120 evidence session. Do not copy Build118/Build119 PASS/FAIL values.
4. Never record password, OTP, raw ID/refresh/FCM/App Check token, phone number or hardware ID.

## Session A_CORE — first priority
The first Build120 session must start with the **causal failure cluster observed on Build118 plus the national-publication defect found during the Build119 audit**.

Then in the same Device A session verify, in this exact causal order:
1. install/boot without crash;
2. ProductDetail opens without React #300;
3. Topi real Firebase AI returns a usable response;
4. Android notification permission visibly reflects the real state;
5. FCM token registration health reaches registered/reconciled state without exposing the token;
6. the historical Publish path succeeds;
7. a `Todo México` listing can publish **without mandatory Paquetería** when another valid delivery method is selected.

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

Do **not** expect post-Build120 source-only features (PR109–PR114) to appear in this APK unless they are later promoted into a deliberate successor.

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
All templates are reset to pending/false for Build120. Only physically observed results may become PASS/FAIL/BLOCKED. Keep sessions <=6h and evidence <=24h for the two-device final gate.

Full release remains blocked even if Device A core passes until remaining external/two-device/legal/release gates are resolved.

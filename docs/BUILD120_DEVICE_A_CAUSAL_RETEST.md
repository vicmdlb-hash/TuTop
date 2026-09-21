# Build120 — Device A causal retest

This pack is QA-only. It does not rebuild or modify the exact Build120 APK.

## Exact artifact

- Version: `0.9.2-beta.10`
- Android versionCode: `90214`
- Source SHA: `554f4ef6d0429b0059738d8cd6e1b6e4890bda91`
- Workflow run: `35560814829`
- Artifact ID: `10622421310`
- Artifact digest: `sha256:b1692615586256ec35b9bad0e72ab337ede08b3c6f58cfe663842f8df63240d2`
- Expires: `2026-10-21T04:28:39Z`
- APK: `TuTop-build120-554f4ef6d042-deviceA-publication-repair-staging.apk`
- APK SHA-256: `9855a2e51587f3115f9c270c28d61b1f5c4aa4db7813dacc16b3fe700d458cc0`

## Phase A_CAUSAL — do this first

1. Install/launch: app opens normally.
2. **React #300:** open/close several product details and navigate back/forth. No React #300, ErrorBoundary, blank sheet or crash.
3. **Topi real AI:** invoke a Topi action that requires Firebase AI. A real remote response must arrive; a local deterministic substitute does not count.
4. **Notifications permission:** Android permission becomes granted.
5. **FCM token:** TuTop must show the token-registration state as ready. This is not yet real delivery.
6. **Historical Publish path:** repeat the account/university/campus publication flow that previously failed and record the exact visible result.
7. **National without parcel shipping:** choose Todo México, keep parcel shipping off, select another explicit delivery method, and publish. It must not show the retired shipping-required blocker.

## Then A_REGRESSION

Check auth identity, camera/gallery, microphone, explicit location opt-in, durable draft after reload, offline/reconnect and Android back/lifecycle behavior.

## Truth rules

- CI PASS != DEVICE PASS.
- A_CAUSAL PASS clears only these causal lanes.
- Real FCM delivery, moderation E2E, two-account/shared-device gates, privacy/legal and release remain separate.
- Never store passwords, OTPs, raw FCM/App Check tokens, phone numbers or hardware IDs in evidence.

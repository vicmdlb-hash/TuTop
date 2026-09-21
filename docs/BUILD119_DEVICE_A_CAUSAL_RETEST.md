# Build119 — Device A causal retest

This pack is QA-only. It does not rebuild or modify the exact Build119 APK.

## Exact artifact

- Version: `0.9.2-beta.9`
- Source SHA: `90b2f1806b83aad2d9b67a5cde791eec8b3c9b82`
- Workflow run: `35543305250`
- Artifact ID: `10614734857`
- APK: `TuTop-build119-90b2f1806b83-deviceA-repair-staging.apk`
- APK SHA-256: `9a145c5be6d2a7bd6f845c394e6a6d7d0a1f3200223b64783845ecf20f6be283`

## Phase A_CAUSAL

Run these on the same exact installation before broader regression testing:

1. Install/launch: app opens normally.
2. React regression: open/close multiple product details and navigate back/forth; no React #300, blank sheet or crash.
3. Topi real AI: invoke a Topi action that requires Firebase AI. A real AI response must arrive; a local deterministic substitute does not count.
4. Notifications permission: Android permission becomes granted.
5. Notifications token: TuTop must show `Permiso + token` / token registered. Delivery is not required in this phase.
6. Publication: reproduce the historical Publish path and record the exact visible outcome. Do not infer PASS from backend/CI.

## Truth rules

- CI PASS != DEVICE PASS.
- A_CAUSAL PASS clears only the Build118 failure cluster.
- Full release remains blocked until broader physical acceptance, including the later authorized two-device push gate.
- Never store passwords, OTPs, raw FCM/App Check tokens, phone numbers or hardware IDs in evidence.

# Next TuTop candidate — exact signing/App Check binding

Status: **PREPARED / NO APK BUILT**

The next candidate must not depend on a hypothetical certificate before assembly.
The correct private-QA sequence is:

1. All source/config/Rules gates pass.
2. Assemble/sign the exact staging APK only after deliberate authorization.
3. Before upload, prerelease, installation or human handoff, run
   `extract-next-candidate-apk-identity.mjs` on the exact authorized source branch.
   The extraction must verify the APK package is exactly `mx.tutop.app` and export
   one provenance bundle: exact Git source SHA, APK SHA-256, certificate SHA-1 and
   certificate SHA-256.
4. Bind the exact SHA-256 with `register-staging-android-sha256.mjs`.
5. Bind the exact SHA-1 in the restricted staging Firebase API key with
   `register-next-candidate-staging-native-key.mjs`.
6. Both mutating binding scripts must run only from the exact authorized source branch,
   require that the extracted source SHA equals the current Git SHA, consume the same
   exact APK SHA-256 from the extraction step, and require their explicit binding ACK.
7. Read back App Check with `TUTOP_EXPECTED_ANDROID_CERT_SHA256` set to the
   extracted exact SHA-256.
8. Run `next-candidate-external-preapk-gate.mjs` from the same exact source branch
   and require the same extracted source SHA + APK SHA-256 provenance. The gate must
   fail closed if provenance is missing, malformed or belongs to a different source,
   even when the certificate itself is already registered.
9. Only after package identity, provenance, exact bindings and the external gate are
   green may the APK be packaged/uploaded for physical QA.

The source/config phase may prepare and test these contracts, but must not fabricate
a certificate, APK hash or future candidate identity. A source-only `CONTINUA`
does not authorize candidate assembly by inertia.

Never commit a signing private key or debug keystore to the repository. A future
release/Play signing strategy remains a separate release gate.

Build120 fingerprints remain historical evidence only and cannot authorize a
successor artifact.

## Read-only activation checklist after PR123 (09 Nov 2026, CDMX)

**Status: NOT EXECUTED; this is a checklist, not authorization.** The current
source PR is [#123](https://github.com/vicmdlb-hash/TuTop/pull/123),
`integration/tutop-121-122-fcm-owner-ci-20261022`. Its source CI cannot
authenticate the Android package or satisfy the two-device physical gate.

| Gate | Safe evidence to collect | Approval boundary |
| --- | --- | --- |
| App Check registration | [Firebase Console](https://console.firebase.google.com/) > TuTop Beta V2 > Security > App Check > Apps > `mx.tutop.app`: registered yes/no; provider; read-only enforcement status and metrics | **Do not register, enable, disable or change enforcement here** |
| Signing ownership | Identify the approved signing authority and whether a non-debug signing key already exists; never send its private bytes or passwords to ChatGPT/PR/logs | Human choice; never use the invalid historical debug.keystore |
| Source-to-artifact | Re-read exact PR HEAD, CI both PASS for that SHA, then only an explicitly authorized build; record fresh APK SHA-256, package, certificate SHA-256 and build run | No Build120/121 reuse; no speculative fingerprints |
| External binding | Register and read back exact SHA-256 on staging App Check only after explicit authorization; pair same exact artifact with restricted native API SHA-1 and pre-APK gate | No mutation without approval; nothing in this document proves binding |
| Device A/B | Independent physical sessions on two authorized devices, same APK identity, no raw tokens or hardware IDs; FCM cold-start/tap/logout A→B, auth, Topi, UGC moderation and reservation truth | PASS/FAIL only when real evidence is captured |
| Children, privacy and Play | Legal review; all-ages guardian controls, UGC report/block, Data Safety, approved public privacy+deletion web URL, complete erasure | Source test PASS is not child-safety or legal approval |

Firebase's official guidance for Android apps distributed outside Play uses the
Play Integrity provider with different verdict requirements than Play-only
distribution. Do not infer correct App Check configuration from an emulator CI:
https://firebase.google.com/docs/app-check/android/play-integrity-provider

Until all applicable gates are evidenced and explicitly authorized, the next
candidate is **BLOCKED**: never report Build120 as an active APK, never dispatch
legacy 0.9.1 closeout or staging/Android builders just to obtain a green badge.

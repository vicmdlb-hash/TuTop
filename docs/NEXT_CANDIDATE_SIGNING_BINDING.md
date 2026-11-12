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


## Private QA ciphertext custody and real owner recovery — 12 Nov 2026 (CDMX)
<!-- TUTOP_QA_CUSTODY_R36_151_20261112 -->

**Status: DOCUMENTED ONLY / NOT EXECUTED.** This section does not authorize an Android build, GitHub secret upload, App Check change, deployment, Play release, or a physical QA PASS. The current PR's encrypted APK workflow `.github/workflows/tutop-private-qa-encrypted-apk.yml` is trigger-gated; its artifact has `retention-days: 1`.

### Distinct authority boundaries

- **GitHub source/CI:** a green exact-SHA source or emulator job does *not* produce a connected Android APK.
- **Android QA signing:** the workflow requires `TUTOP_QA_JKS_BASE64` and three signing parameters as **GitHub Actions secrets**. Using that workflow therefore requires deliberately entrusting the QA private keystore to GitHub Secrets; it is *not* a strictly local-only signing path. This trust boundary and the exact certificate require separate explicit owner approval. Never send private keystore bytes, passwords, recovery files, tokens, or logs containing them to a chat, repository, issue or Drive.
- **age recipient:** `TUTOP_QA_AGE_RECIPIENT` is a **public** recipient; its paired private identity must remain under the owner's custody. Presence and syntactic validation of the public recipient in a workflow is not proof that the owner still has its private identity.
- **App Check:** Firebase Console previously showed `mx.tutop.app` registered with Play Integrity, but the exact *future QA signing certificate* and off-Play policy require fresh read-only verification. Registration is not enforcement and neither proves successful native attestation.

### Owner-only reversible preflight (no APK or Firebase)

1. On the owner's trusted computer, create or recover an **age identity** using the official age utility; keep the private identity outside the repository, cloud snippets and messaging, with a tested secure backup. Derive its public recipient locally with `age-keygen -y <identity-file>`; compare it character-for-character with the intended `TUTOP_QA_AGE_RECIPIENT` before authorizing workflow configuration. Do not paste the private file into GitHub, Drive or ChatGPT.
2. Before encrypting any real APK, encrypt a harmless text fixture locally to that public recipient, decrypt with the locally held private identity, and compare the recovered bytes/hash with the original. An ephemeral or synthetic key round-trip tests the tool only; it does **not** prove the actual owner's recipient is recoverable.
3. Choose and approve the QA keystore custody model **separately**. If the owner requires keys never to leave the computer, **do not use the existing GitHub-signing workflow** without first designing and reviewing a local-only signing path. Never reuse historical `debug.keystore`.
4. Only with explicit owner permission and valid key custody should the existing one-file trigger be considered. Recheck PR HEAD, exact source/test CI, App Check, signing/certificate provenance, no remote AI, and the intended **private** recipient. Do not create the trigger simply to test the workflow.

### After a future authorized encrypted build (also owner-only)

1. Retrieve `TuTop-Private-QA.apk.age` and its accompanying `TuTop-Private-QA.provenance.txt` **before the one-day artifact expiry**; a workflow SUCCESS alone does not prove the owner retained an installable APK.
2. Decrypt privately with the owner-held identity (`age -d -i <identity-file> -o <local-output.apk> <encrypted-artifact.age>`). Confirm successful restoration and compare the **decrypted APK's SHA-256** against `qa_signed_apk_sha256` in the provenance file. Separately verify package `mx.tutop.app`, version, and signing-certificate fingerprint using Android SDK tooling. Do not upload the plaintext APK or owner identity to this repository or chat.
3. The existing workflow does **not** include this owner-end decrypt-and-compare proof; mark recovery as `UNVERIFIED` until the owner actually performs it. Keep physical R6 Device A+B at `0/2` until distinct, recorded real-device sessions pass. Do not equate encryption integrity, emulator success, or code quality with live Auth, FCM, moderation, erasure, App Check or Play approval.

**Hard stop:** if the age identity is lost, the encrypted artifact expires, signer/certificate/source hashes disagree, a secret cannot be safely custodied, or authorization is absent, do not build, distribute, install, or claim beta readiness.

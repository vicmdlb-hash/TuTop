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
 
## Private NO-AI smoke vs full R6 — 12 Nov 2026 (CDMX)
<!-- TUTOP_PRIVATE_NO_AI_SMOKE_SCOPED_R36_190_20261112 -->

Status: CODE CONTRACT ONLY, NO SIGNED CURRENT APK, NO DEVICE TEST. This is a LIMITED, SELF-REPORTED Android smoke, NOT public release readiness. The existing encrypted workflow disables remote Topi AI. The authoritative scripts/physical-qa-evidence-bundle.mjs still demands topi_real_ai PASS and blocks not_applicable; it remains UNCHANGED. Do not alter full R6 acceptance or claim Android Device A+B PASS.

The independent scripts/private-qa-no-ai-smoke-gate.mjs accepts the original encrypted private QA provenance text plus one sanitised JSON from a future physically observed Android. It validates source SHA, exact decrypted APK SHA-256, QA signing SHA-256, staging package, one physical device, fresh observations, real age owner recovery, App Check token observation without recording raw token, and nine limited checks: install_boot; auth_identity; account_switch_isolation; public_listing_gate; offline_reconnect; android_back; safe_areas; app_check_token_observed; remote_ai_disabled. Set topi_real_ai to not_applicable ONLY in this limited schema, never in the official R6. All nine limited checks require real PASS observations (no fabricated evidence). This scope does not test real two-device FCM, moderation, complete erasure, guardian attestation or Play compliance.

Run locally only AFTER owner approved keys and obtained/decrypted an exact new APK:
node scripts/private-qa-no-ai-smoke-gate.mjs TuTop-Private-QA.provenance.txt private-no-ai-smoke.json --json

JSON fields: schema=tutop.private-smoke-no-ai.v1, source_sha, apk_sha256, certificate_sha256, firebase_project, remote_ai_enabled=false, observed_at, device {physical,manufacturer,model,android_version,installation}, recovery {owner_age_decryption_verified,decrypted_apk_sha256,certificate_sha256}, cases {the nine names above all pass, topi_real_ai:not_applicable}. Keep identity private, never store login/FCM/AppCheck tokens, passwords, OTPs, email, phone, or device identifiers. Owner reports are not independent attestation. The result may be EVIDENCE_COMPLETE_SELF_REPORTED but always includes release_blocked=true AND r6_release_blocked=true.

The workflow's provenance source_sha points to the unique one-file trigger commit, whose parent MUST be the exact code-reviewed HEAD; the final APK hash comes from the decrypted signed bytes. Do not reuse historical Build120/Build121 or claim code HEAD alone is the APK identity.


## Private Android QA installation safety — NO automatic replacement
<!-- TUTOP_PRIVATE_QA_INSTALL_SAFETY_R45_20261116 -->

**Source-only safety finding; no new APK built or installed.** The current owner-local signing contract
(`scripts/local-private-qa-sign-encrypt.mjs`) expects `mx.tutop.app` /
`0.9.2-beta.0` / Android `versionCode 90200`. Historical **Build121**
used `0.9.2-beta.11` / **versionCode 90215** and a different historical
signing certificate. A future owner-local QA package therefore **cannot be
assumed upgrade-compatible** with a phone that still has Build121 installed:
Android may reject the lower versionCode (downgrade), a different signing
certificate (update incompatible), or both.

**Before even proposing a test installation:**

1. On the owner's trusted computer, and **without uninstalling anything**, identify
   whether the test device already has `mx.tutop.app` installed. With Android
   SDK platform-tools and an authorized connected device, read only:
   `adb shell pm path mx.tutop.app`; if it exists, inspect locally with
   `adb shell dumpsys package mx.tutop.app` and note the app's installed
   `versionCode`. This is diagnostic only and does not authenticate the
   installed certificate. Never paste full dumpsys output, device IDs, tokens,
   accounts or private paths into ChatGPT, GitHub, Drive or logs.
2. If installed code is **90215** (or any code greater than **90200**), do
   **not** suggest `adb install -r` or other replacement. Independently check
   the signing certificate of any future candidate APK locally using
   `apksigner verify --print-certs`, with private APK files kept off public
   services; a differing signer also blocks an in-place update.
3. Preserve any existing device data. **No automated uninstall, app-data clear,
   downgrade bypass, or uninstall/reinstall workaround is authorized.** Use a
   separate owner-approved device or profile with no TuTop app only if its
   isolation and staging compatibility have been checked, and the owner has
   confirmed the installation will not disturb data. Never assume a
   parallel-profile install is isolated without testing.
4. Any redesign to increase versionCode, change applicationId, alter Android
   signing identity or Firebase staging bindings is **a separate reviewed
   decision**, not an emergency workaround. Freeze installation when device
   state is unknown; report `INSTALL_COMPATIBILITY_UNKNOWN`.
5. A private, manually authorized no-remote-AI smoke must still use the
   exact recovered signed APK SHA-256, signing certificate, source SHA,
   one-device evidence and existing `private-qa-no-ai-smoke-gate.mjs`.
   **It never satisfies real Topi AI, Device A/B R6, Play, or legal approval.**

This paragraph documents risk only. It does not create a compatible APK,
prove a real device is clean, authorize data deletion, or replace the
owner's consent and independent legal/privacy gates.

### Private no-AI smoke must reject downgrade/reinstallation reports
<!-- TUTOP_OWNER1_R52_20261117_PRIVATE_SMOKE_CLEAN_ONLY -->

The code gate `scripts/private-qa-no-ai-smoke-gate.mjs` now requires
`device.installation` to be exactly `clean`. A self-report of `reinstall`,
`upgrade`, `unknown`, or a missing state **fails closed**; never direct an
owner to uninstall, clear data, force an Android downgrade, or bypass a
signing-certificate mismatch to satisfy this test. The `clean` string is
an owner claim, **not independent Android evidence**: manually establish
that the chosen test device/profile had no existing TuTop package and that
no existing owner data is disturbed **before** attempting an authorized
private install. If the owner's POCO C85 or Samsung already has TuTop,
keep the phone untouched until compatibility and backups are reviewed.
This guard remains isolated to single-device private **no-AI** smoke; it
does not change full two-device R6, App Check, legal review, remote Topi AI,
or any release acceptance state.


## Owner-local successor input and archive isolation — 23 Nov 2026 (CDMX)

After approved staging Rules and build checks, calculate the freshly built APK SHA-256 locally (PowerShell: `Get-FileHash -Algorithm SHA256 -LiteralPath $apkPath`) and supply `TUTOP_QA_INPUT_APK_SHA256` with the existing exact-source SHA and signing settings. This is owner-observed evidence, not independent reproducible-build attestation. Only a private snapshot matching the digest is signed. Do not reuse an old APK.

Successful candidates are written under the original private root at `qa-output/<exact-source-sha>/TuTop-Private-QA.apk.age` and adjacent `TuTop-Private-QA.provenance.txt`. The historical root archive is preserved. Existing or partial output blocks another attempt; preserve it for review, never delete or overwrite it to force a retry. No signing secrets, plaintext APKs or age identity uploaded. Encryption success does not establish App Check, physical QA or release acceptance.

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

## R105 — QA privada del propietario, paquete cifrado existente (19 nov 2026 CDMX)
<!-- TUTOP_OWNER1_R105_20261119_OWNER_SIGNED_CIPHERED_QA_NO_DEVICE -->

**Fuente: declaración del propietario del 19/nov/2026, NO inspección externa de bytes de la APK.** El propietario dice conservar la APK privada, firmada, cifrada y recuperable con procedencia verificada, sin haberla reinstalado ni regenerado. Identidad declarada:

- Paquete `mx.tutop.app`, versión `0.9.2-beta.0`, Android `versionCode 90200`.
- SHA-256 de la APK: `e30ef5ed250253330de3fe4a91d45083cb453c2387db0e0ac3174dd8e7ad397f`.
- SHA-256 del certificado de firma QA: `8cdc55f2178668f606ac46fc40b49ff418d80128710ba61b5064fa00d81efa79`.
- SHA-1 del certificado de firma QA: `1AD05AEA50E0B706EC5C2346707EFC430DAADB6C`.
- El propietario informa que añadió la huella QA a Firebase y el SHA-1 a la clave Android existente, conservando restricciones previas. Play Integrity fue inspeccionado, pero el enforcement de App Check sigue **OFF** y el token en un dispositivo físico **NO VERIFICADO**.

**No es la misma prueba que HEAD actual de GitHub.** La PR #123 conserva como candidato fuente `430b1e8a5005bfad0db1f7214612474529351661` y estado DRAFT/UNMERGED al último corte; la coincidencia fuente exacta → APK firmada recuperada necesita evidencia de provenance del artefacto, no inferirla de versionCode, firmante o hash. Tampoco el manifiesto histórico `docs/PHYSICAL_QA_CANDIDATE_0.9.json` activa automáticamente R6 ni FCM: ese manifiesto es Build120 **OBSOLETO** y la puerta `loadActivePhysicalQaFcmAuthority` debe seguir rechazándolo.

**Preflight no destructivo antes de cualquier intento físico** (sólo con ambos dispositivos presentes y control legítimo de las dos cuentas):

1. Comprobar modelo, Android y versión instalada de `mx.tutop.app` en POCO C85 y Samsung **sin reinstalar, limpiar datos, modificar versión o descargar otro APK**. Si existe Build121 `versionCode 90215` o una firma distinta, detener instalación; no forzar downgrade ni borrar datos.
2. En un entorno de confianza del propietario, cotejar **localmente** APK SHA-256, certificado SHA-256 y SHA-1 con las huellas anteriores. No copiar APK en claro, clave privada, identidad `age`, credenciales, datos de usuario o tokens a GitHub/Drive/chat. Documentar únicamente coincidencia booleana y un alias de sesión anónimo.
3. Verificar la vinculación de staging (proyecto exacto, paquete y firma de la **misma APK**) y revisar App Check en modo lectura; **no activar enforcement, registrar duplicados ni cambiar restricciones API** para obtener un resultado favorable.
4. Exigir control legítimo individual de **ambas cuentas** antes de A→B→A y FCM. Preparar las cuatro observaciones (foreground, background, cold start y deep link) sin enviar push hasta tener dos dispositivos, destino exacto, consentimiento de cada propietario y pruebas del gate FCM. Nunca promover el manifiesto Build120 para permitir envíos.
5. Mantener por separado evidencia de apertura de páginas `privacy.html` y `delete-account.html` (observación del propietario) frente a un flujo real de borrado (aún NO ejecutado). La prueba de borrado con cuenta desechable es **sólo diseño autorizado**; no se crean o eliminan cuentas en esta fase.
6. El propietario se designa candidato a primer moderador; **no existe un administrador staging activo verificado**. Confirmar en Auth su identidad legítima, perfil, inventario real de administradores activos y ACK exacto antes de conceder un rol. El proyecto todavía carece de emisor real de edad/tutela y de responsable legal/ARCO aprobado.

**Estados vigentes:** QA privada **PREPARACIÓN AUTORIZADA**; instalación física pendiente; token App Check/FCM real pendiente; R6 0/2; seguridad de menores, borrado real y Play no aprobados; `RELEASE=false`. La ampliación de CI audit-only añade comprobaciones sintéticas de la puerta de QA no-AI (aceptación nunca equivale a publicación), manifiesto FCM obsoleto fail-closed y límites de escritura en staging.

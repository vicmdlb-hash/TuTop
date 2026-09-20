# TuTop Candidate118 — Google Play / Data Safety engineering preflight

Status: **ENGINEERING PREFLIGHT — NOT A FINAL PLAY CONSOLE DECLARATION**  
Candidate authority: Build118 / PR #100 / SHA `e93ca0bb237e7fa438df5801fc627f065d9441e6`  
Version: `0.9.2-beta.8` / Android versionCode `90212`  
Physical truth: `DEVICE_A_NOT_TESTED`

This document is a reproducible engineering inventory for exact Build118 source. It does not choose legal bases, retention periods, Google Play Data Safety answers, production Firebase, signing keys or publication authorization.

## Fresh Build118 source evidence

- `scripts/android-bootstrap.mjs` pins `compileSdkVersion=36`, `targetSdkVersion=36`, minSdk 24.
- `scripts/android-native-capabilities.mjs` requires `ACCESS_COARSE_LOCATION` and `RECORD_AUDIO`; rejects fine/background location, CAMERA and legacy storage permissions.
- Topi Voice uses Android `SpeechRecognizer` with `EXTRA_PREFER_OFFLINE=false`.
- Topi AI uses Firebase AI Logic Android SDK `17.17.0`.
- `config/project.json` remains fail-closed: `productionPublishingAllowed=false`, `billingAllowed=false`, `distributionTarget=github-actions-debug-apk-first`.
- Signing/keystore secrets remain excluded by `.gitignore`.

## Current Google Play policy check — 2026-09-20

- New mobile apps and app updates submitted from 2026-08-31 must target Android 16 / API 36 or higher.
- Apps that allow account creation must provide an in-app deletion path and an external web resource for account deletion.
- Developers remain responsible for policy compliance of third-party SDK behavior.

Official references:
- https://support.google.com/googleplay/android-developer/answer/11926878
- https://support.google.com/googleplay/android-developer/answer/13327111
- https://support.google.com/googleplay/android-developer/answer/10787469
- https://support.google.com/googleplay/android-developer/answer/13326895

## Public privacy/deletion URL status

Candidate117 audit previously observed HTTP 404 on the default Firebase Hosting privacy/deletion paths. Candidate118 now implements an authenticated external deletion flow in source and validates the exact Hosting payload against the current staging Firebase web config. Current release evidence is:
- Play/Data Safety preflight run `35535647674` = **SUCCESS**;
- Hosting prepare/no-deploy run `35535647662` = **SUCCESS**;
- exact `dist/privacy.html`, `dist/delete-account.html`, `dist/delete-account.js` and generated runtime Firebase config are build-validated;
- the legal-gated Hosting deployment workflow has **0 runs**.

Therefore **current live reachability remains UNKNOWN**: source/build readiness is proven, but Hosting has not been deployed.

Required before release:
- legally approved privacy-policy content and public privacy-query mechanism;
- authorized Hosting deploy of the exact Candidate118 payload;
- reachable external deletion resource;
- fresh primary-evidence probe from the deployed hosting environment.

## Exact permission surface expected from Build118 source

| Permission | Build118 source contract |
|---|---|
| INTERNET | expected from Android/network stack |
| ACCESS_COARSE_LOCATION | required |
| RECORD_AUDIO | required on demand |
| ACCESS_FINE_LOCATION | rejected |
| ACCESS_BACKGROUND_LOCATION | rejected |
| CAMERA | rejected for system Camera/Photo Picker flow |
| READ/WRITE_EXTERNAL_STORAGE | rejected |

Final generated-manifest verification remains required on the exact authorized release AAB candidate.

## Data Safety engineering inventory

| Data area | Build118 engineering handling | Final Play decision still required |
|---|---|---|
| Account identifiers/profile/university | Firebase Auth/profile/institution context | exact Personal info mapping, purpose, required/optional |
| Verification evidence | user-supplied credential evidence can be persisted | sensitivity/access/retention/legal basis |
| Approximate location | on-demand coarse location; listing attachment only with explicit opt-in | location declaration/purpose/optionality |
| Photos/images | user-selected/captured images enter listing/profile/verification flows | Photos/Videos declarations and storage destination |
| Microphone/recognized speech | RECORD_AUDIO on demand; raw audio not persisted by TuTop layer; recognizer may process remotely | Play treatment and recognizer/provider behavior |
| Chats/messages/listings | user-generated marketplace content persisted in Firestore | User content mapping/retention |
| Offers/reservations/transactions | marketplace operational records | do not label as financial/payment data without real-money evidence |
| Push/device IDs | FCM token ownership / installation identifiers | Device or other IDs declaration/purpose |
| Topi prompts/responses | prompt text sent to Firebase AI Logic; generated response returned; staging readback shows no explicit telemetryConfig and 0 Firebase AI Model logs in 48h | User content/provider role + provider retention/processing outside Firebase AI Monitoring |
| App Check | attestation material/tokens for abuse protection | Security/fraud disclosure |
| Trust & safety | reports/reviews/moderation/audit evidence may be retained | legal basis/retention/anonymization |
| Account deletion | in-app request + authenticated external web request source/build validated + trusted erasure contracts | legal retention + authorized Hosting deploy + public URL probe + trusted execution proof |

## Firebase AI monitoring primary readback — 2026-09-20

Read-only ops run `35535825476` = **SUCCESS / mutations=0** and used the current staging project directly:
- Firebase AI Logic ConfigService `GetConfig` at `global` = HTTP 200;
- returned config has **no `telemetryConfig` field**; normalized mode is `UNSPECIFIED`, not a fabricated `NONE`;
- Cloud Logging exclusions = HTTP 200 / **0 active exclusions** / no documented Firebase AI Model prompt-response exclusion;
- Cloud Logging query for `resource.type="firebasevertexai.googleapis.com/Model"` over the last 48h = HTTP 200 / **0 entries**;
- Build118 executed real Firebase AI runtime smoke requests earlier the same day.

Current classification:
`AI_TELEMETRY_CONFIG_ABSENT / AI_MODEL_LOGS_48H=0 / AI_MONITORING_NOT_OBSERVED / PROVIDER_RETENTION_SEPARATE`.

This is strong primary evidence that Firebase AI Monitoring is not currently observed/configured for staging. It is **not** rewritten as a formal `mode=NONE` because the service did not return that enum. It also does not prove that the underlying Gemini provider performs no independent processing or retention; that remains part of final provider/Data Safety/legal review.

## Production backend / signing / AAB status

Build118 has no deliberately selected production Firebase target in this release lane. The manual AAB-preparation workflow in this branch is intentionally fail-closed:

- `workflow_dispatch` only;
- exact confirmation `PREPARE_SIGNED_AAB_NO_UPLOAD`;
- blocked while `productionPublishingAllowed=false`;
- rejects staging and historical Firebase projects;
- requires pre-existing production configs and pre-existing upload-key secrets;
- never generates a key;
- contains no Play upload step;
- versionCode must be **greater than 90212**.

Classification:
`AAB_PIPELINE_PREPARED_FAIL_CLOSED / NOT_EXECUTED / PRODUCTION_TARGET_UNDEFINED / SIGNING_SECRETS_NOT_PROVISIONED / NO_PLAY_UPLOAD`.

## Remaining release blockers

- [ ] Device A Build118 physical acceptance;
- [ ] legally approved privacy content + public privacy-query mechanism;
- [ ] authorized Candidate118 Hosting deploy;
- [ ] reachable public privacy/deletion URLs verified after deploy;
- [ ] final Data Safety answers from exact release candidate + current SDK behavior;
- [ ] human/legal retention decisions;
- [ ] deliberate production Firebase project/config;
- [ ] upload key + Play App Signing setup;
- [ ] signed AAB generated only after explicit authorization;
- [ ] store listing/support/content rating/assets;
- [ ] explicit Play publication authorization.

## Truth boundary

`ENGINEERING_PREFLIGHT != LEGAL_APPROVAL != DEVICE_PASS != SIGNED_RELEASE_AAB != PLAY_APPROVED`

Do not invent retention periods, production targets, signing keys, public URL reachability, physical PASS or Play approval.

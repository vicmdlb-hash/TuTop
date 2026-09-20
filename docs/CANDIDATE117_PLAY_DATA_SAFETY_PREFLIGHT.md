# TuTop Candidate117 — Google Play / Data Safety engineering preflight

Status: **ENGINEERING PREFLIGHT — NOT A FINAL PLAY CONSOLE DECLARATION**  
Candidate authority: build117 / PR #97 / SHA `a578a214f17f3a0ddb7c0d8c6039866f0252c015`  
Version: `0.9.2-beta.7` / Android versionCode `90211`  
Physical truth: `DEVICE_A_NOT_TESTED`

This document is a reproducible engineering inventory for the exact Candidate117 source. It does not choose legal bases, retention periods, Google Play Data Safety answers, or publication authorization.

## Current release blockers

- Privacy source exists, but it is explicitly a beta draft and is not an approved legal policy.
- The default Firebase Hosting URLs tested on 2026-09-20 returned HTTP 404 for both `/privacy.html` and `/delete-account.html`.
- Exact Build117 / PR #97 contains no release AAB pipeline or release signing configuration.
- Successor PR #98 now contains a **manual-only, fail-closed signed-AAB preparation workflow**. It has not been executed and cannot pass while production publishing remains unauthorized, a distinct production Firebase target is undefined, or upload-key secrets are absent.
- `config/project.json` keeps `productionPublishingAllowed=false`, `billingAllowed=false`, and `distributionTarget=github-actions-debug-apk-first`.
- Final Data Safety answers, legal retention decisions, store listing/content rating/assets, Play App Signing enrollment and explicit publication authorization remain pending.
- Physical QA on the exact build117 APK remains pending.

## Target API compliance

Google Play's current mobile requirement for new apps and app updates is Android 16 / API 36 or higher from 2026-08-31. Candidate117 Android bootstrap pins both `compileSdkVersion=36` and `targetSdkVersion=36`, so the **target API level gate is currently green** for this candidate. The exact eventual release bundle must still be re-read before submission.

## Exact Android permission surface

Candidate117 generated manifest audit:

| Permission | Candidate117 |
|---|---|
| INTERNET | present |
| ACCESS_COARSE_LOCATION | present |
| RECORD_AUDIO | present |
| ACCESS_FINE_LOCATION | absent |
| ACCESS_BACKGROUND_LOCATION | absent |
| CAMERA | absent |
| READ_EXTERNAL_STORAGE / WRITE_EXTERNAL_STORAGE | absent |

Camera/photo selection uses the system Camera / Photo Picker flow rather than declaring legacy camera/storage permissions.

## Exact native/runtime integrations relevant to privacy

- Firebase Authentication / Firestore through the app runtime.
- Firebase Cloud Messaging via `@capacitor-firebase/messaging@8.5.1`.
- Firebase App Check via `@capacitor-firebase/app-check@8.5.0`.
- Firebase AI Logic Android SDK `com.google.firebase:firebase-ai:17.17.0`.
- Capacitor Geolocation `8.2.2`.
- Capacitor Camera `8.2.4`.
- Capacitor Filesystem `8.1.0`.
- Android `SpeechRecognizer` for Topi Voice; `RecognizerIntent.EXTRA_PREFER_OFFLINE=false`.
- FCM auto-init is disabled by generated Android metadata and token registration is controlled by TuTop runtime logic.
- Firebase Analytics auto-collection is not enabled by the generated metadata reviewed for Candidate117.

## Engineering Data Safety matrix

The column “engineering handling” describes what the exact source can do. It is not a legal conclusion about Play's final `collected/shared/optional/required` selections.

| Data area | Exact Candidate117 evidence | Engineering handling | Final Play decision still required |
|---|---|---|---|
| Account identifiers | Firebase Auth, UID, email/profile paths | transmitted/stored for account authentication and account/profile operation | exact Personal info subtypes, purposes, required/optional |
| Name/profile/university context | user/profile, institution/campus/faculty/career fields | persisted in TuTop backend where feature is used | exact Personal info/App info category mapping |
| Verification evidence | verification request/public-verification flows | user-supplied identity/credential evidence can be persisted | sensitivity classification, access/retention/legal basis |
| Approximate location | `ACCESS_COARSE_LOCATION`; UID-scoped cache; explicit listing opt-in | approximate location can be read on demand and can be persisted with a listing only after explicit opt-in | Play location declaration, purpose, optionality |
| Precise/background location | no fine/background permission | not part of Candidate117 native permission surface | re-audit exact release manifest |
| Photos/images | Camera/Photo Picker + Filesystem; listing/profile/verification flows | user-selected/captured images can enter TuTop content flows | exact Photos/Videos declarations and storage destination |
| Raw microphone audio | `RECORD_AUDIO` under user action; SpeechRecognizer | TuTop source does not persist raw microphone audio | system/recognizer processing and Play treatment |
| Recognized speech text | Topi Voice returns recognized text | recognized text can become user-entered Topi/listing content | User content declaration/purpose |
| Chats/messages | Firestore chat/message model | message text, sender identifiers, optional image references and timestamps can be persisted | User-generated content declaration, retention/legal rules |
| Listings/search/favorites | marketplace, saved-search, favorites and local personalization stores | marketplace/app-activity/preferences data are persisted or UID-scoped locally | exact App activity / Other data subtypes |
| Offers/reservations/transactions | marketplace operational records | retained for marketplace state/integrity/disputes | do not label as financial/payment data without real-money evidence |
| Push/device identifiers | FCM token ownership + Firebase Installations dependency | FCM/installation identifiers and app version are processed for push delivery | Device or other IDs declaration and purpose |
| App metadata | Firebase user agent / app version / package | SDKs can process app/device metadata to provide Firebase services | exact App info/performance categories, if applicable |
| Topi prompt/response | Firebase AI Logic `generateContent` | developer-defined prompt text is sent to Firebase AI Logic; generated response returns to client | User content handling, provider role, collection/sharing determination |
| Firebase AI metadata | model name, SDK/runtime/app metadata; Auth may attach UID when signed in | processed by Firebase AI Logic according to SDK/service behavior | final Data Safety disclosure and AI monitoring state |
| App Check attestation | App Check plugin present | attestation material/tokens can be processed for abuse protection | Security/fraud purpose and provider disclosures |
| Trust & safety | reports, reviews, moderation, audit log | operational evidence can be retained for trust/safety | legal basis, retention period, anonymization/minimization |
| Account deletion | in-app request flow + trusted erasure processor | delete/withdraw/retain plan exists; destructive apply is controlled | final retention policy and externally reachable deletion URL |

## Firebase-specific disclosure evidence

Official Firebase guidance states that Android developers remain responsible for their Data Safety answers and must account for both SDK behavior and their own developer-defined data usage.

Relevant current Firebase disclosures for Candidate117 include:

- Firebase Cloud Messaging automatically processes app version / Firebase user agent and depends on Firebase Installations.
- Firebase Installations / FCM use installation identifiers for service operation.
- Firebase App Check processes attestation material and App Check tokens for abuse protection.
- Firebase AI Logic automatically processes model/SDK/runtime/app metadata; developer-defined prompt content must be accounted for.
- If Firebase AI Logic is used with Firebase Authentication, signed-in requests can include the applicable Firebase User ID.
- If AI monitoring is enabled for the applicable backend, sampled prompts/generated output can be collected with usage/performance metrics.
- Firebase documents that collected end-user data covered by its Android disclosure is encrypted in transit.

## Voice-specific boundary

The exact TuTop Android voice plugin sets `RecognizerIntent.EXTRA_PREFER_OFFLINE=false`. Therefore engineering cannot claim that speech recognition is local-only. The final privacy/Data Safety review must account for the recognizer implementation present on the release device/platform.

## Public privacy and deletion URL status

Candidate117 release audit run `35498336723` probed:

- `https://tutop-beta-vicmdlb-1356585881.web.app/privacy.html`
- `https://tutop-beta-vicmdlb-1356585881.web.app/delete-account.html`
- `https://tutop-beta-vicmdlb-1356585881.firebaseapp.com/privacy.html`
- `https://tutop-beta-vicmdlb-1356585881.firebaseapp.com/delete-account.html`

All four returned **HTTP 404** at the time of the audit. Source existence is therefore not evidence of a publicly reachable Play-compliant resource.

The source deletion page currently has `robots=noindex`. Google Play's account-deletion requirement is about a reachable web resource; this engineering preflight does not treat search-engine indexing as the compliance criterion. Public reachability and policy/legal approval are the actual unresolved gates.

## Production backend/configuration status

Candidate117 does not have a deliberately selected production Firebase target:

- no versioned `.firebaserc`;
- no `config/environments.json`, `config/firebase.json`, or `config/release.json`;
- `config/` currently contains only `project.json` and `staging-reset-once.json`;
- Android bootstrap explicitly recognizes the current staging project and rejects the historical Firebase project for the V2 path;
- `productionPublishingAllowed=false`.

Therefore a Play AAB must **not** be prepared by silently reusing staging or the historical Firebase project. A production project/configuration target must be explicitly selected, security-reviewed and wired before signed release-bundle generation.

## AAB / signing status

Candidate117 baseline audit run `35498336723` found:

- generated Android `release { ... }` block exists;
- no release `signingConfig` is configured in the generated project;
- Build117 / PR #97 itself has no `bundleRelease` pipeline;
- upload-key/keystore secret files are correctly excluded by `.gitignore`;
- current distribution remains debug-APK-first;
- no APK or AAB was generated by the release-readiness audit.

Successor PR #98 now prepares `.github/workflows/candidate117-play-aab-prepare.yml`:
- `workflow_dispatch` only;
- requires exact confirmation `PREPARE_SIGNED_AAB_NO_UPLOAD`;
- fails if `productionPublishingAllowed != true`;
- rejects the staging and historical Firebase project IDs as a Play production target;
- requires pre-existing production Web/Android Firebase configs and a pre-existing upload keystore through secrets;
- does **not** generate a signing key;
- runs `bundleRelease`, then signs/verifies the AAB with `jarsigner`;
- uploads only a short-lived GitHub artifact for human review;
- contains **no Play Console upload step**.

Current classification: `AAB_PIPELINE_PREPARED_FAIL_CLOSED / NOT_EXECUTED / PRODUCTION_TARGET_UNDEFINED / SIGNING_SECRETS_NOT_PROVISIONED / NO_PLAY_UPLOAD`.

For Google Play, the eventual Android App Bundle must be signed with an upload key before upload, and Play App Signing must be configured according to the selected Play Console flow.
## Official references used for this preflight

- Google Play account deletion: https://support.google.com/googleplay/android-developer/answer/13327111
- Google Play Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play User Data policy: https://support.google.com/googleplay/android-developer/answer/10144311
- Google Play privacy policy / App content: https://support.google.com/googleplay/android-developer/answer/9859455
- July 15, 2026 Google Play policy announcement (AI/location clarification): https://support.google.com/googleplay/android-developer/answer/17134731
- Firebase Android Play data disclosure: https://firebase.google.com/docs/android/play-data-disclosure
- Firebase privacy/security: https://firebase.google.com/support/privacy
- Android app signing: https://developer.android.com/studio/publish/app-signing
- Play App Signing: https://support.google.com/googleplay/android-developer/answer/9842756

## Release truth boundary

`SOURCE_PREFLIGHT_PASS != LEGAL_APPROVAL != DEVICE_PASS != PLAY_APPROVED`

Do not:
- invent retention periods;
- mark the beta privacy draft as approved;
- claim the 404 URLs are public resources;
- create/store a signing key in the repository;
- publish/upload to Play without explicit authorization;
- promote Build117 to physical PASS without Device A evidence.

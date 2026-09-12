# TuTop 0.9 — APK28 Static Audit

Date: 2026-09-12
Scope: `TuTop-0.9.0-beta.0-physical-qa-staging-28`
Artifact ID: `10292454237`
Build run: `34677397609`
Build SHA: `b3efd2fc3b6236206f6f209a0c65c7420f1b4b90`

## Integrity

- APK SHA-256: `2131007fb944b144d85eb8c5deb9ad80f93bd20c1515b7793f89278cd1a9f7e3`
- Size: `6509808` bytes.
- Independent local hash matches the candidate manifest.
- APK contains an Android APK Signing Block.

## Android manifest

Decoded values from the packaged binary manifest:

- package: `mx.tutop.app`
- versionName: `0.9.0-beta.0`
- versionCode: `90000`
- minSdk: `24`
- targetSdk: `36`
- compileSdk: `36`
- `android:debuggable=true`
- `android:allowBackup=true`
- MainActivity: `mx.tutop.app.MainActivity`, exported launcher activity.
- FileProvider: `exported=false`.
- AndroidX Startup provider: `exported=false`.
- ProfileInstaller receiver is exported but protected by `android.permission.DUMP`.

Declared permissions are limited to:

- `android.permission.INTERNET`
- package-local dynamic receiver permission generated for Android component safety.

Strings for camera/location/audio permissions exist in dependency bytecode but are not declared as granted application permissions in the packaged manifest.

## Capacitor / transport

Packaged Capacitor config confirms:

- `appId=mx.tutop.app`
- Android scheme: HTTPS.
- `allowMixedContent=false`.

No localhost / `127.0.0.1` / `10.0.2.2` runtime endpoint was found in the packaged web bundle.

## Firebase environment isolation

The packaged web runtime contains the expected staging project `tutop-beta-vicmdlb-1356585881` and also retains the historical `tutop-3a4f7` Firebase public web configuration as a legacy fallback constant.

This does not currently create an accidental production route in APK28 because the compiled runtime:

1. supplies the staging config first;
2. runs the V2 environment guard;
3. explicitly throws `V2_LEGACY_FIREBASE_BLOCKED` for `tutop-3a4f7`;
4. throws `V2_STAGING_PROJECT_MISMATCH` if staging does not match the exact staging project.

Result: **PASS for current Physical QA environment isolation**. The legacy public config can be removed in a later runtime-hardening cycle, but changing it now would invalidate the frozen candidate and require a new exact-SHA release chain.

## Secret / bundle scan

No packaged files matching common sensitive artifacts were found:

- no `.env`;
- no service-account JSON;
- no private-key / PEM / JKS / P12 file;
- no source maps;
- no hard-coded OAuth client secret;
- no hard-coded Firebase CI token;
- no hard-coded password value.

Firebase Web API keys are present as expected client-side Firebase configuration and are not treated as private credentials. Server-side authorization must continue to rely on Auth, App Check posture, Firestore Rules and trusted backend gates.

## Authentication storage — production blocker

APK28 persists the current Firebase session object, including ID token and refresh token, in WebView `localStorage`.

This is acceptable only for the current staging Physical QA candidate with test accounts. It is **not approved as the final production credential-storage design**.

Before any production/distributable build, complete the existing secure-storage plan:

- move long-lived session material to Android Keystore-backed / encrypted native storage;
- remove or strictly migrate legacy WebView token storage;
- validate logout, token refresh and reinstall/recovery semantics;
- set `allowBackup=false` or implement explicit backup/data-extraction rules that exclude authentication/session material.

Because this is a runtime change, do not patch it into APK28. It belongs to the first post-Physical-QA release-hardening candidate and must restart the exact-SHA October → Staging → Android → artifact verification chain.

## Signing posture

APK28 is signed with an **Android Debug** certificate using APK Signature Scheme v2.

Certificate fingerprint (SHA-256):
`B5:7F:7D:FC:10:B8:1F:A3:1F:50:A6:5F:B9:F8:9E:D1:79:01:B7:70:01:54:47:83:8C:60:AC:42:A2:D1:8B:05`

Therefore APK28 is approved only for staging / Physical QA. It must never be promoted as a production or store-distribution binary.

## Physical QA decision

Current status: **STATIC AUDIT PASS FOR PHYSICAL QA**.

The remaining release gate is real evidence from two distinct physical Android devices A+B. Do not synthesize PASS values. The two-device gate remains authoritative.

## Required post-QA hardening before distributable release

1. Keystore/encrypted auth-session storage.
2. `allowBackup=false` or explicit backup exclusion rules.
3. non-debuggable release variant.
4. dedicated release signing key/certificate and release signing verification.
5. repeat exact-SHA October → Staging → Android → artifact verification after those runtime changes.
6. re-run Physical QA if any user-visible/runtime behavior changes.

## Frozen protections retained

- production blocked;
- billing blocked;
- Google Play/Internal App Sharing blocked;
- App Check enforcement blocked during freeze;
- reviews/wallet/favorites cutovers remain false;
- PR #6 remains unmerged until explicit authorization.

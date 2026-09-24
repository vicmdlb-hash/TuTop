# TuTop staging — custom Firebase Auth email handler cutover

Status: **PREPARED / NOT APPLIED**  
Scope: staging only (`tutop-beta-vicmdlb-1356585881`)  
Build120: historical `obsolete_physical_fail`; do not use it for acceptance.

## Goal

Replace the default Firebase Auth action handler (`/__/auth/action`) with TuTop's reviewed
`/auth-action.html` before any successor APK is authorized.

This is required because Firebase verification emails currently resolve to the default
Firebase handler. TuTop source now has two recovery paths:

1. first-party web handler `/auth-action.html`;
2. in-app paste-link redemption that applies `verifyEmail` `oobCode` and requires
   the returned Firebase UID to equal the currently signed-in UID.

## Preconditions

- PR #120 source/config suite green.
- Staging only; no Play/production changes.
- `public/auth-action.html`, `public/auth-action.js` and `firebase.json` security headers reviewed.
- Staging Hosting deployment explicitly authorized.
- No legal/privacy page is promoted merely by deploying this handler.
- A rollback URL is recorded: `https://tutop-beta-vicmdlb-1356585881.firebaseapp.com/__/auth/action`.

## Stage 1 — deploy only reviewed staging Hosting assets

Do not deploy production. Build the exact reviewed source and publish only to the staging
Firebase Hosting site. Confirm:

- `/auth-action.html` returns HTTP 200;
- `Cache-Control: no-store`;
- `X-Frame-Options: DENY`;
- `Referrer-Policy: no-referrer`;
- `X-Content-Type-Options: nosniff`;
- restrictive `Permissions-Policy`;
- page loads its same-origin `/auth-action.js`;
- invalid/missing action codes fail safely and reveal no credential/token.

## Stage 2 — change Firebase Authentication email action URL

In Firebase Console for the exact staging project:

Authentication → Templates → edit an email template → **Customize action URL**

Set:

`https://tutop-beta-vicmdlb-1356585881.firebaseapp.com/auth-action.html`

Firebase applies the customized action URL to user-management email templates. Do not
change sender/domain branding or production settings in this operation.

## Stage 3 — read-back

Run:

`node scripts/audit-staging-auth-email-config.mjs`

Required:

- `callback_uri_configured=true`
- `callback_uri_origin=https://tutop-beta-vicmdlb-1356585881.firebaseapp.com`
- `callback_uri_path=/auth-action.html` (or `/auth-action`)
- `custom_tutop_handler_configured=true`

Then run the public reachability gate in
`scripts/next-candidate-external-preapk-gate.mjs`.

## Stage 4 — controlled verification evidence

Use a disposable staging account. Never use a production identity.

Required observations:

1. verification email is delivered and `verifyEmail` succeeds;
2. password-reset email opens the same TuTop handler, validates the code and changes the password only after two matching >=8-character entries;
3. recover-email action applies its Firebase OOB code and returns a safe confirmation;
4. all links open the TuTop handler, not `/__/auth/action`;
5. expired/reused codes give a safe retry message;
6. cross-account verification link is rejected by the in-app UID-binding recovery;
7. returning to the app causes automatic verification refresh;
8. publication/chat/offer/reservation remain blocked until Firebase reports
   `emailVerified=true`;
9. browser storage and diagnostics contain no password, ID token or refresh token.

Do not mark physical PASS from a browser-only test.

## Rollback

If delivery or action handling regresses, restore the staging template action URL to:

`https://tutop-beta-vicmdlb-1356585881.firebaseapp.com/__/auth/action`

Then re-run the read-only audit and keep the next candidate blocked.

## Promotion rule

No successor APK may be assembled/promoted while either is true:

- `NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_NOT_CONFIGURED`;
- `NEXT_CANDIDATE_ANDROID_SHA256_REQUIRED`.

Even after both gates pass, device acceptance remains separate.

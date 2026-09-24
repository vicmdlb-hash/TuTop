> **2026-09-23 live staging authority:** TuTop's reviewed handler is deployed and reachable at `https://tutop-beta-vicmdlb-1356585881.web.app/auth-action.html`. Identity Toolkit Admin v2 rejects automated mutation of `notification.sendEmail.callbackUri` with exact provider error `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`. **Do not retry that PATCH.** Firebase's documented route is the Firebase Console email-template control: Authentication → Templates → edit template → **Customize action URL**.

# TuTop staging — custom Firebase Auth email handler cutover

Status: **HOSTING DEPLOYED / CALLBACK MANUAL-CONSOLE GATE OPEN**  
Scope: staging only (`tutop-beta-vicmdlb-1356585881`)  
Build120: historical `obsolete_physical_fail`; never reinstall/retest it.

## Current truth

- Reviewed TuTop handler: `https://tutop-beta-vicmdlb-1356585881.web.app/auth-action.html`
- Public handler: deployed.
- Hardened response policy: `Cache-Control: no-store`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, restrictive `Permissions-Policy`.
- Current Firebase Auth callback: default managed `/__/auth/action`.
- Automated callback PATCH: **provider-rejected / retired** with `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`.
- Successor APK gate: **BLOCKED** until read-back reports `TUTOP_CUSTOM`.
- Android signing SHA-256 remains a separate later gate after a deliberately assembled successor artifact exists.

## Single remaining human action for this lane

Open the exact **staging** Firebase project, then:

1. Authentication.
2. Templates.
3. Edit the verification email template.
4. Choose **Customize action URL**.
5. Set:
   `https://tutop-beta-vicmdlb-1356585881.web.app/auth-action.html`
6. Save.
7. Do not change production, sender domain, SMTP, branding, Play, or Android settings.

Firebase documents this console flow for custom email action handlers. The same customized action URL is used by the project's user-management email templates.

## Automated read-back after the console save

Run:

`node scripts/audit-staging-auth-email-config.mjs`

Required truth:
- `auth_email_handler_mode=TUTOP_CUSTOM`
- `custom_tutop_handler_configured=true`
- callback origin `https://tutop-beta-vicmdlb-1356585881.web.app`
- callback path `/auth-action.html` or `/auth-action`

Then run:

`node scripts/next-candidate-external-preapk-gate.mjs`

That gate now **fails closed** with `NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_NOT_CONFIGURED` while Firebase still points to the default managed handler.

## Controlled verification evidence after the callback changes

Use staging identities only.

Required:
1. verification email opens the TuTop handler and `verifyEmail` succeeds;
2. password reset opens the TuTop handler and only accepts two matching passwords of at least 8 characters;
3. recover-email applies the Firebase OOB code safely;
4. expired/reused codes fail safely;
5. cross-account in-app paste-link redemption is rejected by UID binding;
6. returning to the app refreshes verification state automatically;
7. sensitive marketplace writes remain blocked until Firebase reports `emailVerified=true`;
8. browser storage/diagnostics contain no password, ID token, refresh token, or OOB secret.

Browser proof is not Device A physical PASS.

## Rollback

If the custom handler causes regressions, restore the Firebase-managed action URL from Firebase Console, rerun the read-only audit, and keep successor APK blocked.

## Promotion rule

No successor APK may be assembled/promoted while either is true:

- `NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_NOT_CONFIGURED`
- `NEXT_CANDIDATE_SIGNED_CERT_SHA256_REQUIRED` / exact SHA-256 not registered

Even after both pass, physical acceptance remains separate.

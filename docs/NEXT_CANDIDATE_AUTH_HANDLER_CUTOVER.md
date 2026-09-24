# TuTop staging — Firebase Auth email handler authority

Status: **FIREBASE_DEFAULT_MANAGED = SUPPORTED / CUSTOM HANDLER = OPTIONAL PROVIDER-LIMITED ENHANCEMENT**  
Project: `tutop-beta-vicmdlb-1356585881`

## Live result

TuTop's reviewed custom handler is deployed at:

`https://tutop-beta-vicmdlb-1356585881.web.app/auth-action.html`

However:

- Firebase Console rejects saving it as the custom Action URL.
- Identity Toolkit Admin v2 also rejects the same callback mutation with
  `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`.
- Repeated automated PATCH attempts are retired.
- Firebase's supported default email action handler remains:
  `https://tutop-beta-vicmdlb-1356585881.firebaseapp.com/__/auth/action`.

Firebase documents that projects have a default managed action handler and that a custom
handler is optional. Therefore failure to customize the URL is classified as
`PROVIDER_LIMITATION / OPTIONAL_ENHANCEMENT`, not a blocker for the next Android QA
candidate.

## Required protections while using Firebase default handler

TuTop successor source MUST keep:

1. Firebase `emailVerified` as the authoritative verification bit.
2. automatic verification refresh when the app regains focus/visibility;
3. manual “Ya verifiqué / comprobar” recovery;
4. in-app paste-link recovery for `verifyEmail` that:
   - extracts the Firebase `oobCode`;
   - applies it through Firebase;
   - requires returned UID == currently signed-in UID;
5. sensitive writes remain fail-closed until Firebase reports `emailVerified=true`;
6. safe resend-verification flow;
7. no phone alias presented as SMS-verified identity.

These are source/CI contracts and do not turn CI into physical PASS.

## Optional custom handler

Keep the reviewed custom handler deployed as an optional future enhancement. If Google later
allows `Customize action URL`, it can be enabled after read-back without changing the
Android acceptance model.

Do not retry the rejected Identity Toolkit callback PATCH by inertia.

## Next-candidate promotion gates

The Auth handler mode passes when it is either:

- `FIREBASE_DEFAULT_MANAGED` on the exact staging Firebase domain; or
- `TUTOP_CUSTOM` with public reachability + hardened headers.

Unknown/external handlers fail closed.

The independent Android gate still requires:

- the exact signing SHA-256 of the deliberately assembled successor artifact;
- registration/read-back of that exact SHA-256 in staging Firebase/App Check;
- source/config/Rules suite green.

Physical acceptance remains separate.

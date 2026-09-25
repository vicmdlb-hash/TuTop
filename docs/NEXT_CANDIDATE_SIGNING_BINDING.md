# Next TuTop candidate — exact signing/App Check binding

Status: **BUILD121 PROMOTED / AWAITING PHYSICAL QA**

Active engineering candidate:
- Build: **121**
- Version: **0.9.2-beta.11**
- Android versionCode: **90215**
- Branch: `candidate/tutop-121-post120-physical-repair`
- Source SHA: `579bdecd7e193b8661276f114b9d3e097792d8d6`
- Package: `mx.tutop.app`
- APK SHA-256: `acd939e5aa4d078270b2fb485e9a41741638e4501cd3c3167871c9ca7bc6f6b8`
- Certificate SHA-1: `70685D4846AABA94B63E86E207D3CEE062A26725`
- Certificate SHA-256: `192B19F3E67ED7B69FA6862429E232B892979A6C8C97800845F6A1D1948FF79A`
- Build/promote run: `36064382977 = SUCCESS`
- Artifact ID: `10835643904`
- Artifact digest: `sha256:ebd4629a9d1d5c693eb635227c0d94ed2246c2bcf87a891b46cb8c2d317c54f9`

Promotion sequence completed:
1. PR120 source/config/provenance gates green.
2. Exact one-shot candidate branch/trigger.
3. Full source regression.
4. Firestore + Storage isolated emulator.
5. Public staging/Auth/App Check read-only gates.
6. Real staging Topi Firebase AI smoke.
7. Android lint/unit/assemble.
8. Exact package/source/APK/certificate extraction.
9. Exact SHA-256 Firebase registration + read-back.
10. Exact SHA-1 restricted API-key registration + read-back.
11. Exact App Check certificate read-back.
12. External pre-promotion gate.
13. APK branding/auth inspection.
14. Artifact packaging/upload.
15. Explicit proof: no AAB / Play / production.

Build120 remains **retired / obsolete_physical_fail** and must not be retested.

Build121 is **not physically accepted yet**. CI/emulator/backend success does not equal Device A/B PASS. Physical QA must prioritize:
- second account + real email verification + entry,
- Topi real AI on-device,
- visible notification permission/activation and token registration,
- real two-device FCM receive/tap/deep-link/receipt,
- A offline logout → B login → reconnect ownership isolation,
- relevant install/lifecycle/offline regressions.

Never commit a signing private key or debug keystore. Release/Play signing remains a separate release gate.

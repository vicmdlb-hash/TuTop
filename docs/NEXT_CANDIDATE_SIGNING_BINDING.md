# Next TuTop candidate — exact signing/App Check binding

Status: **PREPARED / NO APK BUILT**

The next candidate must not depend on a hypothetical certificate before assembly.
The correct private-QA sequence is:

1. All source/config/Rules gates pass.
2. Assemble/sign the exact staging APK only after deliberate authorization.
3. Before upload, prerelease, installation or human handoff, run
   `extract-next-candidate-apk-identity.mjs`.
4. Bind the exact SHA-256 with `register-staging-android-sha256.mjs`.
5. Bind the exact SHA-1 in the restricted staging Firebase API key with
   `register-next-candidate-staging-native-key.mjs`.
6. Both mutating binding scripts must run only from the exact authorized source branch,
   with the exact Git source SHA, exact APK SHA-256 produced by the extraction step,
   and their explicit binding ACK.
7. Read back App Check with `TUTOP_EXPECTED_ANDROID_CERT_SHA256` set to the
   extracted exact SHA-256.
8. Run `next-candidate-external-preapk-gate.mjs` from the same exact source branch
   with the same Git source SHA and APK SHA-256 provenance. The gate must fail closed
   if source/artifact provenance is missing or malformed, even when the certificate
   itself is already registered.
9. Only after all exact bindings and the provenance-bound external gate are green may
   the APK be packaged/uploaded for physical QA.

The source/config phase may prepare and test these contracts, but must not fabricate
a certificate, APK hash or future candidate identity. A source-only `CONTINUA`
does not authorize candidate assembly by inertia.

Never commit a signing private key or debug keystore to the repository. A future
release/Play signing strategy remains a separate release gate.

Build120 fingerprints remain historical evidence only and cannot authorize a
successor artifact.

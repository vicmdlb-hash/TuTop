# Next TuTop candidate — exact signing/App Check binding

Status: **PREPARED / NO APK BUILT**

The next candidate must not depend on a hypothetical certificate before assembly.
The correct private-QA sequence is:

1. All source/config/Rules gates pass.
2. Assemble/sign the exact staging APK.
3. Before upload, prerelease, installation or human handoff, run
   `extract-next-candidate-apk-identity.mjs`.
4. Register the exact SHA-256 with the staging Firebase Android app using
   `register-staging-android-sha256.mjs`.
5. Register the exact SHA-1 in the restricted staging Firebase API key using
   `register-next-candidate-staging-native-key.mjs`.
6. Read back App Check with `TUTOP_EXPECTED_ANDROID_CERT_SHA256` set to the
   extracted exact SHA-256.
7. Run the external pre-promotion gate.
8. Only after all exact bindings are green may the APK be packaged/uploaded for
   physical QA.

Never commit a signing private key or debug keystore to the repository. A future
release/Play signing strategy remains a separate release gate.

Build120 fingerprints remain historical evidence only and cannot authorize a
successor artifact.

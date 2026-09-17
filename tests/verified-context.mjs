// Fixture identities for the post106 Rules contract. Verification is a signed
// Auth claim, never a users document field. Tests for missing/false claims use
// env.authenticatedContext directly in firestore.verified-email.test.mjs.
export function verifiedContext(env, uid, claims = {}) {
  return env.authenticatedContext(uid, { email: uid + '@example.test', email_verified: true, ...claims });
}

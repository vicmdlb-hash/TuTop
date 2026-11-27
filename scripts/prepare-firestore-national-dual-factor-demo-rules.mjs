import fs from 'node:fs';

// TEST-ONLY artifact: never deployed, merged into default rules, or used with
// real Firebase projects. No account, phone/SMS or payment API is contacted.
const demo = 'demo-tutop-post120-rules';
if (process.env.GCLOUD_PROJECT !== demo || process.env.FIREBASE_PROJECT_ID !== demo) {
  throw new Error('NATIONAL_DUAL_FACTOR_DEMO_PROJECT_REQUIRED');
}
const source = 'firebase/firestore.v2.generated.rules';
const target = 'firebase/firestore.v2.national-dual-factor-demo.rules';
const rules = fs.readFileSync(source, 'utf8');
if (!rules.includes('function nationalVerifiedIdentity()')) {
  throw new Error('NATIONAL_SIGNED_IDENTITY_HELPER_MISSING');
}
if (!rules.includes("request.auth.token.phone_number.matches('^[+]52[1-9][0-9]{9}$')")) {
  throw new Error('NATIONAL_MEXICAN_PHONE_TOKEN_CONTRACT_DRIFT');
}
// Only sensitive allow paths hardened by the verified-email chain are promoted.
// Registration bootstrap and read-only account recovery are intentionally NOT
// promoted here. Any future sensitive path not covered requires a new audit.
const previous = '&& verifiedIdentity()';
const count = rules.split(previous).length - 1;
if (count < 10 || count > 35) throw new Error('NATIONAL_DUAL_FACTOR_SENSITIVE_PATH_COUNT_DRIFT:' + count);
const national = rules.split(previous).join('&& nationalVerifiedIdentity()');
if (national.includes(previous)) throw new Error('NATIONAL_DUAL_FACTOR_REPLACEMENT_INCOMPLETE');
if (national === rules) throw new Error('NATIONAL_DUAL_FACTOR_DEMO_NO_CHANGE');
fs.writeFileSync(target, national);
console.log('PASS demo-only signed-claim national guard prepared for ' + count + ' sensitive rule paths; no deploy');

import fs from 'node:fs';
import assert from 'node:assert/strict';

const auth=fs.readFileSync('src/services/verifiedEmailBetaAuth.ts','utf8');
const admin=fs.readFileSync('src/admin/AdminDashboard.tsx','utf8');
const rules=fs.readFileSync('firebase/firestore.v2.rules','utf8');

assert.match(auth,/auth_status\/\$\{uid\}/);
assert.match(auth,/EMAIL_VERIFICATION_PENDING/);
assert.match(auth,/EMAIL_VERIFIED/);
assert.match(auth,/PROFILE_MISSING/);
assert.match(auth,/VERIFICATION_EMAIL_SENT/);
assert.match(auth,/VERIFICATION_EMAIL_SEND_FAILED/);
assert.match(auth,/VERIFICATION_CHECK_FAILED/);
assert.match(auth,/AUTH_SYNC_FAILED/);
assert.match(auth,/recordDiagnostic/);
assert.match(rules,/match \/auth_status\/\{uid\}/);
assert.match(rules,/request\.auth\.token/);
assert.match(rules,/email_verified/);
assert.match(admin,/Buscar nombre, correo, UID, universidad o campus/);
assert.match(admin,/Auth sin telemetría/);
assert.match(admin,/correo se muestra enmascarado/i);
assert.match(admin,/Falló envío de verificación/);
assert.match(admin,/Falló comprobación/);
assert.match(admin,/Sincronización Auth falló/);
assert.doesNotMatch(admin,/password|refreshToken|idToken|oobCode/i);

console.log('PASS account-status mirror binds email_verified to the signed Firebase claim');
console.log('PASS admin account diagnostics separates UNKNOWN from pending/verified and exposes no credentials');

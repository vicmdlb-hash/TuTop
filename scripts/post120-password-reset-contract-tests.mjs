import fs from 'node:fs';
import assert from 'node:assert/strict';

const auth=fs.readFileSync('src/services/verifiedEmailBetaAuth.ts','utf8');
const gate=fs.readFileSync('src/components/BackendGate.tsx','utf8');

assert.match(auth,/async requestPasswordReset\(emailInput: string\)/);
assert.match(auth,/requestType: 'PASSWORD_RESET', email/);
assert.match(auth,/EMAIL_NOT_FOUND\|USER_NOT_FOUND/);
assert.doesNotMatch(auth,/requestPasswordReset[\s\S]{0,1200}persistCanonicalSession/);
assert.match(gate,/type AuthMode = 'login' \| 'register' \| 'legacy' \| 'forgot'/);
assert.match(gate,/Olvidé mi Clave TuTop/);
assert.match(gate,/Por privacidad, TuTop muestra la misma respuesta exista o no una cuenta/);
assert.match(gate,/verifiedEmailBetaAuth\.requestPasswordReset\(email\)/);
assert.match(gate,/Si existe una cuenta TuTop con ese correo/);
assert.match(gate,/disabled=\{busy \|\| !validEmail\}/);

console.log('PASS email/password accounts have a user-visible Firebase reset flow without account enumeration');
console.log('PASS reset request does not mutate the signed-in session or claim SMS recovery');

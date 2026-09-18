import assert from 'node:assert/strict';
import fs from 'node:fs';

const gate = fs.readFileSync('src/components/BackendGate.tsx','utf8');
const icon = fs.readFileSync('assets/branding/tutop-app-icon.svg','utf8');
const splash = fs.readFileSync('assets/branding/tutop-splash-092.svg','utf8');
const topi = fs.readFileSync('src/components/TopiMascot.tsx','utf8');
const tx = fs.readFileSync('src/services/canonicalTransactionsBackend.ts','utf8');
const notif = fs.readFileSync('src/services/nativeNotificationRouter.ts','utf8');
const privacy = fs.readFileSync('public/privacy.html','utf8');
const controls = fs.readFileSync('src/components/NationalAccountControls.tsx','utf8');

assert.match(gate, /grid grid-cols-2 rounded-xl/);
assert.doesNotMatch(gate, />Cuenta anterior<\/button><\/div>/);
assert.match(gate, /¿Usabas TuTop antes\? Recuperar cuenta anterior/);
assert.match(gate, /Descubre, conecta y encuentra cerca de ti/);
assert.doesNotMatch(gate, /<div className="brand-mark"><span>T<\/span><i \/><\/div>/);

assert.match(icon, /data-brand="tutop-reference-icon"/);
assert.match(icon, /data:image\/webp;base64/);
assert.match(splash, /data-brand="tutop-reference-splash"/);
assert.match(splash, /Descubre, conecta y encuentra cerca de ti/);
assert.match(topi, /TOPI_REFERENCE/);
assert.match(topi, /data:image\/webp;base64/);

for (const method of ['scheduleMeetup','disputeTransaction','cancelTransaction','releaseExpiredReservation']) {
  const start = tx.indexOf(`  async ${method}`);
  assert.ok(start >= 0, `${method} missing`);
  const next = tx.indexOf('\n  async ', start + 10);
  const section = tx.slice(start, next > start ? next : tx.length);
  assert.match(section, /loadCurrentTransaction\(client, transaction\)/, `${method} must use canonical server state`);
}
assert.match(notif, /route\(intent, false\)/);
assert.match(notif, /function route\(intent: NativeNotificationIntent, markRead = true\)/);
assert.match(notif, /if \(markRead && intent\.notification_id\) state\.markNotificationRead/);
assert.match(privacy, /Firebase Cloud Messaging/);
assert.match(controls, /href="\/privacy\.html"/);
assert.match(controls, /href="\/delete-account\.html"/);

console.log('PASS user-reported auth/branding regressions are removed from primary flow');
console.log('PASS approved reference is bound to launcher/splash/Topi source');
console.log('PASS post110 transaction, notification and privacy repairs are integrated');

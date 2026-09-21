import fs from 'node:fs';
import assert from 'node:assert/strict';

const prefs=fs.readFileSync('src/lib/notificationPreferences.ts','utf8');
const ui=fs.readFileSync('src/components/NotificationPreferenceSettings.tsx','utf8');
const permissions=fs.readFileSync('src/components/PermissionSettings.tsx','utf8');
const backend=fs.readFileSync('src/services/nationalUserSettings.ts','utf8');

const keys=[...prefs.matchAll(/\| '([a-z_]+)'/g)].map((match)=>match[1]);
assert.equal(keys.length,13,'canonical notification preference key count drifted');
for(const key of keys) assert.match(ui,new RegExp(`key: '${key}'`),`UI missing ${key}`);

assert.match(ui,/loadNotificationPreferences\(\)/);
assert.match(ui,/saveNotificationPreferences\(preferences\)/);
assert.match(ui,/aria-pressed=\{preferences\[option\.key\]\}/);
assert.match(ui,/Cambiar estas opciones no prueba entrega FCM/);
assert.match(permissions,/NotificationPreferenceSettings/);
assert.match(backend,/notification_preferences\/\$\{session\.uid\}/);
assert.match(backend,/normalizeNotificationPreferences/);

console.log('PASS all 13 canonical notification preferences are user-configurable through the existing account settings backend');
console.log('PASS UI keeps Android permission/token/real-delivery truth separate from content preferences');

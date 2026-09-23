import fs from 'node:fs';
import assert from 'node:assert/strict';

const center=fs.readFileSync('src/components/NotificationCenter.tsx','utf8');
const prefs=fs.readFileSync('src/components/NotificationPreferenceSettings.tsx','utf8');
const saved=fs.readFileSync('src/components/SavedSearchManager.tsx','utf8');
const seller=fs.readFileSync('src/components/SellerPublicProfile.tsx','utf8');
const health=fs.readFileSync('src/components/DeviceHealthPanel.tsx','utf8');

assert.match(center,/aria-label="Volver"/);
assert.match(center,/<ArrowLeft aria-hidden="true"/);
assert.match(center,/notification-icon" aria-hidden="true"/);
assert.match(center,/bg-violet-400" aria-hidden="true"/);

assert.match(prefs,/role="switch"/);
assert.match(prefs,/aria-checked=\{preferences\[option\.key\]\}/);
assert.doesNotMatch(prefs,/aria-pressed=\{preferences\[option\.key\]\}/);
assert.match(prefs,/role="status" aria-live="polite" aria-atomic="true"/);

assert.match(saved,/role="status" aria-live="polite" aria-atomic="true"/);
assert.match(saved,/aria-label=\{search\.notifications_enabled \?/);

assert.match(seller,/aria-pressed=\{followed\}/);
assert.match(seller,/role="status" aria-live="polite" aria-atomic="true"/);

assert.match(health,/role="region" aria-label="Diagnóstico de esta instalación"/);
assert.match(health,/role="status" aria-live="polite" aria-atomic="true"/);

console.log('PASS post-Build120 accessibility: names, switch state, decorative icon hiding and live status updates');

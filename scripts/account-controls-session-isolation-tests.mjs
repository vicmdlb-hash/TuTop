import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isCurrentBackendHydration } from '../src/lib/backendHydrationIdentity.ts';

// Synthetic identity combinations: never substitute UID-only checks for
// Firebase session generation, especially on logout -> login of the same UID.
const alice = 'synthetic-alice', bob = 'synthetic-bob';
assert.equal(isCurrentBackendHydration(alice, alice, alice, 4, 4), true);
for (const [storeUid, sessionUid, startEpoch, currentEpoch] of [
  [bob, alice, 4, 4], [bob, bob, 4, 4],
  [alice, bob, 4, 4], [alice, null, 4, 4],
  [alice, alice, 4, 5],
]) {
  assert.equal(isCurrentBackendHydration(alice, storeUid, sessionUid, startEpoch, currentEpoch), false);
}

const ui = fs.readFileSync('src/components/NationalAccountControls.tsx', 'utf8');
const locate = (source, needle) => {
  const at = source.indexOf(needle);
  assert(at >= 0, 'account panel missing owner guard: ' + needle);
  return at;
};
locate(ui, 'const ownerUid = useAppStore((state) => state.user.id);');
locate(ui, '<AccountControlsForOwner key={ownerUid} ownerUid={ownerUid} />');
locate(ui, 'const ownerEpoch = useRef(verifiedEmailBetaAuth.sessionGeneration());');
locate(ui, 'const stillCurrent = () => isCurrentBackendHydration(');
locate(ui, 'useAppStore.getState().user.id');
locate(ui, 'verifiedEmailBetaAuth.readSessionIdentity()?.uid');
locate(ui, 'ownerEpoch.current');
locate(ui, 'verifiedEmailBetaAuth.sessionGeneration(),');
locate(ui, 'if (!active || !stillCurrent() || (request && request.uid !== ownerUid)) return;');

const startOf = (name) => locate(ui, '  const ' + name + ' = async ');
const sections = [
  ['toggle', 'toggleDevicePush'],
  ['toggleDevicePush', 'rotatePassword'],
  ['rotatePassword', 'requestDeletion'],
  ['requestDeletion', 'renderToggle'],
];
for (const [startName, nextName] of sections) {
  const start = startOf(startName);
  const end = nextName === 'renderToggle' ? locate(ui, '  const renderToggle') : startOf(nextName);
  const body = ui.slice(start, end);
  assert.match(body, /if \(!stillCurrent\(\)/, startName + ' must reject stale user actions');
  assert.match(body, /if \(stillCurrent\(\)\)|if \(!stillCurrent\(\)\) return;/,
    startName + ' must guard late async responses');
}
const deletion = ui.slice(startOf('requestDeletion'), locate(ui, '  const renderToggle'));
assert.match(deletion, /if \(!stillCurrent\(\) \|\| request\.uid !== ownerUid\) return;/,
  'a deletion status must not show the former account identity');
const password = ui.slice(startOf('rotatePassword'), startOf('requestDeletion'));
assert.match(password, /await nationalUserSettings\.changePassword\(nextPassword\);\s*if \(!stillCurrent\(\)\) return;/,
  'do not show a stale password-change result or retain the former input');
// The permission granted by Android does not imply token registration or FCM delivery.
// Deleting a token must never fabricate an OS permission downgrade to "prompt".
const push = ui.slice(startOf('toggleDevicePush'), startOf('rotatePassword'));
assert.match(push, /toggleDevicePush = async \(action: 'register' \| 'remove'\)/);
assert.match(push, /if \(action === 'remove'\)/);
assert.match(push, /const disabled = await disableNativePushNotifications\(\);/);
assert.match(push, /const permission = await nativePushPermission\(\);/);
assert.doesNotMatch(push, /disabled \? 'prompt' :/);
assert.match(push, /Token push registrado para esta sesión\. La entrega real sigue pendiente/);
assert.match(push, /esto no demuestra una baja permanente del servidor/);
assert.match(ui, /toggleDevicePush\('register'\)/);
assert.match(ui, /toggleDevicePush\('remove'\)/);
assert.match(ui, /Permiso Android concedido; token y entrega aún no comprobados aquí/);
assert.match(ui, /Permiso Android, token FCM registrado y entrega real son estados diferentes/);
assert.doesNotMatch(ui, /Activadas en este teléfono|Notificaciones del dispositivo activadas/);
console.log('PASS push OS-permission truth: explicit register/remove actions, no fabricated permission revocation or delivery success');

console.log('PASS account controls synthetic A->B/A->B->A isolation; owned async UI callbacks fail closed (not device E2E)');

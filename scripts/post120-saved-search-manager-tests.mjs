import fs from 'node:fs';
import assert from 'node:assert/strict';

const backend=fs.readFileSync('src/services/nationalBackend.ts','utf8');
const manager=fs.readFileSync('src/components/SavedSearchManager.tsx','utf8');
const prefs=fs.readFileSync('src/components/NotificationPreferenceSettings.tsx','utf8');
const rules=fs.readFileSync('firebase/firestore.v2.rules','utf8');

assert.match(backend,/async listSavedSearches\(limit = 30\)/);
assert.match(backend,/owner_uid', op: 'EQUAL', value: ownerUid/);
assert.match(backend,/async setSavedSearchNotifications\(searchId: string, enabled: boolean\)/);
assert.match(backend,/current\.data\.owner_uid !== ownerUid/);
assert.match(backend,/notifications_enabled: Boolean\(enabled\)/);
assert.match(backend,/async deleteSavedSearch\(searchId: string\)/);
assert.match(backend,/deleteDocument\(`saved_searches\/\$\{cleanId\}`\)/);

assert.match(manager,/nationalBackend\.listSavedSearches\(30\)/);
assert.match(manager,/nationalBackend\.setSavedSearchNotifications\(search\.id, !search\.notifications_enabled\)/);
assert.match(manager,/nationalBackend\.deleteSavedSearch\(searchId\)/);
assert.match(manager,/confirmDeleteId !== searchId/);
assert.match(manager,/aria-pressed=\{search\.notifications_enabled\}/);
assert.match(manager,/no deben proyectar avisos/);
assert.match(manager,/no prueban que un worker ni FCM hayan entregado/);
assert.match(prefs,/SavedSearchManager accountPreferenceEnabled=\{preferences\.saved_search_match\}/);

assert.match(rules,/match \/saved_searches\/\{searchId\}/);
assert.match(rules,/allow update:[\s\S]*resource\.data\.owner_uid == request\.auth\.uid/);
assert.match(rules,/allow delete: if signedIn\(\) && resource\.data\.owner_uid == request\.auth\.uid/);

console.log('PASS users can list, pause/resume and delete only their own saved searches');
console.log('PASS per-search controls remain subordinate to account-level saved_search_match preference');
console.log('PASS UI keeps configuration separate from worker/FCM delivery proof');

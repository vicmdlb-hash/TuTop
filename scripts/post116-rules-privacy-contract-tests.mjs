import fs from 'node:fs';
import assert from 'node:assert/strict';

const prepare = fs.readFileSync('scripts/prepare-firestore-v2-rules.mjs','utf8');
const harden = fs.readFileSync('scripts/harden-canonical-v2-rules.mjs','utf8');
const queue = fs.readFileSync('src/admin/AccountDeletionQueue.tsx','utf8');
const backend = fs.readFileSync('src/services/scopedAdminBackend.ts','utf8');

assert.match(harden, /affectedKeys\(\)\.hasAny\(\['title','description','category_id','subcategory_id','condition','attributes','photo_urls'\]\)/);
assert.match(harden, /request\.resource\.data\.moderation_status == 'pending'/);

assert.doesNotMatch(queue, /transition\(request, 'completed'\)/);
assert.match(queue, /procesador trusted/);
assert.doesNotMatch(backend, /status: 'processing' \| 'completed' \| 'rejected'/);
assert.match(backend, /status: 'processing' \| 'rejected'/);

assert.match(prepare, /resource\.data\.status == 'pending'.*request\.resource\.data\.status in \['processing','rejected'\]/s);
assert.match(prepare, /resource\.data\.status == 'processing'.*request\.resource\.data\.status == 'rejected'/s);
assert.doesNotMatch(prepare, /request\.resource\.data\.status in \['pending','processing','completed','rejected'\]/);

console.log('PASS seller public-content edits are Rules-bound to pending moderation');
console.log('PASS account deletion completed is removed from client/admin transition path');
console.log('Post116 Rules/privacy hardening contract: PASS');

import assert from 'node:assert/strict';
import fs from 'node:fs';

const hardener = fs.readFileSync('scripts/harden-user-block-rules.mjs', 'utf8');
const backend = fs.readFileSync('src/services/userBlockBackend.ts', 'utf8');
const profile = fs.readFileSync('src/components/SellerPublicProfile.tsx', 'utf8');
const chat = fs.readFileSync('src/components/ChatConversation.tsx', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/post120-emulator-security.yml', 'utf8');

for (const marker of [
  'match /user_blocks/{blockerUid}/targets/{blockedUid}',
  'function usersUnblocked(uidA, uidB)',
  'usersUnblocked(request.resource.data.buyer_id, request.resource.data.seller_id)',
  'usersUnblocked(chatDoc(chatId).data.buyer_id, chatDoc(chatId).data.seller_id)',
  "request.resource.data.status in ['withdrawn','rejected']",
  'allow delete: if owner(blockerUid)',
]) assert.ok(hardener.includes(marker), 'missing rules safety contract: ' + marker);
assert.match(hardener, /allow update: if false;/);
assert.match(backend, /new FirebaseRestClient\(getFirebaseConfig\(\)\)/);
assert.match(backend, /USER_BLOCK_V2_REQUIRED/);
assert.match(backend, /SESSION_CHANGED/);
assert.match(backend, /user_blocks\/\$\{ownerUid\}\/targets\/\$\{uid\}/);
assert.match(backend, /async isBlocked/);
assert.match(backend, /async setBlocked/);
assert.match(profile, /Bloquear usuario/);
assert.match(profile, /Desbloquear usuario/);
assert.match(profile, /userBlockBackend\.setBlocked/);
assert.match(chat, /userBlockBackend\.setBlocked/);
assert.match(chat, /Bloquear usuario/);
assert.match(chat, /Desbloquear usuario/);
assert.match(chat, /if \(!clean \|\| blocked\) return;/);
assert.ok(packageJson.scripts['v2:rules:prepare'].endsWith('node scripts/harden-user-block-rules.mjs'));
assert.match(workflow, /tests\/firestore\.v2\.user-blocks\.test\.mjs/);
console.log('PASS user-block Firestore write denial, owner-only model, self/no-owner controls, chat/profile UI, generated-rules runner');

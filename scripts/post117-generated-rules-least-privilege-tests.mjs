import assert from 'node:assert/strict';
import fs from 'node:fs';

const rules = fs.readFileSync('firebase/firestore.v2.generated.rules','utf8');

function count(needle) { return rules.split(needle).length - 1; }

assert.equal(count('match /favorites/{favoriteId}'), 1, 'favorites rule must be unique');
assert.equal(count('match /saved_searches/{searchId}'), 1, 'saved_searches rule must be unique');
assert.equal(count('match /wallets/{uid}'), 1, 'wallet rule must be unique');
assert.equal(count('match /user_private/{uid}'), 1, 'user_private rule must be unique');
assert.equal(count('match /admins/{uid}'), 1, 'admins rule must be unique');

assert.match(rules, /match \/user_private\/\{uid\}[\s\S]*?allow read: if owner\(uid\) \|\| canReadIdentityPrivate\(\);/);
assert.match(rules, /match \/wallets\/\{uid\}[\s\S]*?allow read: if owner\(uid\) \|\| canReadWalletPrivate\(\);/);
assert.match(rules, /match \/wallet_transactions\/\{transactionId\}[\s\S]*?canReadWalletPrivate\(\)/);
assert.match(rules, /match \/favorites\/\{favoriteId\}[\s\S]*?allow read: if signedIn\(\) && resource\.data\.uid == request\.auth\.uid;/);
assert.match(rules, /match \/saved_searches\/\{searchId\}[\s\S]*?allow read: if signedIn\(\) && resource\.data\.owner_uid == request\.auth\.uid;/);
assert.match(rules, /match \/chats\/\{chatId\}[\s\S]*?canReadCommercePrivate\(\)/);
assert.match(rules, /match \/admins\/\{uid\} \{ allow read: if owner\(uid\) \|\| adminHasRole\('super_admin'\); allow write: if false; \}/);

assert.doesNotMatch(rules, /match \/user_private\/\{uid\}[\s\S]{0,500}?allow read: if owner\(uid\) \|\| isAdmin\(\);/);
assert.doesNotMatch(rules, /match \/wallets\/\{uid\}[\s\S]{0,500}?allow read: if owner\(uid\) \|\| isAdmin\(\);/);
assert.doesNotMatch(rules, /match \/favorites\/\{favoriteId\}[\s\S]{0,400}?\|\| isAdmin\(\)/);
assert.doesNotMatch(rules, /match \/saved_searches\/\{searchId\}[\s\S]{0,400}?\|\| isAdmin\(\)/);

console.log('PASS generated Rules retain explicit least-privilege private-read scopes immediately before emulator');

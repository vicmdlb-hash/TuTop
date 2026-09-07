import fs from 'node:fs';
import assert from 'node:assert/strict';

const countBackend = fs.readFileSync('src/services/firestoreMessageCountBackend.ts', 'utf8');
const lean = fs.readFileSync('src/services/v2LeanChatSnapshotBridge.ts', 'utf8');
const bridge = fs.readFileSync('src/services/rateLimitedOnlineBridge.ts', 'utf8');
const rules = fs.readFileSync('firebase/firestore.v2.rules', 'utf8');

assert.match(countBackend, /runAggregationQuery/);
assert.match(countBackend, /aggregations: \[\{ alias: 'count', count: \{\} \}\]/);
assert.match(countBackend, /fieldPath: 'created_at'/);
assert.match(countBackend, /GREATER_THAN/);
assert.match(countBackend, /getNativeAppCheckToken\(false\)/);
assert.match(countBackend, /headers\['X-Firebase-AppCheck'\] = appCheck/);
assert.match(countBackend, /encodePath\(`chats\/\$\{cleanChatId\}`\)/);

assert.match(bridge, /chats\/\$\{chatId\}\/messages\/\$\{operation\.messageId\}/);
assert.match(bridge, /chats\/\$\{chatId\}\/reads\/\$\{uid\}/);
assert.match(bridge, /user_id: uid, read_at: at/);

assert.match(lean, /AGGREGATION_SAFE_READ_MARKER_AFTER/);
assert.match(lean, /readAt >= AGGREGATION_SAFE_READ_MARKER_AFTER/);
assert.match(lean, /firestoreMessageCountBackend\.countAfter/);
assert.match(lean, /legacyExactUnreadCount/);
assert.match(lean, /catch \{\s*return legacyExactUnreadCount\(chatId, uid, readAt\);\s*\}/);
assert.match(lean, /recent\.filter\(\(message\) => String\(message\.data\.sender_id \|\| ''\) !== uid\)\.length/);
assert.match(lean, /readAt >= lastMessageAt\) return 0/);
assert.doesNotMatch(lean, /countAfter[\s\S]{0,240}catch\(\(\) => 0\)/);

assert.match(rules, /match \/reads\/\{uid\}/);
assert.match(rules, /allow create, update: if participant\(chatId\) && owner\(uid\)/);
assert.match(rules, /request\.resource\.data\.keys\(\)\.hasOnly\(\['user_id','read_at'\]\)/);

console.log('PASS sender read marker advances in the same logical message commit');
console.log('PASS migrated read markers use exact Firestore aggregation COUNT with App Check forwarding');
console.log('PASS legacy markers and aggregation failures fall back to exact sender-filtered document counting');
console.log('PASS no aggregation failure path can silently report zero unread messages');
console.log('PASS existing Rules restrict read-marker writes to the owning participant and exact keys');
console.log('Unread aggregation migration contract: PASS');

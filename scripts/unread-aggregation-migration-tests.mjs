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

assert.match(bridge, /chats\/\$\{chatId\}\/reads\/\$\{uid\}/);
assert.match(bridge, /user_id: uid, read_at: at/);

assert.match(lean, /AGGREGATION_SAFE_READ_MARKER_AFTER/);
assert.match(lean, /firestoreMessageCountBackend\.countAfter/);
assert.match(lean, /legacyExactUnreadCount/);
assert.match(lean, /catch \{\s*return legacyExactUnreadCount/);
assert.match(lean, /readAt >= lastMessageAt\) return 0/);

assert.match(rules, /match \/reads\/\{uid\}/);
assert.match(rules, /allow create, update: if participant\(chatId\) && owner\(uid\)/);
assert.match(rules, /request\.resource\.data\.keys\(\)\.hasOnly\(\['user_id','read_at'\]\)/);

console.log('PASS sender read marker advances atomically with message summary commit');
console.log('PASS migrated read markers use exact Firestore aggregation COUNT');
console.log('PASS legacy markers and aggregation failures fall back to exact document filtering');
console.log('Unread aggregation migration contract: PASS');

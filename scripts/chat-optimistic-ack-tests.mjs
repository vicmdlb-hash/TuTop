import assert from 'node:assert/strict';
import fs from 'node:fs';
import { acknowledgeOptimisticChatMessage as ack } from '../src/lib/chatOptimisticReconciliation.ts';

const msg = (id, texto) => ({ id, sender_id: 'A', emisor: 'comprador', texto,
  hora: '2026-11-04T19:00:00.000Z', leido: true });
const first = msg('msg-local-a', 'Hola');
const second = msg('msg-local-b', 'Hola');
const third = msg('msg-other', 'Unrelated');
const initial = [first, second, third];
const acceptedA = ack(initial, first.id, 'msg-server-a');
assert.equal(acceptedA.length, 3);
assert.deepEqual(acceptedA.map(x => x.id), ['msg-server-a', 'msg-local-b', 'msg-other']);
assert.equal(initial[0].id, 'msg-local-a', 'must not mutate the original messages');
assert.notEqual(acceptedA[0], initial[0], 'ack uses a defensive replacement');
const acceptedB = ack(acceptedA, second.id, 'msg-server-b');
assert.deepEqual(acceptedB.map(x => x.id), ['msg-server-a', 'msg-server-b', 'msg-other']);
assert.equal(acceptedB[0].texto, acceptedB[1].texto,
  'legitimate identical text must be retained if canonical IDs differ');
const fetchedCanonical = [msg('msg-server-a', 'Authoritative server text'), first, third];
assert.deepEqual(ack(fetchedCanonical, first.id, 'msg-server-a').map(x => x.id),
  ['msg-server-a', 'msg-other'], 'already fetched canonical message wins');
assert.equal(ack(fetchedCanonical, first.id, 'msg-server-a')[0].texto,
  'Authoritative server text');
const duplicateTap = ack([first, second], first.id, 'msg-shared');
assert.deepEqual(ack(duplicateTap, second.id, 'msg-shared').map(x => x.id),
  ['msg-shared'], 'idempotent double-taps must not remain duplicated');
assert.deepEqual(ack([msg('msg-B', 'B only')], first.id, 'msg-A').map(x => x.id),
  ['msg-B'], 'late acknowledgement must not insert A into B state');
assert.strictEqual(ack(initial, first.id, ''), initial, 'no unknown server ID may acknowledge');
assert.strictEqual(ack(initial, first.id, 'msg-local-invalid'), initial);
assert.strictEqual(ack(initial, '', 'msg-server-a'), initial);

// Wire checks: both image/text paths and both backends must acknowledge with
// the exact Firestore document ID, not match by text or time.
const bridge = fs.readFileSync('src/services/v2StoreChatMutationBridge.ts', 'utf8');
const limited = fs.readFileSync('src/services/rateLimitedOnlineBridge.ts', 'utf8');
const base = fs.readFileSync('src/services/onlineBackend.ts', 'utf8');
assert.equal((bridge.match(/acknowledgeOptimisticChatMessage\(item\.mensajes, message\.id, serverId\)/g) || []).length, 2);
assert.match(limited, /Map<string, Promise<string>>/);
assert.equal((limited.match(/return operation\.messageId;/g) || []).length, 2);
assert.match(base, /await client\.commit\([\s\S]*?return messageId;/);
console.log('PASS canonical message ack replaces only the exact optimistic ID');
console.log('PASS duplicate-tap IDs dedupe without deleting legitimate repeated text');
console.log('PASS concurrent messages, fetched canonical authority and user-switch guard');
console.log('PASS both text/image senders receive authoritative document ID');

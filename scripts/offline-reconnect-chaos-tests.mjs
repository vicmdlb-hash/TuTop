import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

if (process.env.TUTOP_NODE_TS_STRIP !== '1') {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', fileURLToPath(import.meta.url)], {
    stdio: 'inherit',
    env: { ...process.env, TUTOP_NODE_TS_STRIP: '1', NODE_NO_WARNINGS: '1' },
  });
  process.exit(result.status ?? 1);
}

const offline = await import(`${pathToFileURL(path.resolve('src/lib/offlineQueue.ts')).href}?t=${Date.now()}`);
const t0 = new Date('2026-09-06T22:00:00.000Z');
const action = (id, type, entity, payload = {}) => ({ id, type, entity_id: entity, payload });

let queue = [];
queue = offline.enqueueOfflineAction(queue, action('1', 'favorite_add', 'listing-a', { listing_id: 'listing-a' }), t0);
queue = offline.enqueueOfflineAction(queue, action('2', 'favorite_remove', 'listing-a', { listing_id: 'listing-a' }), new Date(t0.getTime() + 100));
queue = offline.enqueueOfflineAction(queue, action('3', 'favorite_add', 'listing-a', { listing_id: 'listing-a' }), new Date(t0.getTime() + 200));
assert.equal(queue.length, 1);
assert.equal(queue[0].type, 'favorite_add');
assert.equal(queue[0].id, '3');

queue = offline.enqueueOfflineAction(queue, action('4', 'saved_search_save', 'search-a', { query: 'calculadora' }), t0);
queue = offline.enqueueOfflineAction(queue, action('5', 'saved_search_save', 'search-a', { query: 'calculadora cientifica' }), new Date(t0.getTime() + 300));
assert.equal(queue.filter((item) => item.type === 'saved_search_save').length, 1);
assert.equal(queue.find((item) => item.type === 'saved_search_save')?.id, '5');

let failed = queue[0];
for (let i = 0; i < offline.OFFLINE_QUEUE_LIMITS.max_attempts; i += 1) {
  failed = offline.markOfflineActionFailed(failed, new Date(t0.getTime() + i * 60_000));
}
const summary = offline.summarizeOfflineQueue([failed], new Date(t0.getTime() + 24 * 60 * 60_000));
assert.equal(summary.exhausted, 1);
assert.equal(summary.due, 0);
assert.equal(summary.duplicate_keys, 0);

const hundred = Array.from({ length: 140 }, (_, index) => action(`q${index}`, 'listing_draft_save', `draft-${index}`, { title: `draft ${index}` }));
queue = [];
for (const item of hundred) queue = offline.enqueueOfflineAction(queue, item, t0);
assert.equal(queue.length, offline.OFFLINE_QUEUE_LIMITS.max_items);
assert.equal(queue[0].entity_id, 'draft-40');
assert.equal(queue.at(-1)?.entity_id, 'draft-139');

assert.throws(() => offline.enqueueOfflineAction([], action('secret', 'listing_draft_save', 'd', { nested: { password: 'x' } }), t0), /SENSITIVE_DATA/);
assert.throws(() => offline.enqueueOfflineAction([], action('chat', 'listing_draft_save', 'd', { chat: { text: 'hola' } }), t0), /SENSITIVE_DATA/);

console.log('PASS reconnect compacts mutually exclusive favorite intents to the final state');
console.log('PASS same logical mutation is idempotently superseded');
console.log('PASS exhausted retries are detectable and are not replayed forever');
console.log('PASS queue capacity is bounded under offline bursts');
console.log('PASS offline queue still rejects auth/chat sensitive payloads');
console.log('Offline/reconnect chaos contract: PASS');

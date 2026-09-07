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
const t0 = new Date('2026-09-07T04:00:00.000Z');
const action = (id, type, entity, payload = {}) => ({ id, type, entity_id: entity, payload });

const initial = offline.enqueueOfflineAction([], action('retry-1', 'saved_search_save', 'search-retry', { query: 'laptop' }), t0)[0];
const failedOnce = offline.markOfflineActionFailed(initial, t0);
assert.equal(offline.dueOfflineActions([failedOnce], new Date(t0.getTime() + 3_999)).length, 0);
assert.equal(offline.dueOfflineActions([failedOnce], new Date(t0.getTime() + 4_000)).length, 1);

const superseded = offline.enqueueOfflineAction([failedOnce], action('retry-2', 'saved_search_save', 'search-retry', { query: 'laptop gamer' }), new Date(t0.getTime() + 5_000));
assert.equal(superseded.length, 1);
assert.equal(superseded[0].id, 'retry-2');
assert.equal(superseded[0].attempts, 0);
assert.equal(offline.dueOfflineActions(superseded, new Date(t0.getTime() + 5_000)).length, 1);

let storm = [];
for (let index = 0; index < 500; index += 1) {
  storm = offline.enqueueOfflineAction(
    storm,
    action(`fav-${index}`, index % 2 === 0 ? 'favorite_add' : 'favorite_remove', 'listing-storm', { listing_id: 'listing-storm' }),
    new Date(t0.getTime() + index),
  );
}
assert.equal(storm.length, 1);
assert.equal(storm[0].id, 'fav-499');
assert.equal(storm[0].type, 'favorite_remove');

let exhausted = offline.enqueueOfflineAction([], action('exhaust-1', 'listing_draft_save', 'draft-exhaust', { title: 'Draft' }), t0)[0];
for (let index = 0; index < offline.OFFLINE_QUEUE_LIMITS.max_attempts; index += 1) {
  exhausted = offline.markOfflineActionFailed(exhausted, new Date(t0.getTime() + index * 60_000));
}
assert.equal(offline.dueOfflineActions([exhausted], new Date(t0.getTime() + 24 * 60 * 60_000)).length, 0);
const recoveredIntent = offline.enqueueOfflineAction([exhausted], action('exhaust-2', 'listing_draft_save', 'draft-exhaust', { title: 'Draft actualizado' }), new Date(t0.getTime() + 25 * 60 * 60_000));
assert.equal(recoveredIntent.length, 1);
assert.equal(recoveredIntent[0].attempts, 0);
assert.equal(recoveredIntent[0].id, 'exhaust-2');

let saturated = [];
for (let index = 0; index < offline.OFFLINE_QUEUE_LIMITS.max_items + 75; index += 1) {
  saturated = offline.enqueueOfflineAction(saturated, action(`sat-${index}`, 'listing_draft_save', `draft-${index}`, { title: `draft ${index}` }), new Date(t0.getTime() + index));
}
assert.equal(saturated.length, offline.OFFLINE_QUEUE_LIMITS.max_items);
assert.equal(saturated[0].entity_id, 'draft-75');
assert.equal(saturated.at(-1)?.entity_id, `draft-${offline.OFFLINE_QUEUE_LIMITS.max_items + 74}`);
assert.equal(offline.summarizeOfflineQueue(saturated, new Date(t0.getTime() + 1_000)).duplicate_keys, 0);

console.log('PASS retry backoff does not replay early and becomes due deterministically');
console.log('PASS a newer logical intent supersedes failed/exhausted stale work and resets attempts');
console.log('PASS reconnect storms compact 500 opposite favorite intents to one final state');
console.log('PASS queue saturation retains only the newest bounded work without duplicate logical keys');
console.log('Offline/reconnect extreme contract: PASS');

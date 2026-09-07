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

const failedTwice = offline.markOfflineActionFailed(failedOnce, new Date(t0.getTime() + 4_000));
assert.equal(offline.dueOfflineActions([failedTwice], new Date(t0.getTime() + 11_999)).length, 0);
assert.equal(offline.dueOfflineActions([failedTwice], new Date(t0.getTime() + 12_000)).length, 1);
const failedThree = offline.markOfflineActionFailed(failedTwice, new Date(t0.getTime() + 12_000));
assert.equal(offline.dueOfflineActions([failedThree], new Date(t0.getTime() + 27_999)).length, 0);
assert.equal(offline.dueOfflineActions([failedThree], new Date(t0.getTime() + 28_000)).length, 1);

const superseded = offline.enqueueOfflineAction([failedThree], action('retry-2', 'saved_search_save', 'search-retry', { query: 'laptop gamer' }), new Date(t0.getTime() + 13_000));
assert.equal(superseded.length, 1);
assert.equal(superseded[0].id, 'retry-2');
assert.equal(superseded[0].attempts, 0);
assert.equal(offline.dueOfflineActions(superseded, new Date(t0.getTime() + 13_000)).length, 1);

let reconnectCycle = offline.enqueueOfflineAction([], action('cycle-1', 'listing_draft_save', 'draft-cycle', { title: 'v1' }), t0);
for (let cycle = 0; cycle < 4; cycle += 1) {
  const dueNow = offline.dueOfflineActions(reconnectCycle, new Date(Date.parse(reconnectCycle[0].next_attempt_at)));
  assert.equal(dueNow.length, 1);
  if (cycle < 3) {
    reconnectCycle = [offline.markOfflineActionFailed(dueNow[0], new Date(Date.parse(dueNow[0].next_attempt_at)))];
    const oneMsEarly = new Date(Date.parse(reconnectCycle[0].next_attempt_at) - 1);
    assert.equal(offline.dueOfflineActions(reconnectCycle, oneMsEarly).length, 0);
  } else {
    reconnectCycle = offline.removeOfflineAction(reconnectCycle, dueNow[0].id);
  }
}
assert.equal(reconnectCycle.length, 0);

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
const saturationSummary = offline.summarizeOfflineQueue(saturated, new Date(t0.getTime() + 1_000));
assert.equal(saturationSummary.duplicate_keys, 0);
assert.equal(saturationSummary.total, saturationSummary.due + saturationSummary.delayed + saturationSummary.exhausted);

const mixed = [
  offline.markOfflineActionFailed(offline.enqueueOfflineAction([], action('m1', 'saved_search_save', 'mix-1', { query: 'uno' }), t0)[0], t0),
  exhausted,
  offline.enqueueOfflineAction([], action('m3', 'listing_draft_save', 'mix-3', { title: 'tres' }), new Date(t0.getTime() + 60_000))[0],
];
const mixedSummary = offline.summarizeOfflineQueue(mixed, new Date(t0.getTime() + 5_000));
assert.equal(mixedSummary.total, mixedSummary.due + mixedSummary.delayed + mixedSummary.exhausted);
assert.equal(mixedSummary.exhausted, 1);

console.log('PASS retry backoff survives repeated offline/online cycles without early replay');
console.log('PASS a newer logical intent supersedes failed/exhausted stale work and resets attempts');
console.log('PASS reconnect storms compact 500 opposite favorite intents to one final state');
console.log('PASS queue saturation retains only the newest bounded work without duplicate logical keys');
console.log('PASS queue health accounting remains internally consistent across due/delayed/exhausted work');
console.log('Offline/reconnect extreme contract: PASS');

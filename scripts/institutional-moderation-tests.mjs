import assert from 'node:assert/strict';
import { canModerateItem, moderationQueueFor } from '../src/lib/institutionalModeration.ts';

const items = [
  { id: 'uatx-urgent', institution_id: 'uatx', status: 'open', priority: 'urgent' },
  { id: 'uatx-normal', institution_id: 'uatx', status: 'reviewing', priority: 'normal' },
  { id: 'buap-high', institution_id: 'buap', status: 'open', priority: 'high' },
  { id: 'global-unknown', status: 'open', priority: 'urgent' },
  { id: 'closed', institution_id: 'uatx', status: 'resolved', priority: 'urgent' },
];

assert.equal(canModerateItem({ kind: 'global' }, items[2]), true);
assert.equal(canModerateItem({ kind: 'institution', institution_id: 'uatx' }, items[0]), true);
assert.equal(canModerateItem({ kind: 'institution', institution_id: 'uatx' }, items[2]), false);
assert.equal(canModerateItem({ kind: 'institution', institution_id: 'uatx' }, items[3]), false);

const uatx = moderationQueueFor({ kind: 'institution', institution_id: 'uatx' }, items);
assert.deepEqual(uatx.map((item) => item.id), ['uatx-urgent', 'uatx-normal']);

const global = moderationQueueFor({ kind: 'global' }, items);
assert.deepEqual(global.map((item) => item.id), ['uatx-urgent', 'global-unknown', 'buap-high', 'uatx-normal']);

console.log('PASS institution moderators see only their institution');
console.log('PASS unscoped reports stay out of institution queues');
console.log('PASS global moderation can see all active queues');
console.log('PASS queues prioritize urgent/high reports');
console.log('Institutional moderation tests: PASS');

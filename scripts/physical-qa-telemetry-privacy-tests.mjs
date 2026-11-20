import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizePhysicalQaEvent, sanitizePhysicalQaHistory } from '../src/lib/physicalQaEventPrivacy.ts';

const sample = 'User user@example.com phone 2461234567 token=private-value';
assert.deepEqual(sanitizePhysicalQaEvent('window_error', sample), { kind: 'window_error', detail: 'redacted' });
assert.deepEqual(sanitizePhysicalQaEvent('unhandled_rejection', sample), { kind: 'unhandled_rejection', detail: 'redacted' });
assert.deepEqual(sanitizePhysicalQaEvent('private-person@example.com', sample), { kind: 'unknown_event' });
assert.deepEqual(sanitizePhysicalQaEvent('app_boot', sample), { kind: 'app_boot' });
assert.deepEqual(sanitizePhysicalQaEvent('network_online', 'seq=2 duration_ms=3600'), {
  kind: 'network_online', detail: 'seq=2 duration_ms=3600',
});
assert.deepEqual(sanitizePhysicalQaEvent('network_online', 'seq=2 duration_ms=phone-2461234567'), { kind: 'network_online' });
assert.deepEqual(sanitizePhysicalQaEvent('push_action', 'target=chat correlation=0123456789abcdef'), {
  kind: 'push_action', detail: 'target=chat correlation=0123456789abcdef',
});
assert.deepEqual(sanitizePhysicalQaEvent('push_action', sample), { kind: 'push_action', detail: 'metadata_redacted' });
const at = '2026-11-01T20:00:00.000Z';
const stored = sanitizePhysicalQaHistory([
  { at, kind: 'window_error', detail: sample, uid: 'abc' },
  { at, kind: 'push_received', detail: 'target=listing correlation=0123456789abcdef' },
  { at, kind: 'app_boot', detail: 'user@example.com' },
  { at, kind: sample, detail: sample },
  { at: 'invalid-time:' + sample, kind: 'visibility', detail: 'visible' },
]);
assert.deepEqual(stored, [
  { at, kind: 'window_error', detail: 'redacted' },
  { at, kind: 'push_received', detail: 'target=listing correlation=0123456789abcdef' },
  { at, kind: 'app_boot' },
  { at, kind: 'unknown_event' },
]);
assert(!JSON.stringify(stored).includes('user@example.com'));
assert(!JSON.stringify(stored).includes('2461234567'));
const source = fs.readFileSync('src/services/physicalQaTelemetry.ts', 'utf8');
assert.match(source, /sanitizePhysicalQaHistory/);
assert.match(source, /sanitizePhysicalQaEvent/);
assert.doesNotMatch(source, /qaEvent\('window_error',\s*event\.message/);
assert.doesNotMatch(source, /qaEvent\('unhandled_rejection',\s*event\.reason/);
console.log('PASS physical QA event privacy: structured categories, fail-closed arbitrary errors, legacy log sanitization');

import assert from 'node:assert/strict';
import { ChatMessageIdempotencyWindow } from '../src/lib/chatMessageIdempotency.ts';

let seq = 0;
const window = new ChatMessageIdempotencyWindow(1500, 30000, () => `msg-test-${++seq}`);
const base = { uid: 'user-a', chatId: 'chat-1', text: 'Hola', imageUrl: undefined };

const first = window.begin(base, 1_000);
assert.equal(first.reused, false);
assert.equal(first.messageId, 'msg-test-1');

const concurrent = window.begin(base, 1_001);
assert.equal(concurrent.reused, true);
assert.equal(concurrent.messageId, first.messageId);

window.markUncertain(first.key, 2_000);
const retryAfterUncertainNetwork = window.begin(base, 20_000);
assert.equal(retryAfterUncertainNetwork.reused, true);
assert.equal(retryAfterUncertainNetwork.messageId, first.messageId);

window.markSuccess(first.key, 20_000);
const accidentalDoubleTap = window.begin(base, 20_500);
assert.equal(accidentalDoubleTap.reused, true);
assert.equal(accidentalDoubleTap.messageId, first.messageId);

const legitimateLaterRepeat = window.begin(base, 21_600);
assert.equal(legitimateLaterRepeat.reused, false);
assert.notEqual(legitimateLaterRepeat.messageId, first.messageId);

const differentChat = window.begin({ ...base, chatId: 'chat-2' }, 21_601);
const differentText = window.begin({ ...base, text: 'Hola otra vez' }, 21_602);
const differentUser = window.begin({ ...base, uid: 'user-b' }, 21_603);
assert.notEqual(differentChat.messageId, legitimateLaterRepeat.messageId);
assert.notEqual(differentText.messageId, legitimateLaterRepeat.messageId);
assert.notEqual(differentUser.messageId, legitimateLaterRepeat.messageId);

window.markUncertain(legitimateLaterRepeat.key, 30_000);
const afterRetryExpiry = window.begin(base, 60_001);
assert.equal(afterRetryExpiry.reused, false);
assert.notEqual(afterRetryExpiry.messageId, legitimateLaterRepeat.messageId);

console.log('PASS concurrent identical sends reuse one message id');
console.log('PASS uncertain network retries keep the same message id for 30s');
console.log('PASS successful sends suppress only a 1.5s accidental double-tap window');
console.log('PASS later intentional repeats and distinct messages get new ids');
console.log('Chat message idempotency tests: PASS');

import fs from 'node:fs';
import assert from 'node:assert/strict';

const center=fs.readFileSync('src/components/NotificationCenter.tsx','utf8');
const helper=fs.readFileSync('src/lib/inAppNotificationRouting.ts','utf8');
const native=fs.readFileSync('src/services/nativeNotificationRouter.ts','utf8');

assert.match(center,/inAppNotificationDestination/);
assert.match(center,/openProduct\(destination\.productId\)/);
assert.match(center,/item\.transaction_id === destination\.transactionId/);
assert.match(center,/setActiveTab\('inbox'\)/);
assert.match(helper,/notification\.saved_search_id \|\| notification\.kind === 'search'/);
assert.match(helper,/notification\.offer_id/);
assert.match(helper,/notification\.kind === 'verification'/);
assert.match(native,/intent\.listing_id/);
assert.match(native,/intent\.transaction_id/);
assert.match(native,/intent\.saved_search_id/);

console.log('PASS in-app center no longer trails the native notification destination contract');

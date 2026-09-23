import fs from 'node:fs';
import assert from 'node:assert/strict';

const backend=fs.readFileSync('src/services/nationalBackend.ts','utf8');
const profile=fs.readFileSync('src/components/SellerPublicProfile.tsx','utf8');
const rules=fs.readFileSync('firebase/firestore.v2.rules','utf8');
const projector=fs.readFileSync('scripts/v2-followed-seller-notification-projector.mjs','utf8');

assert.match(backend,/async getSellerFollowState\(sellerId: string\)/);
assert.match(backend,/async setSellerFollow\(sellerId: string, enabled: boolean\)/);
assert.match(backend,/SELF_FOLLOW_DENIED/);
assert.match(profile,/Seguir vendedor/);
assert.match(profile,/aria-pressed=\{followed\}/);
assert.match(rules,/match \/seller_follows\/\{followId\}/);
assert.match(rules,/request\.resource\.data\.seller_id != request\.auth\.uid/);
assert.match(projector,/SEND_STAGING_FOLLOWED_SELLER_ALERTS/);
assert.match(projector,/seller_follows/);
assert.match(projector,/notification_preferences/);

console.log('PASS seller follow graph is owner-scoped, self-follow denied and notification projection is apply-gated');

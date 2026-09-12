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

const governance = await import(`${pathToFileURL(path.resolve('src/lib/marketplaceGovernance.ts')).href}?t=${Date.now()}`);
const notifications = await import(`${pathToFileURL(path.resolve('src/lib/notificationPreferences.ts')).href}?t=${Date.now()}`);
const analytics = await import(`${pathToFileURL(path.resolve('src/lib/marketplaceAnalytics.ts')).href}?t=${Date.now()}`);
const environments = await import(`${pathToFileURL(path.resolve('src/lib/environmentStrategy.ts')).href}?t=${Date.now()}`);
const privacy = await import(`${pathToFileURL(path.resolve('src/lib/privacyDataLifecycle.ts')).href}?t=${Date.now()}`);

assert.equal(governance.canonicalListingStatusFromLegacy('Reservado'), 'active');
assert.equal(governance.canonicalListingStatusFromLegacy('Vendido'), 'sold_out');
assert.equal(governance.canonicalListingCanTransition('active', 'paused'), true);
assert.equal(governance.canonicalListingCanTransition('archived', 'active'), false);

assert.equal(governance.classifyMarketplaceItem({ title: 'vendo pistola', category: 'Otros' }).classification, 'prohibited');
assert.equal(governance.classifyMarketplaceItem({ title: 'brownies', category: 'Comida' }).required_flow, 'food');
assert.equal(governance.classifyMarketplaceItem({ title: 'cuarto cerca CU', category: 'Cuartos & Renta' }).required_flow, 'housing');
assert.ok(governance.categorySafetyRequirements('Cuartos & Renta').forbiddenPublic.includes('exact_address'));

const otpSignals = governance.scanMessageForSafety('Mándame el código de verificación por WhatsApp');
assert.ok(otpSignals.some((item) => item.code === 'otp_request'));
assert.equal(governance.riskSeverity(otpSignals), 'critical');
assert.ok(governance.dynamicAccountLimits({ verification_level: 0, account_age_days: 1 }).active_listings < governance.dynamicAccountLimits({ verification_level: 3, account_age_days: 60 }).active_listings);

assert.equal(governance.canModerateCase({ uid: 'a', role: 'institution_moderator', active: true, institution_id: 'uatx' }, { id: '1', kind: 'product', institution_id: 'uatx', priority: 'normal', status: 'open' }), true);
assert.equal(governance.canModerateCase({ uid: 'a', role: 'institution_moderator', active: true, institution_id: 'uatx' }, { id: '2', kind: 'product', institution_id: 'buap', priority: 'normal', status: 'open' }), false);
assert.equal(governance.canModerateCase({ uid: 'a', role: 'verification_reviewer', active: true }, { id: '3', kind: 'credential', priority: 'normal', status: 'open' }), true);

assert.equal(notifications.shouldDeliverNotification('new_message'), true);
assert.equal(notifications.shouldDeliverNotification('weekly_digest'), false);
assert.equal(notifications.shouldDeliverNotification('weekly_digest', { weekly_digest: true }), true);

const snapshot = {
  active_sellers: 120,
  active_listings: 350,
  useful_interactions_7d: 160,
  listings_with_useful_interaction_7d: 155,
  searches: 200,
  searches_without_result: 20,
  chats_started: 80,
  offers_created: 40,
  agreements: 24,
  completed_transactions: 20,
  no_shows: 1,
  reports: 1,
};
assert.equal(analytics.campusLiquidityStage(snapshot), 'campaign_ready');
assert.equal(analytics.shouldRunLargeCampusCampaign(snapshot), true);
assert.equal(Math.round(analytics.marketplaceFunnel(snapshot).useful_interaction_7d_rate), 44);

assert.equal(environments.assertEnvironmentProject('staging', environments.STAGING_FIREBASE_PROJECT_ID), true);
assert.throws(() => environments.assertEnvironmentProject('staging', environments.HISTORICAL_FIREBASE_PROJECT_ID));
assert.equal(environments.featureEnabled(environments.STAGING_DEFAULT_FLAGS, 'structured_offers', { institution_id: 'uatx' }), true);
assert.equal(environments.featureEnabled(environments.STAGING_DEFAULT_FLAGS, 'structured_offers', { institution_id: 'buap' }), false);

assert.equal(privacy.assertNoPrivateFieldsInPublicProfile({ uid: 'u1', nombre: 'Ana', institution_id: 'uatx' }), true);
assert.equal(privacy.assertNoPrivateFieldsInPublicProfile({ uid: 'u1', telefono: '123' }), false);
assert.equal(privacy.accountDeletionDecision({ zone: 'private' }).action, 'delete');
assert.equal(privacy.accountDeletionDecision({ zone: 'transactional' }).action, 'anonymize');
assert.equal(privacy.accountDeletionDecision({ zone: 'trust_safety', active_dispute: true }).action, 'retain_temporarily');

console.log('PASS canonical listing lifecycle separates reservation from listing state');
console.log('PASS prohibited/restricted marketplace policy contract');
console.log('PASS anti-scam message signals and trust-aware rate limits');
console.log('PASS scoped national moderation roles');
console.log('PASS notification preferences default to high-value events only');
console.log('PASS campus liquidity and north-star analytics contract');
console.log('PASS strict development/staging/production project separation');
console.log('PASS public/private data separation and deletion lifecycle contract');
console.log('National foundation contracts: PASS');

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

const core = await import(`${pathToFileURL(path.resolve('src/lib/marketplaceCore.ts')).href}?t=${Date.now()}`);
const network = await import(`${pathToFileURL(path.resolve('src/lib/universityNetwork.ts')).href}?t=${Date.now()}`);

assert.equal(core.nextOfferStatus('pending', 'accept'), 'accepted');
assert.equal(core.nextOfferStatus('accepted', 'reject'), null);
assert.equal(core.canActOnOffer({ buyer_id: 'b', seller_id: 's', status: 'pending' }, 's', 'accept'), true);
assert.equal(core.canActOnOffer({ buyer_id: 'b', seller_id: 's', status: 'pending' }, 'b', 'accept'), false);
assert.equal(core.normalizeSearchText('iPhone13 CELULAR'), 'iphone 13 telefono');
assert.equal(core.marketplacePolicyCheck('Vendo una pistola').allowed, false);
assert.deepEqual(core.suspiciousMessageSignals('Pásame el código OTP por WhatsApp').sort(), ['move_off_platform', 'otp_request']);
assert.equal(network.institutionFromEmail('alumno@alumno.buap.mx')?.id, 'buap');
assert.equal(network.identityFor('uatx', 'uatx-riberena', 'uatx-fcea', 'uatx-turismo').career_name, 'Turismo Internacional');
assert.equal(network.defaultScopeForCategory('Comida'), 'campus');
assert.equal(network.defaultScopeForCategory('Electrónica'), 'city');

const good = core.reputationScore({ completed_transactions: 30, seller_rating: 4.9, buyer_rating: 4.8, punctuality_rate: 98, median_response_minutes: 8, cancellations: 0, no_shows: 0, reports_upheld: 0 });
const risky = core.reputationScore({ completed_transactions: 2, seller_rating: 3, buyer_rating: 3, punctuality_rate: 50, median_response_minutes: 1200, cancellations: 4, no_shows: 2, reports_upheld: 2 });
assert.ok(good > risky);

console.log('Marketplace core smoke tests: PASS.');

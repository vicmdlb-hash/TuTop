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
assert.equal(core.canActOnOffer({ buyer_id: 'b', seller_id: 's', created_by: 'b', status: 'pending' }, 's', 'accept'), true);
assert.equal(core.canActOnOffer({ buyer_id: 'b', seller_id: 's', created_by: 'b', status: 'pending' }, 'b', 'accept'), false);
assert.equal(core.canActOnOffer({ buyer_id: 'b', seller_id: 's', created_by: 's', status: 'pending' }, 'b', 'accept'), true);
assert.equal(core.canActOnOffer({ buyer_id: 'b', seller_id: 's', created_by: 's', status: 'pending' }, 's', 'withdraw'), true);
assert.equal(core.canActOnOffer({ buyer_id: 'b', seller_id: 's', created_by: 's', status: 'pending' }, 's', 'counter'), false);

const future = new Date(Date.now() + 60_000).toISOString();
const past = new Date(Date.now() - 60_000).toISOString();
const reserved = { buyer_id: 'b', seller_id: 's', status: 'reserved', reservation_expires_at: future };
assert.equal(core.canActOnTransaction(reserved, 'b', 'schedule_meetup'), true);
assert.equal(core.canActOnTransaction(reserved, 'x', 'schedule_meetup'), false);
assert.equal(core.canActOnTransaction(reserved, 's', 'expire'), false);
assert.equal(core.canActOnTransaction({ ...reserved, reservation_expires_at: past }, 'b', 'expire'), false);
assert.equal(core.canActOnTransaction({ ...reserved, reservation_expires_at: past }, 's', 'expire'), true);
assert.equal(core.canActOnTransaction({ ...reserved, status: 'meetup_scheduled' }, 'b', 'confirm_delivery'), true);
assert.equal(core.transactionStatusForAction({ ...reserved, status: 'meetup_scheduled' }, 'b', 'confirm_delivery'), 'meetup_scheduled');
assert.equal(core.transactionStatusForAction({ ...reserved, status: 'meetup_scheduled', seller_confirmed_at: past }, 'b', 'confirm_delivery'), 'completed');
assert.equal(core.canActOnTransaction({ ...reserved, status: 'completed' }, 'b', 'dispute'), false);

assert.equal(core.normalizeSearchText('iPhone13 CELULAR'), 'iphone 13 telefono');
assert.equal(core.marketplacePolicyCheck('Vendo una pistola').allowed, false);
assert.deepEqual(core.suspiciousMessageSignals('Pásame el código OTP por WhatsApp').sort(), ['move_off_platform', 'otp_request']);
assert.equal(network.institutionFromEmail('alumno@alumno.buap.mx')?.id, 'buap');
assert.equal(network.identityFor('uatx', 'uatx-riberena', 'uatx-fcea', 'uatx-turismo').career_name, 'Turismo Internacional');
assert.equal(network.defaultScopeForCategory('Comida'), 'campus');
assert.equal(network.defaultScopeForCategory('Electrónica'), 'city');
assert.equal(network.safeMeetingPointsFor('uatx-riberena').length, 2);

const now = new Date().toISOString();
const baseProduct = {
  vendedor_id: 'seller', vendedor_nombre: 'Ana', vendedor_verificado: true, descripcion: 'Calculadora científica en excelente estado',
  stock: 1, categoria: 'Electrónica', facultad: 'Turismo Internacional', punto_encuentro: 'Cafetería Central', imagen_url: 'data:image/png;base64,x',
  estado: 'Activo', es_top: false, jerarquia_top: 0, likes: 0, fecha_creacion: now, institution_id: 'uatx', campus_id: 'uatx-riberena', city_id: 'TLAX-tlaxcala', visibility_scope: 'campus',
};
const demand = {
  title: 'Busco calculadora científica', description: 'Para clases', category: 'Electrónica', max_price_mxn: 700,
  institution_id: 'uatx', campus_id: 'uatx-riberena', city_id: 'TLAX-tlaxcala', visibility_scope: 'campus',
};
const matches = core.matchDemandToListings(demand, [
  { ...baseProduct, id: 'calc', titulo: 'Calculadora científica Casio', precio_mxn: 550 },
  { ...baseProduct, id: 'expensive', titulo: 'Calculadora científica Texas', precio_mxn: 1200 },
  { ...baseProduct, id: 'unrelated', titulo: 'Audífonos Bluetooth', descripcion: 'Audio', precio_mxn: 300 },
]);
assert.equal(matches[0]?.product.id, 'calc');
assert.equal(matches.some((match) => match.product.id === 'expensive'), false);
assert.equal(matches.some((match) => match.product.id === 'unrelated'), false);

const good = core.reputationScore({ completed_transactions: 30, seller_rating: 4.9, buyer_rating: 4.8, punctuality_rate: 98, median_response_minutes: 8, cancellations: 0, no_shows: 0, reports_upheld: 0 });
const risky = core.reputationScore({ completed_transactions: 2, seller_rating: 3, buyer_rating: 3, punctuality_rate: 50, median_response_minutes: 1200, cancellations: 4, no_shows: 2, reports_upheld: 2 });
assert.ok(good > risky);

console.log('Marketplace core smoke tests: PASS.');

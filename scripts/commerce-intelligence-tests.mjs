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

const search = await import(`${pathToFileURL(path.resolve('src/lib/nationalSearch.ts')).href}?t=${Date.now()}`);
const pricing = await import(`${pathToFileURL(path.resolve('src/lib/smartPricing.ts')).href}?t=${Date.now()}`);
const bundles = await import(`${pathToFileURL(path.resolve('src/lib/bundles.ts')).href}?t=${Date.now()}`);
const crm = await import(`${pathToFileURL(path.resolve('src/lib/sellerCrm.ts')).href}?t=${Date.now()}`);

const user = {
  id: 'buyer', telefono: '5210000000000', nombre: 'Buyer', facultad: 'FCEA', saldo_ucoins: 0, puntos_prestigio: 0,
  nivel_vendedor: 'Novato', esta_verificado: true, strikes: 0, fecha_registro: '2026-01-01', institution_id: 'uatx', campus_id: 'uatx-riberena',
  university: { country_code: 'MX', institution_id: 'uatx', campus_id: 'uatx-riberena', city_id: 'TLAX-tlaxcala' },
};

function product(id, price, extra = {}) {
  return {
    id,
    vendedor_id: extra.vendedor_id || 'seller',
    vendedor_nombre: 'Seller',
    titulo: extra.titulo || 'iPhone 13 128GB',
    descripcion: extra.descripcion || 'Celular Apple en buen estado',
    precio_mxn: price,
    categoria: extra.categoria || 'Electrónica',
    facultad: 'FCEA',
    punto_encuentro: 'Biblioteca',
    imagen_url: 'data:image/png;base64,a',
    estado: extra.estado || 'Activo',
    jerarquia_top: 0,
    es_top: false,
    fecha_creacion: extra.fecha_creacion || '2026-09-05T12:00:00.000Z',
    institution_id: extra.institution_id || 'uatx',
    campus_id: extra.campus_id || 'uatx-riberena',
    city_id: extra.city_id || 'TLAX-tlaxcala',
    visibility_scope: extra.visibility_scope || 'campus',
    marca: extra.marca || 'Apple',
    modelo: extra.modelo || 'iPhone 13',
    ...extra,
  };
}

assert.deepEqual(search.expandedSearchTokens('iPhone13').includes('iphone'), true);
assert.equal(search.normalizeNationalSearch('Microeconomía'), 'microeconomia');
const ranked = search.rankNationalSearch([
  product('local', 6000),
  product('remote', 5900, { institution_id: 'buap', campus_id: 'buap-cu', city_id: 'PUE-puebla', visibility_scope: 'national' }),
], { query: 'celular apple', user, now: Date.parse('2026-09-05T18:00:00Z') });
assert.equal(ranked[0].product.id, 'local');
assert.ok(ranked[0].reasons.some((reason) => reason.includes('campus')));
assert.ok(search.CATEGORY_FILTERS['Electrónica'].some((filter) => filter.key === 'storage_gb'));
assert.ok(search.CATEGORY_FILTERS['Cuartos & Renta'].some((filter) => filter.key === 'campus_distance_km'));

const target = product('target', 0);
const inventory = [3900, 4000, 4200, 4400, 4700, 4500].map((price, index) => product(`p${index}`, price));
const evidence = pricing.smartPriceFromTuTop(target, inventory);
assert.ok(evidence);
assert.equal(evidence.sample_size, 6);
assert.ok(evidence.recommended_mxn >= evidence.frequent_low_mxn && evidence.recommended_mxn <= evidence.frequent_high_mxn);
assert.equal(pricing.smartPriceFromTuTop(target, inventory.slice(0, 2)), null);
assert.match(pricing.smartPriceMessage(null), /no hay suficientes comparables reales/i);

const bundle = bundles.buildBundleDraft({ products: [product('b1', 400), product('b2', 300)], buyer_id: 'buyer', offer_total_mxn: 600 });
assert.equal(bundle.normal_total_mxn, 700);
assert.equal(bundle.offer_total_mxn, 600);
assert.equal(bundles.bundleDiscountPercent(bundle), 14);
assert.throws(() => bundles.buildBundleDraft({ products: [product('x1', 100, { vendedor_id: 'a' }), product('x2', 100, { vendedor_id: 'b' })], buyer_id: 'buyer' }));

const metrics = crm.sellerCrmMetrics({ active_listings: 8, views: 1282, saves: 87, chats: 34, offers: 12, completed_deliveries: 9, median_response_minutes: 6, stale_listing_count: 1, saved_this_week: 5 });
assert.equal(metrics.conversion_chat_to_delivery, 26.5);
const recommendations = crm.sellerRecommendations({ active_listings: 2, views: 120, saves: 5, chats: 0, offers: 0, completed_deliveries: 0, median_response_minutes: 90, stale_listing_count: 1, saved_this_week: 5 });
assert.ok(recommendations.some((item) => item.code === 'views_no_chat'));
assert.ok(recommendations.some((item) => item.code === 'slow_response'));

console.log('PASS national search normalizes variants and explains ranking');
console.log('PASS category-specific filters exist');
console.log('PASS smart pricing requires real TuTop comparables');
console.log('PASS bundles require one seller and calculate discount');
console.log('PASS seller mini-CRM metrics and recommendations');
console.log('Commerce intelligence contracts: PASS');

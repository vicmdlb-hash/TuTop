import assert from 'node:assert/strict';
import fs from 'node:fs';

const screen=fs.readFileSync('src/components/NationalPublishScreen.tsx','utf8');
const listings=fs.readFileSync('src/services/canonicalListingsBackend.ts','utf8');
const rate=fs.readFileSync('src/services/rateLimit.ts','utf8');
const rulesGenerator=fs.readFileSync('scripts/prepare-firestore-v2-rules.mjs','utf8');

assert.match(screen,/parsedPrice >= 0\.01/);
assert.match(screen,/parsedPrice <= 1_000_000/);
assert.match(screen,/hasValidTitle = title\.trim\(\)\.length >= 2/);
assert.doesNotMatch(screen,/nationalShippingValid/);
assert.doesNotMatch(screen,/publish_national_shipping_required/);
assert.match(screen,/Number\.isInteger\(parsedQuantity\)/);
assert.match(screen,/parsedQuantity >= 1 && parsedQuantity <= 99/);
assert.match(screen,/quantity: parsedQuantity/);
assert.match(screen,/step="1"/);
assert.match(screen,/PUBLISH_PERMISSION_DENIED/);
assert.match(screen,/publish_price_invalid/);
assert.match(screen,/publish_quantity_invalid/);
assert.match(screen,/publish_title_invalid/);
assert.doesNotMatch(screen,/Verifica tu universidad, campus y sesión/);

assert.match(listings,/LISTING_TITLE_INVALID/);
assert.match(listings,/listing\.title\.trim\(\)\.length < 2/);
assert.match(listings,/LISTING_PRICE_INVALID/);
assert.match(listings,/listing\.price_mxn < 0\.01/);
assert.match(listings,/listing\.price_mxn > 1_000_000/);
assert.match(listings,/LISTING_QUANTITY_INVALID/);
assert.doesNotMatch(listings,/LISTING_NATIONAL_SHIPPING_REQUIRED/);
assert.doesNotMatch(listings,/listing\.visibility_scope === 'national' && !listing\.shipping_available/);
assert.match(listings,/LISTING_DELIVERY_INVALID/);
assert.match(listings,/LISTING_MEETING_POINTS_INVALID/);
assert.match(listings,/LISTING_PHOTO_INVALID/);
assert.match(listings,/Number\.isInteger\(listing\.quantity\)/);
// Exercise the real update-time numeric preflight without a network or Firebase client.
const numericStart = listings.indexOf('    const patch: Record<string, unknown> = { updated_at: new Date() };');
const numericEnd = listings.indexOf('    if (updates.categoria !== undefined)', numericStart);
assert(numericStart >= 0 && numericEnd > numericStart, 'canonical editing numeric guards must remain visible');
const numericSource = listings.slice(numericStart, numericEnd);
const { stripTypeScriptTypes } = await import('node:module');
const validateEditNumeric = new Function('updates', stripTypeScriptTypes(numericSource) + '\nreturn patch;');
assert.equal(validateEditNumeric({ stock: 1 }).quantity, 1);
assert.equal(validateEditNumeric({ stock: 99 }).quantity, 99);
assert.equal(validateEditNumeric({ precio_mxn: 0.01 }).price_mxn, 0.01);
assert.equal(validateEditNumeric({ precio_mxn: 1_000_000 }).price_mxn, 1_000_000);
assert.equal(Object.hasOwn(validateEditNumeric({}), 'quantity'), false);
assert.equal(Object.hasOwn(validateEditNumeric({}), 'price_mxn'), false);
for (const stock of [null, 0, -3, 1.5, 100, 1_000, '1', NaN, Infinity]) {
  assert.throws(() => validateEditNumeric({stock}), /LISTING_QUANTITY_INVALID/, 'invalid stock must not become saleable');
}
for (const precio_mxn of [null, -1, 0, 0.001, 1_000_000.01, '20', NaN, Infinity]) {
  assert.throws(() => validateEditNumeric({precio_mxn}), /LISTING_PRICE_INVALID/, 'invalid price must not be silently coerced');
}
assert.doesNotMatch(numericSource, /Math\.round\(Number\(updates\.stock\)\)/);

// Run actual legacy read-projection helpers offline; old stock=0 must never become 1.
const legacy = fs.readFileSync('src/services/onlineBackend.ts', 'utf8');
const legacyStart = legacy.indexOf('function legacySaleableStock(');
const legacyEnd = legacy.indexOf('\nexport class TuTopOnlineBackend', legacyStart);
assert(legacyStart >= 0 && legacyEnd > legacyStart, 'legacy projector must be visible');
const legacyHelpers = stripTypeScriptTypes(legacy.slice(legacyStart, legacyEnd));
const { legacySaleableStock, legacySaleablePrice, asProduct } =
  new Function('normalizeCategory', 'nowIso', legacyHelpers + '\nreturn { legacySaleableStock, legacySaleablePrice, asProduct };')(
    (category) => category, () => '2026-11-14T00:00:00.000Z');
const legacyProduct = (extra = {}) => asProduct({ id: 'legacy-test', data: {
  vendedor_id: 'seller-test', titulo: 'Anuncio', categoria: 'Otros',
  precio_mxn: 30, stock: 1, estado: 'Activo', ...extra,
} });
assert.equal(legacyProduct().stock, 1);
assert.equal(legacyProduct().availability_status, 'available');
assert.equal(legacyProduct({ stock: 99 }).stock, 99);
for (const stock of [undefined, null, 0, -1, 1.5, 100, NaN, Infinity, '1']) {
  assert.equal(legacySaleableStock(stock), 0);
  const projected = legacyProduct({ stock });
  assert.equal(projected.stock, 0, 'legacy cannot fabricate a saleable unit');
  assert.equal(projected.availability_status, 'unverified');
  assert.equal(projected.estado, 'Pausado');
}
for (const precio_mxn of [undefined, null, 0, -1, 1_000_000.01, NaN, Infinity, '30']) {
  assert.equal(legacySaleablePrice(precio_mxn), false);
  assert.equal(legacyProduct({ precio_mxn }).estado, 'Pausado');
}
assert.equal(legacyProduct({ availability_status: 'reserved' }).availability_status, 'reserved');
assert.equal(legacyProduct({ availability_status: null }).availability_status, 'unverified');
assert.equal(legacyProduct({ estado: 'unknown' }).estado, 'Pausado');
assert.match(legacy, /if \(!legacySaleablePrice\(product\.precio_mxn\)\) throw new Error\('LISTING_PRICE_INVALID'\)/);
assert.match(legacy, /if \(!stock\) throw new Error\('LISTING_QUANTITY_INVALID'\)/);
assert.match(legacy, /if \(updates\.stock !== undefined && !legacySaleableStock\(updates\.stock\)\)/);
assert.match(legacy, /if \(updates\.precio_mxn !== undefined && !legacySaleablePrice\(updates\.precio_mxn\)\)/);
assert.doesNotMatch(legacy, /stock: product\.stock \|\| 1/);
// Exercise the real legacy update method against a fake Firestore client.
const updateStart = legacy.indexOf('  async updateProduct(productId: string, updates: Partial<Product>) {');
const updateEnd = legacy.indexOf('\n  async createChat(', updateStart);
assert(updateStart >= 0 && updateEnd > updateStart);
const updateMethodJs = stripTypeScriptTypes('({ getClient() { return client; }, ' + legacy.slice(updateStart, updateEnd) + '\n})');
const makeUpdater = new Function('client', 'sameFirebaseSession', 'legacySaleableStock', 'legacySaleablePrice', 'nowIso', 'return ' + updateMethodJs);
const sameSession = (a, b) => Boolean(a && b && a.uid === b.uid && a.idToken === b.idToken && a.refreshToken === b.refreshToken);
const ownerSession = { uid: 'seller-A', idToken: 'synthetic-id-A', refreshToken: 'synthetic-refresh-A' };
function updaterFixture({ seller = 'seller-A', version = 'version-1', switchSession = false, exists = true } = {}) {
  const writes = [];
  const client = {
    currentSession: ownerSession,
    getDocument: async () => { if (switchSession) client.currentSession = { uid: 'seller-A', idToken: 'new-id', refreshToken: 'new-refresh' };
      return exists ? { data: { vendedor_id: seller }, updateTime: version } : null; },
    setDocument: async (path, payload, options) => { writes.push({path, payload, options}); },
  };
  const runner = makeUpdater(client, sameSession, legacySaleableStock, legacySaleablePrice, () => '2026-11-14T00:00:00.000Z');
  return { runner, writes };
}
{ const {runner,writes} = updaterFixture();
  await runner.updateProduct('legacy-1',{ stock: 2, precio_mxn: 10 });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].options.updateTime, 'version-1');
  assert.equal(writes[0].options.merge, true);
}
for (const fixture of [
  [{ seller: 'seller-B' }, /SELLER_REQUIRED/],
  [{ version: undefined }, /LISTING_VERSION_REQUIRED/],
  [{ switchSession: true }, /AUTH_SESSION_CHANGED/],
  [{ exists: false }, /LISTING_NOT_FOUND/],
]) {
  const [settings, reason] = fixture;
  const {runner,writes} = updaterFixture(settings);
  await assert.rejects(runner.updateProduct('legacy-1',{ stock: 2 }), reason);
  assert.equal(writes.length, 0, 'denied legacy edit must not reach Firestore write');
}
assert.match(legacy, /merge: true, updateTime: snapshot\.updateTime/);




assert.match(rulesGenerator,/request\.resource\.data\.title\.size\(\) >= 2/);
assert.match(rulesGenerator,/request\.resource\.data\.title\.size\(\) <= 120/);
assert.match(rulesGenerator,/request\.resource\.data\.price_mxn <= 1000000/);
assert.match(rulesGenerator,/request\.resource\.data\.quantity is int/);
assert.match(rulesGenerator,/request\.resource\.data\.quantity >= 1 && request\.resource\.data\.quantity <= 99/);
assert.match(rulesGenerator,/request\.resource\.data\.delivery_methods\.size\(\) >= 1 && request\.resource\.data\.delivery_methods\.size\(\) <= 4/);
assert.match(rulesGenerator,/request\.resource\.data\.meeting_point_ids\.size\(\) <= 8/);
assert.match(rulesGenerator,/request\.resource\.data\.photo_urls\.size\(\) >= 1 && request\.resource\.data\.photo_urls\.size\(\) <= 4/);
assert.doesNotMatch(rulesGenerator,/visibility_scope != 'national' \|\| request\.resource\.data\.shipping_available == true/);
assert.match(rulesGenerator,/request\.resource\.data\.shipping_available is bool/);

const helperStart=listings.indexOf('export function buildCanonicalListingCreateWrite(');
assert.ok(helperStart>=0,'canonical listing write helper missing');
const helperEnd=listings.indexOf('\nexport const canonicalListingsBackend',helperStart);
const helperBlock=listings.slice(helperStart,helperEnd);
assert.match(helperBlock,/created_at: _clientCreatedAt/);
assert.match(helperBlock,/updated_at: _clientUpdatedAt/);
assert.match(helperBlock,/published_at: _clientPublishedAt/);
assert.match(helperBlock,/fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME'/);
assert.match(helperBlock,/fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME'/);
assert.match(helperBlock,/fieldPath: 'published_at', setToServerValue: 'REQUEST_TIME'/);
assert.doesNotMatch(helperBlock,/created_at: new Date\(listing\.created_at\)/);
assert.doesNotMatch(helperBlock,/updated_at: new Date\(listing\.updated_at\)/);

const createStart=listings.indexOf('async create(listing: CanonicalListingV2');
assert.ok(createStart>=0,'canonical listing create missing');
const createEnd=listings.indexOf('\n  async loadMine',createStart);
const createBlock=listings.slice(createStart,createEnd);
assert.match(createBlock,/buildCanonicalListingCreateWrite\(client, id, listing\)/);

assert.match(rate,/setToServerValue: 'REQUEST_TIME'/);
assert.match(rate,/fieldPath: 'updated_at'/);
assert.match(rate,/fieldPath: 'window_start'/);
assert.doesNotMatch(rate,/updated_at: at/);

console.log('PASS publication UI blocks invalid title/quantity/price/delivery values while national visibility remains independent from shipping');
console.log('PASS canonical backend fails fast on all client-reachable listing boundary mismatches');
console.log('PASS client/backend/generated Rules agree that national visibility does not require shipping and still require explicit delivery');
console.log('PASS listing publication uses Firestore REQUEST_TIME, not device wall clock');
console.log('PASS listing rate-limit uses Firestore REQUEST_TIME, not device wall clock');

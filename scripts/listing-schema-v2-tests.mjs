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

const schema = await import(`${pathToFileURL(path.resolve('src/lib/listingSchemaV2.ts')).href}?t=${Date.now()}`);

function product(extra = {}) {
  return {
    id: 'legacy-1',
    vendedor_id: 'seller',
    vendedor_nombre: 'Ana',
    titulo: 'Calculadora Casio FX-991',
    descripcion: 'Buen estado',
    precio_mxn: 450,
    stock: 1,
    categoria: 'Electrónica',
    subcategoria: 'Calculadoras',
    facultad: 'FCEA',
    punto_encuentro: 'Biblioteca',
    imagen_url: 'data:image/png;base64,a',
    estado: 'Activo',
    jerarquia_top: 0,
    es_top: false,
    fecha_creacion: '2026-09-01T12:00:00.000Z',
    institution_id: 'uatx',
    campus_id: 'uatx-riberena',
    city_id: 'TLAX-tlaxcala',
    faculty_id: 'uatx-fcea',
    visibility_scope: 'campus',
    shipping_available: false,
    attributes: { brand: 'Casio', condition: 'Buen estado', storage_gb: 128 },
    ...extra,
  };
}

const migrated = schema.legacyProductToListingV2(product(), '2026-09-05T20:00:00.000Z');
assert.equal(migrated.blockers.length, 0);
assert.ok(migrated.listing);
assert.equal(migrated.listing.schema_version, 2);
assert.equal(migrated.listing.institution_id, 'uatx');
assert.equal(migrated.listing.campus_id, 'uatx-riberena');
assert.equal(migrated.listing.category_id, 'electronica');
assert.deepEqual(migrated.listing.delivery_methods, ['campus_meetup']);
assert.equal(migrated.listing.status, 'active');
assert.equal(schema.listingV2HasNoLegacyDescriptionPacking(migrated.listing), true);

const reserved = schema.legacyProductToListingV2(product({ estado: 'Reservado' }), '2026-09-05T20:00:00.000Z');
assert.equal(reserved.listing.status, 'active');
assert.ok(reserved.warnings.includes('legacy_reserved_mapped_to_active_listing_transaction_owns_reservation'));

const national = schema.legacyProductToListingV2(product({ visibility_scope: 'national', shipping_available: true }), '2026-09-05T20:00:00.000Z');
assert.ok(national.listing.delivery_methods.includes('shipping'));

const missingCampus = schema.legacyProductToListingV2(product({ campus_id: undefined }), '2026-09-05T20:00:00.000Z');
assert.equal(missingCampus.listing, null);
assert.ok(missingCampus.blockers.includes('missing_campus_id'));

const archived = schema.legacyProductToListingV2(product({ estado: 'Archivado' }), '2026-09-05T20:00:00.000Z');
assert.equal(archived.listing.status, 'archived');

const safeVideo = 'firebase-storage://tutop-beta-vicmdlb-1356585881.firebasestorage.app/product-videos/seller/clip.mp4';
assert.equal(schema.validCanonicalVideoUri(safeVideo), true);
assert.equal(schema.validCanonicalVideoUri('https://example.com/video.mp4'), false);
assert.equal(schema.validCanonicalVideoUri('firebase-storage://bucket/verification/seller/secret.mp4'), false);

const withVideo = schema.legacyProductToListingV2(product({ video_urls: [safeVideo] }), '2026-09-05T20:00:00.000Z');
assert.deepEqual(withVideo.listing.video_urls, [safeVideo]);
assert.equal(schema.listingV2HasNoLegacyDescriptionPacking(withVideo.listing), true);

const invalidVideo = { ...migrated.listing, video_urls: ['https://example.com/not-canonical.mp4'] };
assert.equal(schema.listingV2HasNoLegacyDescriptionPacking(invalidVideo), false);
const tooManyVideos = { ...migrated.listing, video_urls: [safeVideo, safeVideo] };
assert.equal(schema.listingV2HasNoLegacyDescriptionPacking(tooManyVideos), false);

console.log('PASS legacy product migrates to explicit institution/campus listing schema');
console.log('PASS reservation remains transaction state, not canonical listing state');
console.log('PASS national shipping and structured attributes survive migration');
console.log('PASS migration blocks records missing campus identity');
console.log('PASS canonical listing video references are fail-closed and limited to one Storage object');
console.log('Canonical listings_v2 migration contract: PASS');
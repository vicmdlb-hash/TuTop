import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  LEGACY_PUBLISH_DRAFT_PREFIX, LEGACY_PUBLISH_DRAFT_UNSCOPED_KEY,
  LEGACY_PUBLISH_DRAFT_TTL_MS, readLegacyPublishDraft,
  writeLegacyPublishDraft, clearLegacyPublishDraft, discardLegacyUnscopedDraft,
} from '../src/lib/legacyPublishDraftPrivacy.ts';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); },
    map,
  };
}
const A = 'owner-A-123456789';
const B = 'owner-B-987654321';
const now = 1_800_000_000_000;
const storage = fakeStorage();

// Old v4 data had no owner; no user may inherit its text or embedded images.
storage.setItem(LEGACY_PUBLISH_DRAFT_UNSCOPED_KEY,
  JSON.stringify({ draft: { titulo: 'A private old listing' }, images: ['data:image/png;base64,LEGACY_SECRET'] }));
assert.equal(readLegacyPublishDraft(B, storage, now), null);
assert.equal(storage.map.has(LEGACY_PUBLISH_DRAFT_UNSCOPED_KEY), false);

assert.equal(writeLegacyPublishDraft(A, {
  titulo: 'Libro', precio_mxn: 110, categoria: 'Electrónica',
  facultad: 'FCEA', descripcion: 'Buen estado', imagen_url: 'data:image/png;base64,IMAGE_SECRET',
  imagenes_url: ['data:image/png;base64,IMAGE_SECRET'], authToken: 'SYNTHETIC_TOKEN',
  exactDeviceLocation: { latitude: 19.3, longitude: -98.2 },
  metodos_entrega: ['Punto TuTop'],
}, { ram: '8 GB', auth_token: 'SYNTHETIC_PRIVATE_SECRET', private_key: 'SYNTHETIC_KEY' },
storage, now), true);

const keyA = LEGACY_PUBLISH_DRAFT_PREFIX + A;
const raw = storage.map.get(keyA);
assert(raw);
for (const secret of ['IMAGE_SECRET','SYNTHETIC_TOKEN','SYNTHETIC_PRIVATE_SECRET','SYNTHETIC_KEY']) {
  assert(!raw.includes(secret), 'local durable data cannot keep account credentials or photos');
}
assert.equal(readLegacyPublishDraft(A, storage, now + 1)?.draft.titulo, 'Libro');
assert.deepEqual(readLegacyPublishDraft(A, storage, now + 1)?.adaptive, { ram: '8 GB' });
assert.equal(readLegacyPublishDraft(B, storage, now + 1), null, 'B cannot read A draft');

// No global media persistence, and UID partitioning is bidirectional.
assert.equal(writeLegacyPublishDraft(B, { titulo: 'B listing' }, {}, storage, now), true);
assert.equal(readLegacyPublishDraft(B, storage, now)?.draft.titulo, 'B listing');
assert.equal(readLegacyPublishDraft(A, storage, now)?.draft.titulo, 'Libro');
clearLegacyPublishDraft(A, storage);
assert.equal(readLegacyPublishDraft(A, storage, now), null);
assert.equal(readLegacyPublishDraft(B, storage, now)?.draft.titulo, 'B listing');

const invalid = fakeStorage();
assert.equal(writeLegacyPublishDraft('', { titulo: 'Orphaned' }, {}, invalid, now), false);
assert.equal(invalid.map.size, 0);
invalid.setItem(LEGACY_PUBLISH_DRAFT_PREFIX + A, JSON.stringify({
  schema_version: 1, owner_uid: B, expires_at: now + 1000,
  draft: { titulo: 'Wrong-owner private listing' },
}));
assert.equal(readLegacyPublishDraft(A, invalid, now), null);
assert.equal(invalid.map.size, 0, 'forged owner record is purged');

writeLegacyPublishDraft(A, { titulo: 'Expires' }, {}, invalid, now);
assert.equal(readLegacyPublishDraft(A, invalid, now + LEGACY_PUBLISH_DRAFT_TTL_MS + 1), null);
assert.equal(invalid.map.size, 0);

const screen = fs.readFileSync('src/components/Chatbot.tsx','utf8');
const app = fs.readFileSync('src/App.tsx','utf8');
assert.match(screen, /safeStoredDraft\(user\.id, user\.facultad\)/);
assert.match(screen, /writeLegacyPublishDraft\(ownerUid, draft, adaptive\)/);
assert.match(screen, /useAppStore\.getState\(\)\.user\.id !== ownerUid/);
assert.match(screen, /clearLegacyPublishDraft\(user\.id\)/);
assert.match(screen, /const \[images, setImages\] = useState<string\[\]>\(\[\]\)/);
assert.doesNotMatch(screen, /localStorage\.(?:getItem|setItem)/);
assert.match(app, /<Chatbot key=\{user\.id\} \/>/);
const startup = fakeStorage();
startup.setItem(LEGACY_PUBLISH_DRAFT_UNSCOPED_KEY, 'data:image/jpeg;base64,OLD_PRIVATE_PHOTO');
discardLegacyUnscopedDraft(startup);
assert.equal(startup.map.has(LEGACY_PUBLISH_DRAFT_UNSCOPED_KEY), false,
  'startup cleanup removes unowned media even when V2 publisher is used');
assert.match(app, /discardLegacyUnscopedDraft\(\)/,
  'normal app startup must purge the global v4 key without entering legacy publishing');
console.log('PASS legacy publisher UID partition, unscoped v4 purge, no photo/token persistence, TTL, owner proof and UI remount');

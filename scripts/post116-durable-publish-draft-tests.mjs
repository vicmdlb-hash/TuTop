import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DURABLE_PUBLISH_DRAFT_PREFIX,
  DURABLE_PUBLISH_DRAFT_TTL_MS,
  readDurablePublishDraft,
  writeDurablePublishDraft,
  clearDurablePublishDraft,
} from '../src/lib/publishDraftPersistence.ts';

function mockStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
    data,
  };
}

const storage = mockStorage();
const now = 1_800_000_000_000;
const uidA = 'uid-A-123456789';
const uidB = 'uid-B-987654321';

assert.equal(writeDurablePublishDraft(uidA, {
  assistantText: 'vendo calculadora',
  title: 'Calculadora científica',
  description: 'Usada, funciona bien',
  price: '350',
  quantity: '1',
  category: 'Electrónica',
  condition: 'Buen estado',
  negotiable: true,
  scope: 'campus',
  deliveryMethods: ['campus_meetup'],
  meetingPointId: 'library',
  attributes: { brand: 'Casio', model: 'fx-991', storage_gb: 0 },
  images: ['data:image/jpeg;base64,SECRET'],
  locationOptIn: true,
  exactDeviceLocation: { lat: 19, lng: -98 },
  authToken: 'SHOULD_NOT_PERSIST',
}, storage, now), true);

const raw = storage.data.get(`${DURABLE_PUBLISH_DRAFT_PREFIX}${uidA}`);
assert(raw);
const envelope = JSON.parse(raw);
assert.equal(envelope.uid, uidA);
assert.equal(envelope.expires_at, now + DURABLE_PUBLISH_DRAFT_TTL_MS);
assert.equal(envelope.draft.title, 'Calculadora científica');
assert.equal(envelope.draft.attributes.brand, 'Casio');
assert.equal('images' in envelope.draft, false);
assert.equal('locationOptIn' in envelope.draft, false);
assert.equal('exactDeviceLocation' in envelope.draft, false);
assert.equal('authToken' in envelope.draft, false);
assert.equal(raw.includes('SECRET'), false);
assert.equal(raw.includes('SHOULD_NOT_PERSIST'), false);

const restoredA = readDurablePublishDraft(uidA, storage, now + 1000);
assert.equal(restoredA?.title, 'Calculadora científica');
assert.equal(restoredA?.attributes?.model, 'fx-991');
assert.equal(readDurablePublishDraft(uidB, storage, now + 1000), null, 'account B must never receive account A draft');

assert.equal(readDurablePublishDraft(uidA, storage, now + DURABLE_PUBLISH_DRAFT_TTL_MS + 1), null, 'expired draft must not restore');
assert.equal(storage.data.has(`${DURABLE_PUBLISH_DRAFT_PREFIX}${uidA}`), false, 'expired draft should be removed');

writeDurablePublishDraft(uidA, { title: 'Again' }, storage, now);
clearDurablePublishDraft(uidA, storage);
assert.equal(readDurablePublishDraft(uidA, storage, now), null);

storage.setItem(`${DURABLE_PUBLISH_DRAFT_PREFIX}${uidA}`, JSON.stringify({
  schema_version: 2,
  uid: uidB,
  saved_at: now,
  expires_at: now + 1000,
  draft: { title: 'Wrong owner' },
}));
assert.equal(readDurablePublishDraft(uidA, storage, now), null, 'owner mismatch must fail closed');

const invalidCategory = mockStorage();
writeDurablePublishDraft(uidA, { category: 'Inventada', title: 'X' }, invalidCategory, now);
assert.equal(readDurablePublishDraft(uidA, invalidCategory, now)?.category, undefined);

const screen = fs.readFileSync('src/components/NationalPublishScreen.tsx','utf8');
const app = fs.readFileSync('src/App.tsx','utf8');
assert.match(screen, /readDurablePublishDraft\(uid\)/);
assert.match(screen, /writeDurablePublishDraft\(uid/);
assert.match(screen, /clearDurablePublishDraft\(uid\)/);
assert.match(screen, /Guardar borrador/);
assert.match(screen, /Descartar borrador/);
assert.match(screen, /Las fotos no se guardan de forma durable/);
assert.match(app, /<NationalPublishScreen key=\{user\.id\} \/>/);

console.log('PASS durable publish drafts: UID partition, TTL, no media/location/token persistence, explicit save/discard and account remount');

import fs from 'node:fs';
import test, { after } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'tutop-rules-test';
const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';
const [hostname, portRaw] = host.split(':');
const rules = fs.readFileSync('firebase/storage.rules', 'utf8');

const env = await initializeTestEnvironment({
  projectId,
  storage: { host: hostname, port: Number(portRaw || 9199), rules },
});

after(async () => env.cleanup());

const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const videoBytes = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);

test('product image: owner can upload image to own prefix', async () => {
  const storage = env.authenticatedContext('u1').storage();
  await assertSucceeds(uploadBytes(ref(storage, 'product-images/u1/p1.jpg'), bytes, { contentType: 'image/jpeg' }));
});

test('product image: user cannot upload into another user prefix', async () => {
  const storage = env.authenticatedContext('u1').storage();
  await assertFails(uploadBytes(ref(storage, 'product-images/u2/forged.jpg'), bytes, { contentType: 'image/jpeg' }));
});

test('product image: non-image mime is rejected', async () => {
  const storage = env.authenticatedContext('u1').storage();
  await assertFails(uploadBytes(ref(storage, 'product-images/u1/not-image.txt'), new TextEncoder().encode('hello'), { contentType: 'text/plain' }));
});

test('product video: owner can upload a safe video mime to own prefix', async () => {
  const storage = env.authenticatedContext('u1').storage();
  await assertSucceeds(uploadBytes(ref(storage, 'product-videos/u1/p1.mp4'), videoBytes, { contentType: 'video/mp4' }));
});

test('product video: cross-owner upload and unsafe mime are rejected', async () => {
  const storage = env.authenticatedContext('u1').storage();
  await assertFails(uploadBytes(ref(storage, 'product-videos/u2/forged.mp4'), videoBytes, { contentType: 'video/mp4' }));
  await assertFails(uploadBytes(ref(storage, 'product-videos/u1/not-video.bin'), videoBytes, { contentType: 'application/octet-stream' }));
});

test('verification evidence: owner reads, other user cannot read', async () => {
  const ownerStorage = env.authenticatedContext('u1').storage();
  const otherStorage = env.authenticatedContext('u2').storage();
  const evidence = ref(ownerStorage, 'verification/u1/credential.jpg');
  await assertSucceeds(uploadBytes(evidence, bytes, { contentType: 'image/jpeg' }));
  await assertSucceeds(getBytes(evidence));
  await assertFails(getBytes(ref(otherStorage, 'verification/u1/credential.jpg')));
  await assertSucceeds(deleteObject(evidence));
});
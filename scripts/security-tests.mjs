import fs from 'node:fs';
import assert from 'node:assert/strict';

const firestore = fs.readFileSync('firebase/firestore.rules', 'utf8');
const firebaseConfig = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
const backend = fs.readFileSync('src/services/onlineBackend.ts', 'utf8');
const runtime = fs.readFileSync('src/services/runtimeConfig.ts', 'utf8');
const firebaseRest = fs.readFileSync('src/services/firebaseRest.ts', 'utf8');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('Spark activo no despliega Functions ni Cloud Storage', () => {
  assert.equal(firebaseConfig.functions, undefined);
  assert.equal(firebaseConfig.storage, undefined);
  assert.ok(firebaseConfig.firestore?.rules);
  assert.ok(firebaseConfig.hosting?.public);
});

test('teléfono queda fuera del perfil público', () => {
  const users = firestore.slice(firestore.indexOf('match /users/{uid}'), firestore.indexOf('match /user_private/{uid}'));
  assert.ok(!users.includes("'telefono'"));
  assert.match(firestore, /match \/user_private\/\{uid\}[\s\S]*?allow read: if owner\(uid\) \|\| isAdmin\(\);/);
});

test('productos exigen propietario y nunca permiten delete', () => {
  const block = firestore.slice(firestore.indexOf('match /products/{productId}'), firestore.indexOf('match /favorites/{favoriteId}'));
  assert.ok(block.includes('request.resource.data.vendedor_id == request.auth.uid'));
  assert.ok(block.includes('request.resource.data.vendedor_nombre == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.nombre'));
  assert.ok(block.includes('request.resource.data.facultad == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.facultad'));
  assert.ok(block.includes('resource.data.vendedor_id == request.auth.uid'));
  assert.ok(block.includes('allow delete: if false;'));
  assert.ok(firestore.includes('function validProductContent(data)'));
  assert.ok(firestore.includes('validProductContent(request.resource.data)'));
  assert.ok(firestore.includes("validCategory(data.categoria)"));
  assert.ok(firestore.includes("validMeetingPoint(data.punto_encuentro)"));
});

test('chat beta evita autochat y usa id determinista', () => {
  const block = firestore.slice(firestore.indexOf('match /chats/{chatId}'), firestore.indexOf('match /reviews/{reviewId}'));
  assert.ok(block.includes("request.resource.data.seller_id != request.auth.uid"));
  assert.ok(block.includes("chatId == 'chat-' + request.auth.uid + '-' + request.resource.data.product_id"));
  assert.ok(block.includes('request.resource.data.participants.size() == 2'));
});

test('wallet sólo nace con 10 UCoins y se gasta mediante bid atómico', () => {
  const block = firestore.slice(firestore.indexOf('match /wallets/{uid}'), firestore.indexOf('match /wallet_transactions/{transactionId}'));
  assert.ok(block.includes('request.resource.data.balance == 10'));
  assert.ok(block.includes('request.resource.data.prestige == 0'));
  assert.ok(block.includes('getAfter(/databases/$(database)/documents/bids/$(request.resource.data.last_op_id))'));
  assert.ok(block.includes('resource.data.balance - request.resource.data.balance > 0'));
});

test('ledger es inmutable y sólo acepta bienvenida o gasto enlazado', () => {
  const block = firestore.slice(firestore.indexOf('match /wallet_transactions/{transactionId}'), firestore.indexOf('match /products/{productId}'));
  assert.ok(block.includes("transactionId == 'welcome-' + request.auth.uid"));
  assert.ok(block.includes("request.resource.data.type == 'expense'"));
  assert.ok(block.includes('allow update, delete: if false;'));
});

test('pujas sólo sobre producto propio activo y enlazadas a wallet', () => {
  const block = firestore.slice(firestore.indexOf('match /bids/{bidId}'), firestore.indexOf('match /verificationRequests/{uid}'));
  assert.ok(block.includes(".data.vendedor_id == request.auth.uid"));
  assert.ok(block.includes(".data.estado == 'Activo'"));
  assert.ok(block.includes('getAfter(/databases/$(database)/documents/wallets/$(request.auth.uid)).data.last_op_id == bidId'));
  assert.ok(block.includes('request.resource.data.facultad == get(/databases/$(database)/documents/products/$(request.resource.data.product_id)).data.facultad'));
  assert.ok(block.includes('request.resource.data.categoria == get(/databases/$(database)/documents/products/$(request.resource.data.product_id)).data.categoria'));
  assert.ok(block.includes('allow update, delete: if false;'));
});

test('credencial estudiantil queda en documento privado y limitado', () => {
  const block = firestore.slice(firestore.indexOf('match /verificationRequests/{uid}'), firestore.indexOf('match /publicVerifications/{uid}'));
  assert.ok(block.includes('allow read: if owner(uid) || isAdmin();'));
  assert.ok(block.includes('image_data.size() <= 230000'));
  assert.ok(block.includes("resource.data.status in ['pending','rejected']"));
  assert.ok(backend.includes("data:image/"));
});

test('suspensión admin bloquea operaciones de marketplace', () => {
  assert.ok(firestore.includes('function notSuspended()'));
  for (const marker of ['match /products/{productId}', 'match /chats/{chatId}', 'match /reviews/{reviewId}', 'match /bids/{bidId}', 'match /reports/{reportId}']) {
    const start = firestore.indexOf(marker);
    assert.ok(start >= 0, `${marker} no existe`);
    assert.ok(firestore.slice(start, start + 2200).includes('notSuspended()'), `${marker} no consulta suspensión`);
  }
  const status = firestore.slice(firestore.indexOf('match /moderationStatus/{uid}'), firestore.indexOf('match /admins/{uid}'));
  assert.ok(status.includes('allow create, update: if isAdmin()'));
});

test('documento admin no puede crearse desde cliente', () => {
  const block = firestore.slice(firestore.indexOf('match /admins/{uid}'));
  assert.ok(block.includes('allow write: if false;'));
});

test('reportes sólo los crea el usuario autenticado y sólo admin resuelve', () => {
  const block = firestore.slice(firestore.indexOf('match /reports/{reportId}'), firestore.indexOf('match /admins/{uid}'));
  assert.ok(block.includes('request.resource.data.created_by == request.auth.uid'));
  assert.ok(block.includes("request.resource.data.target_type == 'product'"));
  assert.ok(block.includes("request.resource.data.target_type == 'user'"));
  assert.ok(block.includes("request.resource.data.target_type == 'chat'"));
  assert.ok(block.includes('allow update: if isAdmin()'));
});

test('config cliente Firebase puede venir integrada sin incluir credenciales privadas', () => {
  assert.ok(runtime.includes('tutop.firebase.config.v1'));
  assert.ok(runtime.includes('VITE_FIREBASE_API_KEY'));
  assert.ok(runtime.includes("projectId: 'tutop-3a4f7'"));
  assert.ok(!runtime.match(/BEGIN (?:RSA )?PRIVATE KEY/));
  assert.ok(!runtime.includes('private_key_id'));
  assert.ok(!runtime.includes('client_email'));
});

test('registro puede reparar Auth huérfano sin borrar cuentas existentes', () => {
  const registerBlock = backend.slice(backend.indexOf('async register('), backend.indexOf('async login('));
  assert.ok(registerBlock.includes('/EMAIL_EXISTS/i'));
  assert.ok(registerBlock.includes('signInWithPhonePassword'));
  assert.ok(registerBlock.includes('createdAuthIdentity'));
  assert.ok(registerBlock.includes('if (createdAuthIdentity)'));
});

test('sesión Firebase queda aislada por projectId', () => {
  assert.ok(firebaseRest.includes("SESSION_KEY_PREFIX = 'tutop.firebase.session.v2.'"));
  assert.ok(firebaseRest.includes('`${SESSION_KEY_PREFIX}${this.config.projectId}`'));
  assert.ok(firebaseRest.includes('LEGACY_SESSION_KEY'));
});

test('backend online no contiene dataset demo precargado', () => {
  assert.ok(!backend.includes('initialProducts'));
  assert.ok(backend.includes("runQuery<any>('products'"));
  assert.ok(backend.includes("runQuery<any>('chats'"));
});

let failures = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures += 1; console.error(`FAIL ${name}: ${error.message}`); }
}
console.log(`Security regression tests: ${tests.length - failures}/${tests.length} PASS.`);
process.exit(failures ? 1 : 0);

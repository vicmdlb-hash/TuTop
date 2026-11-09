import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { compileTypescriptFixture } from './typescript-fixture-compiler.mjs';
const source=fs.readFileSync('src/services/canonicalOffersBackend.ts','utf8');
assert.match(source,/sameFirebaseSession\(cached\.session, requestSession\)/);
assert.match(source,/sameFirebaseSession\(inflight\.session, requestSession\)/);
assert.match(source,/offerListCache\.set\(key, \{ offers, expiresAt: Date\.now\(\) \+ OFFER_LIST_CACHE_TTL_MS, session: requestSession! \}\)/);
assert.match(source,/offerListInflight\.get\(key\)\?\.promise !== request/);
function fixture(compiled, imports={}) {
  const mod={exports:{}};
  vm.runInNewContext(compiled,{
    module:mod,exports:mod.exports,Date,Promise,
    require(name){
      assert(Object.prototype.hasOwnProperty.call(imports,name),'unrecognized fixture import: '+name);
      return imports[name];
    },
  },{timeout:3000});
  return mod.exports;
}
const guard=fixture(compileTypescriptFixture('src/lib/firebaseSharedSessionGuard.ts'));
let session=null;
const pending=[];
const identity=(uid,epoch)=>({uid,idToken:'synthetic-id-'+epoch,refreshToken:'synthetic-refresh-'+epoch});
class MockFirebaseRestClient {
  constructor(){this.currentSession=session?{...session}:null;}
  runQuery(){
    return new Promise((resolve,reject)=>{
      pending.push({resolve,reject,session:this.currentSession});
    });
  }
}
const backend=fixture(compileTypescriptFixture('src/services/canonicalOffersBackend.ts'),{
  '../lib/offerIdempotency':{OfferIdempotencyWindow:class {}},
  '../lib/transactionRetry':{assertFreshOfferExpiry:()=>{}},
  '../lib/firebaseSharedSessionGuard':guard,
  './firebaseRest':{FirebaseRestClient:MockFirebaseRestClient},
  './nationalBackend':{nationalSchemaEnabled:()=>true},
  './rateLimit':{commitWithRateLimit:()=>{}},
  './runtimeConfig':{getFirebaseConfig:()=>({})},
}).canonicalOffersBackend;
const offer=(id)=>[{id,data:{chat_id:'room',amount_mxn:10}}];
session=identity('A','first');
const warm=backend.listOffersForChat('room');
assert.equal(pending.length,1);
pending[0].resolve(offer('old-A'));
assert.equal((await warm)[0].id,'old-A');
assert.equal((await backend.listOffersForChat('room'))[0].id,'old-A');
assert.equal(pending.length,1,'same session can use a warm cache');
session=identity('A','second');
const newEpoch=backend.listOffersForChat('room');
assert.equal(pending.length,2,'same UID after re-login cannot read old cache');
pending[1].resolve(offer('fresh-A'));
assert.equal((await newEpoch)[0].id,'fresh-A');
const same1=backend.listOffersForChat('pending-room');
const same2=backend.listOffersForChat('pending-room');
assert.equal(pending.length,3,'same epoch must deduplicate pending requests');
pending[2].resolve(offer('shared-A'));
assert.equal((await same1)[0].id,'shared-A');
assert.equal((await same2)[0].id,'shared-A');
session=identity('A','third');
const stale=backend.listOffersForChat('race-room');
assert.equal(pending.length,4);
session=identity('A','fourth');
const latest=backend.listOffersForChat('race-room');
assert.equal(pending.length,5,'new same-UID session must start a new pending request');
pending[4].resolve(offer('fresh-race'));
assert.equal((await latest)[0].id,'fresh-race');
pending[3].resolve(offer('stale-race'));
await assert.rejects(stale,/AUTH_SESSION_CHANGED|STALE_OFFER_READ/);
assert.equal((await backend.listOffersForChat('race-room'))[0].id,'fresh-race');
session=identity('B','first');
const b=backend.listOffersForChat('race-room');
assert.equal(pending.length,6,'different UID must fetch independently');
pending[5].resolve(offer('private-B'));
assert.equal((await b)[0].id,'private-B');
session=null;
await assert.rejects(backend.listOffersForChat('race-room'),/AUTH_REQUIRED/);
console.log('PASS canonical offers cache and inflight are partitioned by UID and exact Firebase session');
console.log('PASS same-UID relogin refreshes cache, stale results rejected, guest denied, A-to-B safe');

// P07 regression: even if a listing/parent/offer preflight was started under
// session A, a subsequent B login must prevent any A-authored offer mutation.
// The transport already enforces this; these assertions also keep the
// application-level preflight from preparing writes after an account switch.
// Synthetic only: no Firebase service, device, or real account is contacted.
const mutationReads = [];
const mutationWrites = [];
let mutationSession = null;
let syntheticOfferId = 0;
class MutationFirebaseRestClient {
  constructor() { this.currentSession = mutationSession ? { ...mutationSession } : null; }
  getDocument(path) {
    return new Promise(resolve => mutationReads.push({ path, resolve }));
  }
  encodeDocumentForWrite(path, data) { return { path, data }; }
  async setDocument(path, data) { mutationWrites.push({ path, data }); }
}
class MutationWindow {
  begin() {
    const id = ++syntheticOfferId;
    return { key: 'synthetic-offer-' + id, offerId: 'synthetic-offer-' + id };
  }
  markSuccess() {}
  markUncertain() {}
  forget() {}
}
const mutationBackend = fixture(compileTypescriptFixture('src/services/canonicalOffersBackend.ts'), {
  '../lib/offerIdempotency': { OfferIdempotencyWindow: MutationWindow },
  '../lib/transactionRetry': { assertFreshOfferExpiry: () => {} },
  '../lib/firebaseSharedSessionGuard': guard,
  './firebaseRest': { FirebaseRestClient: MutationFirebaseRestClient },
  './nationalBackend': { nationalSchemaEnabled: () => true },
  './rateLimit': {
    commitWithRateLimit: async (_client, action, writes) => {
      mutationWrites.push({ action, writes });
    },
  },
  './runtimeConfig': { getFirebaseConfig: () => ({}) },
}).canonicalOffersBackend;
const nextMutationRead = path => {
  const pendingRead = mutationReads.shift();
  assert(pendingRead, 'missing deferred mutation preflight: ' + path);
  assert.equal(pendingRead.path, path);
  return pendingRead;
};
const eligibleListing = {
  id: 'listing-1',
  data: {
    seller_id: 'seller-B', status: 'active',
    moderation_status: 'approved', availability_status: 'available',
  },
};
mutationSession = identity('buyer-A', 'offer-preflight-A');
const staleCreate = mutationBackend.createOffer({
  listingId: 'listing-1', chatId: 'chat-1', sellerId: 'seller-B', amountMxn: 25,
});
const createPreflight = nextMutationRead('listings_v2/listing-1');
mutationSession = identity('buyer-B', 'offer-preflight-B');
createPreflight.resolve(eligibleListing);
await assert.rejects(staleCreate, /AUTH_SESSION_CHANGED/,
  'A offer must not proceed after B becomes the active account');
assert.equal(mutationWrites.length, 0,
  'stale A offer must not reach setDocument or commitWithRateLimit');

mutationSession = identity('buyer-A', 'same-uid-first');
const staleUpdate = mutationBackend.updateOffer('offer-old', 'rejected');
const updatePreflight = nextMutationRead('offers/offer-old');
mutationSession = identity('buyer-A', 'same-uid-second');
updatePreflight.resolve({
  id: 'offer-old',
  data: {
    id: 'offer-old', buyer_id: 'buyer-A', seller_id: 'seller-B',
    created_by: 'seller-B', status: 'pending', chat_id: 'chat-1',
  },
});
await assert.rejects(staleUpdate, /AUTH_SESSION_CHANGED/,
  'same-UID re-login must invalidate offer update preparation');
assert.equal(mutationWrites.length, 0);

const parent = {
  id: 'parent-offer', listing_id: 'listing-1', chat_id: 'chat-1',
  buyer_id: 'seller-B', seller_id: 'buyer-A', created_by: 'seller-B',
  status: 'pending',
};
mutationSession = identity('buyer-A', 'counter-preflight-A');
const staleCounter = mutationBackend.createCounterOffer(parent, 30);
const parentPreflight = nextMutationRead('offers/parent-offer');
mutationSession = identity('buyer-B', 'counter-preflight-B');
parentPreflight.resolve({ id: 'parent-offer', data: { ...parent } });
await assert.rejects(staleCounter, /AUTH_SESSION_CHANGED/,
  'A counteroffer must stop before a second read or any write after B login');
assert.equal(mutationReads.length, 0);
assert.equal(mutationWrites.length, 0);

// Independently test the second async boundary: A may switch accounts after
// the current parent is loaded but before the listing re-check completes.
const validParent = {
  ...parent, buyer_id: 'buyer-A', seller_id: 'seller-B',
};
mutationSession = identity('buyer-A', 'counter-second-preflight-A');
const staleAfterListing = mutationBackend.createCounterOffer(validParent, 31);
nextMutationRead('offers/parent-offer').resolve({
  id: 'parent-offer', data: { ...validParent },
});
// Both assertCurrentPendingParent and createCounterOffer resume from awaits.
// Wait for that complete microtask chain before inspecting the second read.
await new Promise(resolve => setImmediate(resolve));
const listingPreflight = nextMutationRead('listings_v2/listing-1');
mutationSession = identity('buyer-B', 'counter-second-preflight-B');
listingPreflight.resolve(eligibleListing);
await assert.rejects(staleAfterListing, /AUTH_SESSION_CHANGED/,
  'counteroffer must reject account switch while its listing read is pending');
assert.equal(mutationReads.length, 0);
assert.equal(mutationWrites.length, 0,
  'second-read session switch must never reach a write');

mutationSession = identity('buyer-A', 'current-offer-A');
const currentCreate = mutationBackend.createOffer({
  listingId: 'listing-1', chatId: 'chat-1', sellerId: 'seller-B', amountMxn: 25,
});
nextMutationRead('listings_v2/listing-1').resolve(eligibleListing);
const created = await currentCreate;
assert.equal(created.buyer_id, 'buyer-A');
assert.equal(created.status, 'pending');
assert.equal(mutationWrites.length, 1,
  'unchanged authenticated session must still be able to prepare a legitimate offer');
assert.equal(mutationWrites[0].action, 'offer_create');
console.log('PASS offer create/update/counter guards reject stale A→B and same-UID re-login after async reads');
console.log('PASS legitimate offer create remains possible in a stable authenticated session');

// P01/#50 guard: an explicit "available" witness is required. A reserved,
// malformed or missing availability status may never prepare a new offer.
// This preflight is defense in depth, not an atomic trusted-server guarantee.
for (const [availability_status, error] of [
  ['reserved', /LISTING_ALREADY_RESERVED/],
  ['unknown', /LISTING_AVAILABILITY_UNVERIFIED/],
  [undefined, /LISTING_AVAILABILITY_UNVERIFIED/],
]) {
  const attempted = mutationBackend.createOffer({
    listingId: 'listing-1', chatId: 'chat-1',
    sellerId: 'seller-B', amountMxn: 25,
  });
  nextMutationRead('listings_v2/listing-1').resolve({
    ...eligibleListing,
    data: { ...eligibleListing.data, availability_status },
  });
  await assert.rejects(attempted, error);
  assert.equal(mutationWrites.length, 1,
    'non-available listing must not prepare an additional offer write');
}
for (const amountMxn of [-1, 0, 1_000_000.01, Infinity, Number.NaN]) {
  await assert.rejects(mutationBackend.createOffer({
    listingId: 'listing-1', chatId: 'chat-1',
    sellerId: 'seller-B', amountMxn,
  }), /INVALID_OFFER_AMOUNT/);
  await assert.rejects(mutationBackend.createCounterOffer(validParent, amountMxn),
    /INVALID_OFFER_AMOUNT/);
}
assert.equal(mutationReads.length, 0, 'invalid amounts must be refused before network reads');
assert.equal(mutationWrites.length, 1);
console.log('PASS offer admission rejects unknown availability and out-of-bounds amounts without writes');


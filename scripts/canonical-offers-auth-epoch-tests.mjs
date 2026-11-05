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

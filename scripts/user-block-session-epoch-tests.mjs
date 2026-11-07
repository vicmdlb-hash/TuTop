import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { compileTypescriptFixture } from './typescript-fixture-compiler.mjs';

const code=fs.readFileSync('src/services/userBlockBackend.ts','utf8');
assert.match(code,/sameFirebaseSession\(requestSession, client\.currentSession\)/);
assert.match(code,/sameFirebaseSession\(requestSession, new FirebaseRestClient\(getFirebaseConfig\(\)\)\.currentSession\)/);
assert.equal((code.match(/assertCurrent\(\);/g)||[]).length,5,
  'guard read and both write paths before and after a network boundary');

function fixture(compiled,imports){
  const mod={exports:{}};
  vm.runInNewContext(compiled,{
    module:mod,exports:mod.exports,Date,Promise,
    require(name){
      assert(Object.prototype.hasOwnProperty.call(imports,name),'unexpected import: '+name);
      return imports[name];
    }
  },{timeout:3000});
  return mod.exports;
}
const sessionGuard=fixture(compileTypescriptFixture('src/lib/firebaseSharedSessionGuard.ts'),{});
let session=null;
const reads=[],writes=[];
const identity=(uid,epoch)=>({uid,idToken:'id-'+uid+'-'+epoch,refreshToken:'refresh-'+uid+'-'+epoch});
class MockFirebaseRestClient {
  constructor(){this.currentSession=session?{...session}:null;}
  getDocument(path){return new Promise((resolve)=>reads.push({path,resolve}));}
  async setDocument(path,data,options){writes.push({method:'set',path,data,options});}
  async deleteDocument(path){writes.push({method:'delete',path});}
}
const backend=fixture(compileTypescriptFixture('src/services/userBlockBackend.ts'),{
  './firebaseRest':{FirebaseRestClient:MockFirebaseRestClient},
  './runtimeConfig':{getFirebaseConfig:()=>({})},
  './nationalBackend':{nationalSchemaEnabled:()=>true},
  '../lib/firebaseSharedSessionGuard':sessionGuard,
}).userBlockBackend;
session=identity('A','one');
const pendingWrite=backend.setBlocked('B',true);
assert.equal(reads.length,1);
session=identity('A','two'); // same account, different login epoch
reads[0].resolve(null);
await assert.rejects(pendingWrite,/SESSION_CHANGED/);
assert.equal(writes.length,0,'stale same-UID result must not create a block');
const liveWrite=backend.setBlocked('B',true);
assert.equal(reads.length,2);
reads[1].resolve(null);
assert.equal(await liveWrite,true);
assert.equal(writes.length,1);
assert.equal(writes[0].path,'user_blocks/A/targets/B');
const staleRead=backend.isBlocked('B');
session=identity('A','three');
reads[2].resolve({id:'B'});
await assert.rejects(staleRead,/SESSION_CHANGED/);
const pendingUnblock=backend.setBlocked('B',false);
session=identity('C','one');
reads[3].resolve({id:'B'});
await assert.rejects(pendingUnblock,/SESSION_CHANGED/);
assert.equal(writes.length,1,'A-to-C switch must not delete A block');
const freshRead=backend.isBlocked('B');
reads[4].resolve({id:'B'});
assert.equal(await freshRead,true);
const freshUnblock=backend.setBlocked('B',false);
reads[5].resolve({id:'B'});
assert.equal(await freshUnblock,false);
assert.deepEqual(writes.map(x=>x.method),['set','delete']);
await assert.rejects(backend.isBlocked('C'),/USER_BLOCK_TARGET_INVALID/);
session=null;
await assert.rejects(backend.isBlocked('B'),/AUTH_REQUIRED/);
console.log('PASS block read/write rejects same-UID relogin and cross-user stale results');
console.log('PASS no stale block or unblock mutation; exact fresh session behavior preserved');

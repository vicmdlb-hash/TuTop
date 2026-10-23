import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the actual cache/event implementation in a synthetic web runtime.
const source = fs.readFileSync('src/lib/nearbyMarketplace.ts','utf8');
const js = ts.transpileModule(source,{fileName:'nearbyMarketplace.ts',
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const backing = new Map();
const events = [];
const listeners = new Map();
const localStorage = {
  getItem:k=>backing.get(k)??null,
  setItem:(k,v)=>backing.set(k,v),
  removeItem:k=>backing.delete(k),
};
const window = {
  dispatchEvent(ev) { events.push(ev); (listeners.get(ev.type)||[]).forEach(fn=>fn(ev)); },
  addEventListener(type, fn) { listeners.set(type,[...(listeners.get(type)||[]),fn]); },
};
class SyntheticCustomEvent {
  constructor(type, options) { this.type=type;this.detail=options.detail; }
}
const pendingPositions = [];
const navigator = { geolocation:{
  getCurrentPosition(success) { pendingPositions.push(success); }
}};
const module = {exports:{}};
vm.runInNewContext(js,{
  module,exports:module.exports,require(name){
    assert.equal(name,'../services/nativeDeviceCapabilities');
    return {isNativeDeviceRuntime:()=>false};
  },localStorage,window,CustomEvent:SyntheticCustomEvent,navigator,
  Date,Math,JSON,Number,String,Promise,Set,console,URLSearchParams,
},{timeout:2500});
const lib = module.exports;
const A='synthetic-user-A', B='synthetic-user-B';
const key='tutop.approx-location.v1';
const loc=lib.toApproxLocation(19.314,-98.251);
assert(loc);
backing.set(key,JSON.stringify(loc)); // legacy unscoped cache cannot cross to anyone
assert.equal(lib.getCachedApproxLocation(A),null);
assert.equal(lib.getCachedApproxLocation(B),null);
lib.saveApproxLocation(loc,A);
assert.equal(JSON.parse(backing.get(key)).owner_uid,A);
assert.equal(events.at(-1).detail.owner_uid,A,'event must be identity scoped');
assert.equal(lib.getCachedApproxLocation(B),null,'B cannot use cached A location');
assert.equal(lib.getCachedApproxLocation(A).latitude,19.31);

let acceptedForB=0;
window.addEventListener(lib.NEARBY_LOCATION_EVENT, ev=>{
 if(ev.detail?.owner_uid===B) acceptedForB++;
});
lib.saveApproxLocation(loc,A);
window.dispatchEvent(new SyntheticCustomEvent(lib.NEARBY_LOCATION_EVENT,{detail:loc}));
assert.equal(acceptedForB,0,'old/unscoped event must not be delivered as B');

// Emulate A starting a location request just before logout and B logging in.
const late=lib.requestApproxLocation({ownerUid:A,requestPermission:true});
assert.equal(pendingPositions.length,1);
pendingPositions[0]({coords:{latitude:19.318,longitude:-98.257}});
await late;
assert.equal(events.at(-1).detail.owner_uid,A,'late A geolocation stays A-scoped');
assert.equal(acceptedForB,0);
assert.equal(lib.getCachedApproxLocation(B),null);
lib.saveApproxLocation(loc,B);
assert.equal(acceptedForB,1,'B should accept its own event');
lib.clearApproxLocation(A);
assert.equal(lib.getCachedApproxLocation(B)?.longitude,-98.25,'A logout cannot erase B cache');
lib.clearApproxLocation(B);
assert.equal(lib.getCachedApproxLocation(B),null);

// Full consumer contracts prevent cross-account UI dispatch and stale async hydration.
for(const path of ['src/components/ProductCard.tsx','src/components/ExploreScreen.tsx']){
 const src=fs.readFileSync(path,'utf8');
 assert.match(src,/detail\?\.owner_uid === user\.id|detail\?\.owner_uid !== user\.id/);
 assert.match(src,/\[user\.id\]/);
 assert.match(src,/set(?:ViewerLocation|Location)\(getCachedApproxLocation\(user\.id\)\)/);
}
const h=fs.readFileSync('src/components/V2NearbyListingsHydrator.tsx','utf8');
assert.match(h,/location\.owner_uid !== useAppStore\.getState\(\)\.user\.id/);
assert.match(h,/useAppStore\.getState\(\)\.user\.id !== requestUid/);
console.log('PASS real Nearby cache/events isolate A/B and stale A async callbacks; no device or Firebase usage');

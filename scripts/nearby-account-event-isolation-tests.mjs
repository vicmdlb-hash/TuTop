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

// Emulate A location request followed by logout (even with absent cache).
let currentUid=A;
const late=lib.requestApproxLocation({ownerUid:A,requestPermission:true,
  isOwnerActive:()=>currentUid===A});
assert.equal(pendingPositions.length,1);
lib.clearApproxLocation(A); // cancels pending A even if another user now owns storage
currentUid=B;
lib.saveApproxLocation(loc,B);
const beforeLateEvents=events.length;
pendingPositions[0]({coords:{latitude:19.318,longitude:-98.257}});
assert.equal(await late,null,'late request after logout cannot return A position');
assert.equal(events.length,beforeLateEvents,'late A request must not emit location');
assert.equal(lib.getCachedApproxLocation(A),null,'late A must not restore cache');
assert.equal(lib.getCachedApproxLocation(B)?.longitude,-98.25,'A cannot overwrite B cache');
assert.equal(acceptedForB,1,'B should accept its own event');

// A->B can also happen through a shared-session change without clear().
// The live UID predicate must reject the stale account's late response.
const noLogout=lib.requestApproxLocation({ownerUid:A,requestPermission:true,
  isOwnerActive:()=>currentUid===A});
assert.equal(pendingPositions.length,2);
pendingPositions[1]({coords:{latitude:19.31,longitude:-98.25}});
assert.equal(await noLogout,null,'different live owner must reject stale result');
assert.equal(lib.getCachedApproxLocation(B)?.longitude,-98.25);

// Current B is allowed to obtain and use its own approximate location.
const active=lib.requestApproxLocation({ownerUid:B,requestPermission:true,
  isOwnerActive:()=>currentUid===B});
assert.equal(pendingPositions.length,3);
pendingPositions[2]({coords:{latitude:19.318,longitude:-98.257}});
assert((await active)?.latitude===19.32);
assert.equal(events.at(-1).detail.owner_uid,B);
assert.equal(acceptedForB,2);
lib.clearApproxLocation(A);
assert.equal(lib.getCachedApproxLocation(B)?.longitude,-98.26,'A cleanup cannot erase B location');
lib.clearApproxLocation(B);
assert.equal(lib.getCachedApproxLocation(B),null);

// Full consumer contracts prevent cross-account UI dispatch and stale async hydration.
for(const path of ['src/components/ProductCard.tsx','src/components/ExploreScreen.tsx']){
 const src=fs.readFileSync(path,'utf8');
 assert.match(src,/detail\?\.owner_uid === user\.id|detail\?\.owner_uid !== user\.id/);
 assert.match(src,/\[user\.id\]/);
 assert.match(src,/set(?:ViewerLocation|Location)\(getCachedApproxLocation\(user\.id\)\)/);
}
const feed=fs.readFileSync('src/components/Feed.tsx','utf8');
const explore=fs.readFileSync('src/components/ExploreScreen.tsx','utf8');
assert.match(feed,/isOwnerActive:\s*\(\) => useAppStore\.getState\(\)\.user\.id === requestUid/);
assert.match(feed,/setSearchHistory\(readAccountLocalList\(ACCOUNT_LOCAL_KEYS\.searchHistory, user\.id, 6\)\)/);
assert.match(explore,/isOwnerActive:\s*\(\) => useAppStore\.getState\(\)\.user\.id === requestUid/);
assert.match(explore,/if \(useAppStore\.getState\(\)\.user\.id !== requestUid\) return;/);
assert.match(explore,/setLocationBusy\(false\);/);
assert.match(explore,/setNearbyBusy\(false\);/);
const publish=fs.readFileSync('src/components/NationalPublishScreen.tsx','utf8');
assert.match(publish,/ownerUid: requestUid, isOwnerActive: stillCurrent/);
assert.match(publish,/locationRequestSerial\.current === requestSerial/);
assert.match(publish,/useAppStore\.getState\(\)\.user\.id === requestUid/);
assert.match(publish,/if \(!stillCurrent\(\)\) return;/);
assert.match(publish,/const removeListingLocation = \(\) => \{\s*locationRequestSerial\.current \+= 1;/);
assert.match(publish,/useEffect\(\(\) => \(\) => \{ locationRequestSerial\.current \+= 1; \}, \[user\.id\]\)/);
const h=fs.readFileSync('src/components/V2NearbyListingsHydrator.tsx','utf8');
assert.match(h,/location\.owner_uid !== useAppStore\.getState\(\)\.user\.id/);
assert.match(h,/useAppStore\.getState\(\)\.user\.id !== requestUid/);

const exploreFreshness=fs.readFileSync('src/components/ExploreScreen.tsx','utf8');
assert.match(exploreFreshness,/document\.addEventListener\('visibilitychange', onForeground\)/);
assert.match(exploreFreshness,/window\.addEventListener\('focus', onForeground\)/);
assert.match(exploreFreshness,/Date\.now\(\) - lastRequested < 60_000/);
assert.match(exploreFreshness,/setNearbyProducts\(\[\]\);[\s\S]*setNearbyRefreshKey\(\(current\) => current \+ 1\)/);
assert.match(exploreFreshness,/document\.removeEventListener\('visibilitychange', onForeground\)/);
console.log('PASS real Nearby cache/events isolate A/B and stale A async callbacks; no device or Firebase usage');

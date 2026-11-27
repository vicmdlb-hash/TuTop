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

const offline = await import(`${pathToFileURL(path.resolve('src/lib/offlineQueue.ts')).href}?t=${Date.now()}`);
const perf = await import(`${pathToFileURL(path.resolve('src/lib/performanceBudget.ts')).href}?t=${Date.now()}`);

const now = new Date('2026-09-05T20:00:00.000Z');
let queue = offline.enqueueOfflineAction([], { id: 'a1', type: 'favorite_add', entity_id: 'p1', payload: { listing_id: 'p1' } }, now);
assert.equal(queue.length, 1);
queue = offline.enqueueOfflineAction(queue, { id: 'a2', type: 'favorite_add', entity_id: 'p1', payload: { listing_id: 'p1', source: 'feed' } }, now);
assert.equal(queue.length, 1);
assert.equal(queue[0].id, 'a2');
assert.throws(() => offline.enqueueOfflineAction(queue, { id: 'bad', type: 'listing_draft_save', entity_id: 'd1', payload: { email: 'x@example.com' } }, now), /SENSITIVE_DATA/);
assert.throws(() => offline.enqueueOfflineAction(queue, { id: 'bad2', type: 'listing_draft_save', entity_id: 'd2', payload: { nested: { refresh_token: 'secret' } } }, now), /SENSITIVE_DATA/);
const failed = offline.markOfflineActionFailed(queue[0], now);
assert.equal(failed.attempts, 1);
assert.ok(Date.parse(failed.next_attempt_at) > now.getTime());
assert.equal(offline.OFFLINE_QUEUE_LIMITS.sensitive_chat_messages_cached, false);
assert.equal(offline.OFFLINE_QUEUE_LIMITS.credentials_cached, false);

assert.equal(perf.networkProfile({ online: false }), 'offline');
assert.equal(perf.networkProfile({ online: true, effectiveType: '3g' }), 'slow');
assert.equal(perf.networkProfile({ online: true, saveData: true }), 'slow');
assert.equal(perf.networkProfile({ online: true, effectiveType: '4g' }), 'normal');
assert.equal(perf.feedPageSize('slow'), 12);
assert.equal(perf.feedPageSize('normal'), 24);
assert.equal(perf.shouldPreloadSecondaryImages('slow'), false);
assert.equal(perf.shouldPreloadSecondaryImages('normal'), true);
assert.equal(perf.retryableHttpStatus(429), true);
assert.equal(perf.retryableHttpStatus(400), false);
assert.equal(perf.shouldPaginateCollection(25, 'feed'), true);
assert.equal(perf.shouldPaginateCollection(24, 'feed'), false);
assert.equal(perf.PERFORMANCE_BUDGET.max_listing_photos_compat, 4);

console.log('PASS offline queue deduplicates and caps non-sensitive work');
console.log('PASS PII, chat content and auth secrets are forbidden offline');
console.log('PASS low-data network profile reduces feed work and image preloading');
console.log('PASS pagination and retry budgets are explicit');
console.log('Offline/performance contracts: PASS');


// R262/R274: run the real worker in an isolated VM; no browser storage or network.
const { readFileSync } = await import('node:fs');
const { runInNewContext } = await import('node:vm');
const workerSource = readFileSync('public/sw.js', 'utf8');
const handlers = new Map();
const cacheNames = new Set(['tutop-shell-v1','unrelated-app-cache']);
let skipCount=0, claimCount=0;
const deleted=[];
runInNewContext(workerSource,{
  self:{
    addEventListener:(name,fn)=>{assert(!handlers.has(name));handlers.set(name,fn);},
    skipWaiting:async()=>{skipCount++;},
    clients:{claim:async()=>{claimCount++;}},
  },
  caches:{
    delete:async name=>{deleted.push(name);return cacheNames.delete(name);},
    open:()=>assert.fail('worker must not open caches'),
    keys:()=>assert.fail('worker must not enumerate or sweep caches'),
    match:()=>assert.fail('worker must not serve cached data'),
  },
  fetch:()=>assert.fail('worker must not intercept network requests'),
});
const lifecycle=async name=>{
  let pending;
  assert(handlers.has(name));
  handlers.get(name)({waitUntil:p=>{assert.equal(pending,undefined);pending=p;}});
  assert(pending);await pending;
};
await lifecycle('install');
assert.equal(skipCount,1);assert.deepEqual(deleted,[]);
await lifecycle('activate');
assert.equal(claimCount,1);assert.deepEqual(deleted,['tutop-shell-v1']);
assert(cacheNames.has('unrelated-app-cache'));assert(!cacheNames.has('tutop-shell-v1'));
assert.equal(handlers.has('fetch'),false);
for(const request of [
  {method:'GET',url:'https://tutop.invalid/api/private'},
  {method:'GET',url:'https://tutop.invalid/auth-action?oobCode=synthetic'},
  {method:'GET',url:'https://tutop.invalid.example.invalid/api'},
  {method:'GET',url:'https://tutop.invalid/tutop-icon.svg'},
  {method:'POST',url:'https://tutop.invalid/api/private'},
]){
  // No fetch listener: all request classes keep browser-native network behavior.
  let intercepts=0;
  handlers.get('fetch')?.({request,respondWith:()=>{intercepts++;}});
  assert.equal(intercepts,0);
}
const mainSource=readFileSync('src/main.tsx','utf8');
const registerBlock=mainSource.match(/    const registerWorker = [^\n]+\n    if \(document\.readyState === 'complete'\) registerWorker\(\);\n    else window\.addEventListener\('load', registerWorker, \{ once: true \}\);/);
assert(registerBlock,'registration block missing');
assert.match(mainSource,/if \('serviceWorker' in navigator && import\.meta\.env\.PROD\)/);
for(const readyState of ['complete','loading','interactive']){
  let calls=0,listener;
  runInNewContext(registerBlock[0],{
    navigator:{serviceWorker:{register:async url=>{assert.equal(url,'/sw.js');calls++;}}},
    document:{readyState},
    window:{addEventListener:(name,fn,opts)=>{assert.equal(name,'load');assert.equal(opts.once,true);assert.equal(listener,undefined);listener=fn;}},
    console:{warn:()=>assert.fail('unexpected registration failure')},
  });
  if(readyState==='complete'){assert.equal(listener,undefined);assert.equal(calls,1);}
  else{assert.equal(calls,0);assert(listener);listener();assert.equal(calls,1);}
}
console.log('PASS synthetic PWA worker network-only lifecycle and late-load registration');

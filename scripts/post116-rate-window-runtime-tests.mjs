import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source=fs.readFileSync('src/services/rateLimit.ts','utf8').replace(/
/g,'
');
const js=stripTypeScriptTypes(source.replace(/^import .*;
/gm,''))
  .replace(/export type RateLimitAction[sS]*?;

/,'')
  .replace(/export async function/g,'async function');
const factory=new Function(js+'; return {buildRateLimitWrite,commitWithRateLimit};');
const api=factory();

function clientHarness(existing, behavior) {
  const commits=[];
  return {
    client:{
      currentSession:{uid:'u1'},
      async getDocument(){ return typeof existing==='function'?existing():existing; },
      encodeDocumentForWrite(path,data){ return {path,data}; },
      async commit(writes){
        const rate=writes.at(-1);
        commits.push(rate);
        return behavior(rate,commits.length);
      },
    },
    commits,
  };
}

function modeOf(rate) {
  const transforms=(rate.updateTransforms||[]).map(x=>x.fieldPath);
  if(transforms.includes('window_start')) return 'reset';
  return 'increment';
}

{
  const h=clientHarness(null,()=>({ok:true}));
  await api.commitWithRateLimit(h.client,'listing_create',[{listing:true}],new Date('2099-01-01T00:00:00Z'));
  assert.equal(h.commits.length,1);
  assert.equal(modeOf(h.commits[0]),'reset');
  assert.deepEqual(h.commits[0].update.data,{uid:'u1',action:'listing_create',count:1});
  assert.deepEqual(h.commits[0].updateTransforms.map(x=>x.fieldPath),['window_start','updated_at']);
}

{
  const existing={data:{uid:'u1',action:'listing_create',count:2,window_start:'2026-09-19T17:00:00.000Z'},updateTime:'v1'};
  const h=clientHarness(existing,()=>({ok:true}));
  await api.commitWithRateLimit(h.client,'listing_create',[{listing:true}],new Date('1900-01-01T00:00:00Z'));
  assert.equal(h.commits.length,1);
  assert.equal(modeOf(h.commits[0]),'increment');
  assert.equal(h.commits[0].update.data.count,3);
  assert.equal(h.commits[0].update.data.window_start.toISOString(),'2026-09-19T17:00:00.000Z');
  assert.deepEqual(h.commits[0].updateTransforms.map(x=>x.fieldPath),['updated_at']);
}

{
  const existing={data:{uid:'u1',action:'listing_create',count:2,window_start:'2026-09-19T10:00:00.000Z'},updateTime:'v1'};
  const h=clientHarness(existing,(rate)=>{
    if(modeOf(rate)==='increment') throw new Error('PERMISSION_DENIED');
    return {ok:true};
  });
  await api.commitWithRateLimit(h.client,'listing_create',[{listing:true}],new Date('1900-01-01T00:00:00Z'));
  assert.deepEqual(h.commits.map(modeOf),['increment','reset']);
  assert.equal(h.commits[1].update.data.count,1);
}

{
  const existing={data:{uid:'u1',action:'listing_create',count:2,window_start:'2026-09-19T10:00:00.000Z'},updateTime:'v1'};
  const h=clientHarness(existing,(rate,index)=>{
    if(index<3) throw new Error('Missing or insufficient permissions');
    return {ok:true};
  });
  await api.commitWithRateLimit(h.client,'listing_create',[{listing:true}]);
  assert.deepEqual(h.commits.map(modeOf),['increment','reset','increment']);
}

{
  const existing={data:{uid:'u1',action:'listing_create',count:2,window_start:'2026-09-19T17:00:00.000Z'},updateTime:'v1'};
  const h=clientHarness(existing,()=>{throw new Error('NETWORK_DOWN');});
  await assert.rejects(api.commitWithRateLimit(h.client,'listing_create',[{listing:true}]),/NETWORK_DOWN/);
  assert.equal(h.commits.length,1);
}

{
  const h=clientHarness(null,()=>{throw new Error('PERMISSION_DENIED');});
  await assert.rejects(api.commitWithRateLimit(h.client,'listing_create',[{listing:true}]),/PERMISSION_DENIED/);
  assert.equal(h.commits.length,1,'new-bucket permission error must not be retried as a fake rollover');
}

console.log('PASS new bucket uses REQUEST_TIME and ignores caller clock');
console.log('PASS existing bucket increments without consulting device wall clock');
console.log('PASS server denial selects REQUEST_TIME reset for expired window');
console.log('PASS concurrent rollover can alternate back to increment once');
console.log('PASS unrelated errors do not cause rollover retries');

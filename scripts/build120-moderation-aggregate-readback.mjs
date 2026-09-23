import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const BRANCH='ops/build120-moderation-readback';
if(process.env.GITHUB_REF_NAME!==BRANCH)throw new Error('READBACK_BRANCH_REQUIRED');
if(process.env.TUTOP_FIREBASE_PROJECT_ID!==PROJECT)throw new Error('STAGING_PROJECT_REQUIRED');

const token=await firebaseCiAccessToken();
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json','X-Goog-User-Project':PROJECT};
const root=`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

async function request(url,options={},includeQuotaProject=true){
  const requestHeaders={...headers,...(options.headers||{})};
  if(!includeQuotaProject) delete requestHeaders['X-Goog-User-Project'];
  const response=await fetch(url,{...options,headers:requestHeaders});
  const text=await response.text();let body={};
  try{body=text?JSON.parse(text):{}}catch{}
  if(!response.ok)throw new Error('HTTP_'+response.status);
  return body;
}
function value(v){if(typeof v==='string')return {stringValue:v};if(typeof v==='boolean')return {booleanValue:v};throw new Error('unsupported');}
async function count(collectionId,filters=[]){
  const where=filters.length===0?undefined:filters.length===1
    ?{fieldFilter:{field:{fieldPath:filters[0].field},op:'EQUAL',value:value(filters[0].value)}}
    :{compositeFilter:{op:'AND',filters:filters.map(f=>({fieldFilter:{field:{fieldPath:f.field},op:'EQUAL',value:value(f.value)}}))}};
  const body={structuredAggregationQuery:{aggregations:[{alias:'count',count:{}}],structuredQuery:{from:[{collectionId}],...(where?{where}:{})}}};
  const rows=await request(root+':runAggregationQuery',{method:'POST',body:JSON.stringify(body)});
  const raw=rows?.[0]?.result?.aggregateFields?.count?.integerValue||'0';
  return Number(raw);
}
const billing=await request('https://cloudbilling.googleapis.com/v1/projects/'+PROJECT+'/billingInfo',{},false);
if(billing.billingEnabled===true)throw new Error('SPEND_ZERO_BILLING_ENABLED');

const result={
  status:'PASS',
  project:PROJECT,
  mutation:false,
  spend:0,
  admins_total:await count('admins'),
  admins_active:await count('admins',[{field:'active',value:true}]),
  listings_total:await count('listings_v2'),
  listings_pending:await count('listings_v2',[{field:'moderation_status',value:'pending'}]),
  listings_approved:await count('listings_v2',[{field:'moderation_status',value:'approved'}]),
  verification_requests_total:await count('verificationRequests'),
  verification_requests_pending:await count('verificationRequests',[{field:'status',value:'pending'}]),
  users_total:await count('users'),
  auth_status_total:await count('auth_status'),
};
console.log(JSON.stringify(result,null,2));
console.log('PASS aggregate-only moderation/admin readback; no PII and no mutation.');

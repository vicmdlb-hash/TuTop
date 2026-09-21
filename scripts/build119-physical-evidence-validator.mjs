import fs from 'node:fs';

const candidate=JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_CANDIDATE_BUILD119.json','utf8'));
const required=['install_boot','react_product_detail_no_crash','topi_real_firebase_ai','notification_permission_granted','notification_token_registered','publication_historical_path'];
const allowed=new Set(['pending','pass','warn','fail']);
const forbiddenKeys=new Set(['password','idToken','refreshToken','FIREBASE_TOKEN','fcmToken','appCheckToken','otp']);

function scan(value,path=[],errors=[]){
  if(Array.isArray(value)){value.forEach((v,i)=>scan(v,[...path,String(i)],errors));return errors;}
  if(value&&typeof value==='object'){
    for(const [k,v] of Object.entries(value)){
      if(forbiddenKeys.has(k))errors.push('forbidden_field:'+[...path,k].join('.'));
      scan(v,[...path,k],errors);
    }
    return errors;
  }
  if(typeof value==='string'){
    if(/[A-Za-z0-9_-]{120,}/.test(value))errors.push('possible_raw_token:'+path.join('.'));
    if(/\b\d{10,13}\b/.test(value))errors.push('possible_phone_or_hardware_id:'+path.join('.'));
  }
  return errors;
}
function placeholder(v){return !String(v??'').trim()||/PENDING|PENDIENTE|TODO|TBD|\|/.test(String(v));}

export function validateBuild119DeviceA(bundle){
  const errors=scan(bundle);
  const warnings=[];
  const c=bundle?.candidate||{};
  const bindings=[
    ['artifact_name',candidate.artifact_name],
    ['artifact_id',candidate.artifact_id],
    ['build_run_id',candidate.build_run_id],
    ['build_commit_sha',candidate.build_commit_sha],
    ['build_tree_sha',candidate.build_tree_sha],
    ['apk_name',candidate.apk_name],
    ['apk_sha256',candidate.apk_sha256],
    ['apk_signing_cert_sha1',candidate.apk_signing_cert_sha1],
  ];
  if(bundle?.schema!=='tutop.build119-device-a-evidence.v1')errors.push('schema');
  if(bundle?.app_version!==candidate.app_version)errors.push('app_version');
  if(bundle?.environment!=='staging')errors.push('environment');
  for(const [field,expected] of bindings)if(c[field]!==expected)errors.push('candidate_mismatch:'+field);

  const statuses=[];
  for(const key of required){
    const status=bundle?.causal_cases?.[key];
    if(!allowed.has(status))errors.push('invalid_case:'+key);
    statuses.push(status);
  }

  if(bundle?.device?.physical===true){
    for(const field of ['label','manufacturer','model','android_version','installation']){
      if(placeholder(bundle?.device?.[field]))errors.push('device_placeholder:'+field);
    }
  }else{
    warnings.push('not_physical_yet');
  }

  const failed=statuses.filter(x=>x==='fail').length;
  const warned=statuses.filter(x=>x==='warn').length;
  const pending=statuses.filter(x=>x==='pending').length;
  const causal_result=errors.length||failed?'fail':pending||warned?'pending':'pass';

  return {
    causal_result,
    build119_failures_cleared:causal_result==='pass'&&bundle?.device?.physical===true,
    full_release_blocked:true,
    failed_cases:failed,
    warned_cases:warned,
    pending_cases:pending,
    errors,
    warnings,
  };
}

if(import.meta.url===new URL('file://'+process.argv[1]).href){
  const file=process.argv[2]||'docs/PHYSICAL_QA_DEVICE_A_BUILD119.json';
  const bundle=JSON.parse(fs.readFileSync(file,'utf8'));
  const result=validateBuild119DeviceA(bundle);
  console.log(JSON.stringify(result,null,2));
  if(result.errors.length)process.exitCode=2;
}

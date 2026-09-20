import fs from 'node:fs';
import crypto from 'node:crypto';

const CANDIDATE_SHA='a578a214f17f3a0ddb7c0d8c6039866f0252c015';
const PROJECT='tutop-beta-vicmdlb-1356585881';

function read(path){return fs.existsSync(path)?fs.readFileSync(path,'utf8'):''}
function sha256(s){return crypto.createHash('sha256').update(s).digest('hex')}
function bool(v){return v===true}
async function probe(url){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const r=await fetch(url,{redirect:'follow',signal:controller.signal,headers:{'User-Agent':'TuTop-Candidate117-Release-Audit'}});
    const text=await r.text();
    return {
      url,
      status:r.status,
      ok:r.ok,
      final_url:r.url,
      content_type:r.headers.get('content-type')||'',
      bytes:Buffer.byteLength(text),
      sha256:sha256(text),
      has_tutop:/TuTop/i.test(text),
      has_privacy:/Privacidad de TuTop|Privacidad · TuTop/i.test(text),
      has_delete:/Eliminación de cuenta|Eliminar cuenta · TuTop/i.test(text),
      has_beta_draft:/borrador beta|No es una política legal aprobada/i.test(text),
      has_noindex:/name=["']robots["'][^>]*noindex/i.test(text),
    };
  }catch(error){
    return {url,status:null,ok:false,error:String(error?.name||error)};
  }finally{clearTimeout(timer)}
}

if(process.env.GITHUB_ACTIONS!=='true') throw new Error('GITHUB_ACTIONS_REQUIRED');
if(process.env.GITHUB_REF_NAME!=='ops/candidate117-release-readiness-audit') throw new Error('OPS_BRANCH_REQUIRED');
if(process.env.TUTOP_CANDIDATE117_BASE_SHA!==CANDIDATE_SHA) throw new Error('CANDIDATE_SHA_REQUIRED');

const privacy=read('public/privacy.html');
const deletion=read('public/delete-account.html');
const project=JSON.parse(read('config/project.json'));
const gitignore=read('.gitignore');
const workflows=fs.readdirSync('.github/workflows').filter(x=>x.endsWith('.yml')||x.endsWith('.yaml'))
  .map(name=>({name,content:read('.github/workflows/'+name)}));
const workflowText=workflows.map(x=>x.content).join('\n');
const packageJson=JSON.parse(read('package.json'));

const urls=[
  'https://'+PROJECT+'.web.app/privacy.html',
  'https://'+PROJECT+'.web.app/delete-account.html',
  'https://'+PROJECT+'.firebaseapp.com/privacy.html',
  'https://'+PROJECT+'.firebaseapp.com/delete-account.html',
];
const probes=[];
for(const url of urls) probes.push(await probe(url));

const manifest=read('android/app/src/main/AndroidManifest.xml');
const gradle=read('android/app/build.gradle');

const permissions=[...manifest.matchAll(/<uses-permission[^>]+android:name=["']([^"']+)["']/g)].map(m=>m[1]).sort();
const releaseBlockMatch=gradle.match(/release\s*\{([\s\S]*?)\n\s*\}/);
const releaseBlock=releaseBlockMatch?.[1]||'';

const report={
  audit:'candidate117-release-readiness',
  candidate_sha:CANDIDATE_SHA,
  ops_sha:process.env.GITHUB_SHA,
  mutation_count:0,
  deploy_count:0,
  artifact_build_count:0,
  source:{
    privacy_exists:!!privacy,
    privacy_explicit_beta_draft:/No es una política legal aprobada para publicación/i.test(privacy),
    privacy_last_review_build117:/build117|Candidate117/i.test(privacy),
    deletion_exists:!!deletion,
    deletion_noindex:/name=["']robots["'][^>]*noindex/i.test(deletion),
    deletion_mentions_authenticated_in_app_path:/Perfil.+Eliminar cuenta y datos/is.test(deletion),
    deletion_says_legal_review_pending:/validarse jurídicamente|revisión legal/i.test(deletion),
    current_distribution_target:project.distributionTarget,
    future_distribution_target:project.futureDistributionTarget,
    production_publishing_allowed:bool(project.productionPublishingAllowed),
    billing_allowed:bool(project.billingAllowed),
    package_private:packageJson.private===true,
  },
  public_url_probes:probes,
  android:{
    manifest_exists:!!manifest,
    permissions,
    target_has_coarse_location:permissions.includes('android.permission.ACCESS_COARSE_LOCATION'),
    target_has_fine_location:permissions.includes('android.permission.ACCESS_FINE_LOCATION'),
    target_has_background_location:permissions.includes('android.permission.ACCESS_BACKGROUND_LOCATION'),
    target_has_record_audio:permissions.includes('android.permission.RECORD_AUDIO'),
    target_has_camera_permission:permissions.includes('android.permission.CAMERA'),
    gradle_exists:!!gradle,
    release_block_present:!!releaseBlock,
    release_signing_config_present:/signingConfig\s+/i.test(releaseBlock)||/signingConfigs\s*\{/i.test(gradle),
  },
  release_pipeline:{
    workflows_scanned:workflows.length,
    bundle_release_reference:/bundleRelease|bundle[A-Z][A-Za-z]*Release/i.test(workflowText),
    assemble_release_reference:/assembleRelease/i.test(workflowText),
    play_upload_reference:/play.*upload|upload.*play|google-play|playConsole|play-console/i.test(workflowText),
    signing_reference:/signingConfig|key\.properties|keystore|\.jks/i.test(workflowText),
    secret_files_gitignored:[
      '*.jks','*.keystore','android/key.properties','google-play*.json'
    ].every(token=>gitignore.includes(token)),
  },
};
report.classification={
  privacy_policy:'SOURCE_DRAFT_NOT_APPROVED',
  deletion_web_resource:probes.some(p=>p.ok&&p.has_delete&&!p.has_noindex)?'PUBLIC_RESOURCE_PROVEN':'PUBLIC_RESOURCE_NOT_PROVEN',
  data_safety:'ENGINEERING_PREFLIGHT_ONLY',
  aab_pipeline:report.release_pipeline.bundle_release_reference?'PRESENT':'NOT_PRESENT',
  release_signing:report.android.release_signing_config_present||report.release_pipeline.signing_reference?'PARTIAL_OR_PRESENT':'NOT_CONFIGURED',
  play_publish:report.source.production_publishing_allowed?'ALLOWED':'BLOCKED_BY_PROJECT_CONFIG',
};
fs.mkdirSync('candidate117-release-audit',{recursive:true});
fs.writeFileSync('candidate117-release-audit/audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));

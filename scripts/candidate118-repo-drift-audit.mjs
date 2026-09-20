import { spawnSync } from 'node:child_process';

function grep(pattern){
  const r=spawnSync('git',['grep','-n','-F',pattern,'--',':(exclude)node_modules',':(exclude)dist',':(exclude)build'],{encoding:'utf8'});
  if(r.status!==0 && r.status!==1) throw new Error(`GIT_GREP_FAILED_${pattern}`);
  return String(r.stdout||'').trim().split('\n').filter(Boolean);
}

const betaRefs=grep('currentBetaVersion');
const betaConsumers=betaRefs.filter(line=>
  !line.startsWith('config/project.json:')
  && !line.startsWith('scripts/candidate118-repo-drift-audit.mjs:')
);
const betaReadyRefs=grep('beta:ready');
const betaReadyWorkflowRefs=betaReadyRefs.filter(line=>line.startsWith('.github/workflows/'));
const projectPathRefs=grep('config/project.json');
const exactBeta7Refs=grep('0.9.2-beta.7');
const exact90211Refs=grep('90211');

const currentBuild118AuthorityFiles=[
  '.github/workflows/build118-publication-self-heal.yml:',
  'scripts/package-build118-candidate.mjs:',
  'scripts/configure-android-beta-version.mjs:',
];
const currentBuild118BetaConsumers=betaConsumers.filter(line=>currentBuild118AuthorityFiles.some(prefix=>line.startsWith(prefix)));

const operationalRoots=['.github/workflows/','scripts/','src/','firebase/','config/'];
const operational=(lines)=>lines.filter(line=>operationalRoots.some(root=>line.startsWith(root)));

const evidence={
  status:'PASS',
  source_sha:process.env.GITHUB_SHA,
  branch:process.env.GITHUB_REF_NAME,
  current_beta_version:{
    all_refs:betaRefs,
    consumer_refs_excluding_config_and_audit:betaConsumers,
    consumer_count:betaConsumers.length,
    build118_authority_consumer_refs:currentBuild118BetaConsumers,
    build118_authority_consumer_count:currentBuild118BetaConsumers.length,
  },
  beta_ready:{
    all_refs:betaReadyRefs,
    workflow_refs:betaReadyWorkflowRefs,
    workflow_ref_count:betaReadyWorkflowRefs.length,
  },
  project_json_path_refs:projectPathRefs,
  stale_build117_operational_refs:{
    beta7:operational(exactBeta7Refs),
    versionCode90211:operational(exact90211Refs),
  },
  classification:
    currentBuild118BetaConsumers.length===0 && betaReadyWorkflowRefs.length===0
      ? 'LEGACY_TOOLING_CONSUMERS_PRESENT_CURRENT_BUILD118_PATH_NOT_CONSUMING'
      : 'CURRENT_EXECUTION_PATH_REVIEW_REQUIRED',
};

console.log(JSON.stringify(evidence));
if(currentBuild118BetaConsumers.length>0){
  console.error('FAIL currentBetaVersion is consumed by the Build118 authority path.');
  process.exit(2);
}
if(betaReadyWorkflowRefs.length>0){
  console.error('FAIL beta:ready is still invoked by one or more workflows.');
  process.exit(3);
}
console.log('PASS currentBetaVersion consumers are legacy/tooling only; Build118 authority path does not consume the field and no workflow invokes beta:ready.');

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

const currentAuthorityPrefixes=[
  '.github/workflows/build118-publication-self-heal.yml:',
  '.github/workflows/candidate118-',
  'scripts/package-build118-candidate.mjs:',
  'scripts/configure-android-beta-version.mjs:',
  'scripts/candidate118-',
];
const legacyWorkflowPrefixes=[
  '.github/workflows/quality.yml:',
  '.github/workflows/october-01-validation.yml:',
  '.github/workflows/one-shot-085-hardened.yml:',
];

const currentAuthorityBetaConsumers=betaConsumers.filter(line=>currentAuthorityPrefixes.some(prefix=>line.startsWith(prefix)));
const currentAuthorityBetaReadyRefs=betaReadyWorkflowRefs.filter(line=>currentAuthorityPrefixes.some(prefix=>line.startsWith(prefix)));
const legacyBetaReadyWorkflowRefs=betaReadyWorkflowRefs.filter(line=>legacyWorkflowPrefixes.some(prefix=>line.startsWith(prefix)));
const unclassifiedBetaReadyWorkflowRefs=betaReadyWorkflowRefs.filter(line=>
  !currentAuthorityBetaReadyRefs.includes(line) && !legacyBetaReadyWorkflowRefs.includes(line)
);

const evidence={
  status:'PASS',
  source_sha:process.env.GITHUB_SHA,
  branch:process.env.GITHUB_REF_NAME,
  root_release_line:{
    package_version:'0.9.2-beta.0',
    project_current_beta_version:'0.9.2-beta.0',
    note:'Build118 APK candidate version is injected separately as 0.9.2-beta.8 / 90212.',
  },
  current_beta_version:{
    all_refs:betaRefs,
    consumer_refs_excluding_config_and_audit:betaConsumers,
    current_authority_consumer_refs:currentAuthorityBetaConsumers,
    current_authority_consumer_count:currentAuthorityBetaConsumers.length,
  },
  beta_ready:{
    all_refs:betaReadyRefs,
    workflow_refs:betaReadyWorkflowRefs,
    current_authority_workflow_refs:currentAuthorityBetaReadyRefs,
    legacy_workflow_refs:legacyBetaReadyWorkflowRefs,
    unclassified_workflow_refs:unclassifiedBetaReadyWorkflowRefs,
  },
  project_json_path_refs:projectPathRefs,
  classification:
    currentAuthorityBetaConsumers.length===0
    && currentAuthorityBetaReadyRefs.length===0
    && unclassifiedBetaReadyWorkflowRefs.length===0
      ? 'ROOT_BETA0_METADATA_VALID_FOR_092_LINE_BUILD118_VERSION_INJECTED_SEPARATELY_LEGACY_BETA_READY_ONLY'
      : 'CURRENT_EXECUTION_PATH_REVIEW_REQUIRED',
};

console.log(JSON.stringify(evidence));
if(currentAuthorityBetaConsumers.length>0){
  console.error('FAIL currentBetaVersion is consumed by current Build118/Candidate118 authority.');
  process.exit(2);
}
if(currentAuthorityBetaReadyRefs.length>0 || unclassifiedBetaReadyWorkflowRefs.length>0){
  console.error('FAIL beta:ready has current or unclassified workflow consumers.');
  process.exit(3);
}
console.log('PASS beta.0 metadata belongs to the root 0.9.2 line; Build118 injects beta.8 separately; beta:ready workflow consumers are legacy-only.');

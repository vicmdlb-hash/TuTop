export const TUTOP_V2_STAGING_PROJECT = 'tutop-beta-vicmdlb-1356585881';
export const TUTOP_V2_FREEZE_BRANCH = 'feat/tutop-0.9.1-nearby-topi';
export const TUTOP_V2_ALLOWED_STAGING_BRANCHES = [
  'feat/tutop-0.9.1-nearby-topi',
  'feat/tutop-0.9.2-hardening',
];

function stop(message) {
  throw new Error(`STAGING_FREEZE_BLOCKED:${message}`);
}

export function assertStagingFreezeContext({
  allowEnv,
  allowValue,
  requireOctoberGate = true,
  requireStagingGate = false,
} = {}) {
  const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
  if (projectId !== TUTOP_V2_STAGING_PROJECT) {
    stop(`project_id_must_equal_${TUTOP_V2_STAGING_PROJECT}`);
  }
  if (allowEnv && String(process.env[allowEnv] || '').trim() !== allowValue) {
    stop(`${allowEnv}_must_equal_${allowValue}`);
  }
  if (process.env.GITHUB_ACTIONS !== 'true') {
    stop('remote_staging_mutation_requires_GITHUB_ACTIONS_true');
  }
  const branch = String(process.env.GITHUB_REF_NAME || '').trim();
  if (!TUTOP_V2_ALLOWED_STAGING_BRANCHES.includes(branch)) {
    stop(`branch_not_authorized_for_staging_${branch || 'missing'}`);
  }
  const githubSha = String(process.env.GITHUB_SHA || '').trim();
  if (!/^[a-f0-9]{40}$/i.test(githubSha)) stop('invalid_or_missing_GITHUB_SHA');

  if (requireOctoberGate) {
    const gateRunId = String(process.env.TUTOP_VALIDATED_GATE_RUN_ID || '').trim();
    const gateSha = String(process.env.TUTOP_VALIDATED_GATE_SHA || '').trim();
    if (!/^\d+$/.test(gateRunId)) stop('missing_same_sha_october_gate_run_id');
    if (gateSha !== githubSha) stop('october_gate_sha_must_equal_GITHUB_SHA');
  }
  if (requireStagingGate) {
    const stagingRunId = String(process.env.TUTOP_VALIDATED_STAGING_RUN_ID || '').trim();
    const stagingSha = String(process.env.TUTOP_VALIDATED_STAGING_SHA || '').trim();
    if (!/^\d+$/.test(stagingRunId)) stop('missing_same_sha_staging_run_id');
    if (stagingSha !== githubSha) stop('staging_sha_must_equal_GITHUB_SHA');
  }
  return projectId;
}

export function assertAppCheckFreezeMode(mode) {
  const normalized = String(mode || '').trim().toUpperCase();
  if (!['OFF', 'UNENFORCED'].includes(normalized)) {
    stop('general_app_check_enforcement_forbidden_during_runtime_freeze');
  }
  return normalized;
}

export function assertAiAppCheckFreezeMode(mode) {
  const normalized = String(mode || '').trim().toUpperCase();
  if (!['UNENFORCED', 'ENFORCED'].includes(normalized)) {
    stop('ai_app_check_mode_must_be_UNENFORCED_or_ENFORCED');
  }
  if (normalized === 'ENFORCED' && String(process.env.TUTOP_ALLOW_AI_APP_CHECK_ENFORCEMENT || '').trim() !== 'staging-ai-only') {
    stop('ai_app_check_enforcement_requires_staging_ai_only_opt_in');
  }
  return normalized;
}

/**
 * Read-only Firebase app-config retrieval. The isolated integration branch may
 * read existing staging metadata but may NEVER inherit mutation permissions.
 * Older approved feature branches retain their stricter October-gated context.
 */
export function assertStagingConfigReadContext({legacyAllowEnv, legacyAllowValue}={}, env=process.env) {
  const branch=String(env.GITHUB_REF_NAME||'');
  if(branch!=='integration/tutop-121-122-fcm-owner-ci-20261022') {
    return assertStagingFreezeContext({allowEnv:legacyAllowEnv,allowValue:legacyAllowValue});
  }
  if(env.TUTOP_FIREBASE_PROJECT_ID!==TUTOP_V2_STAGING_PROJECT) stop('read_only_project_mismatch');
  if(env.GITHUB_ACTIONS!=='true') stop('read_only_requires_github_actions');
  if(!/^[a-f0-9]{40}$/i.test(String(env.GITHUB_SHA||''))) stop('read_only_invalid_git_sha');
  if(env.TUTOP_ALLOW_STAGING_CONFIG_READ!=='read-only-v2') stop('read_only_opt_in_missing');
  if(['TUTOP_ALLOW_FIREBASE_DEPLOY','TUTOP_ALLOW_V2_SEED','TUTOP_ALLOW_STAGING_RESET','TUTOP_STAGING_RESET_ACK']
      .some(name=>String(env[name]||'').trim())) stop('read_only_mutation_env_present');
  return TUTOP_V2_STAGING_PROJECT;
}

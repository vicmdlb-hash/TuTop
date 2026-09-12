export const TUTOP_V2_STAGING_PROJECT = 'tutop-beta-vicmdlb-1356585881';
export const TUTOP_V2_FREEZE_BRANCH = 'feat/tutop-0.9.1-nearby-topi';

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
  if (branch !== TUTOP_V2_FREEZE_BRANCH) {
    stop(`branch_must_equal_${TUTOP_V2_FREEZE_BRANCH}`);
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
    stop('app_check_enforcement_forbidden_during_runtime_freeze');
  }
  return normalized;
}

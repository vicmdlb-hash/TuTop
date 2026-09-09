export const TUTOP_V2_STAGING_PROJECT = 'tutop-beta-vicmdlb-1356585881';

function stop(message) {
  throw new Error(`STAGING_FREEZE_BLOCKED:${message}`);
}

export function assertStagingFreezeContext({
  allowEnv,
  allowValue,
  requireOctoberGate = true,
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
  if (requireOctoberGate) {
    const gateRunId = String(process.env.TUTOP_VALIDATED_GATE_RUN_ID || '').trim();
    if (!/^\d+$/.test(gateRunId)) stop('missing_same_sha_october_gate_run_id');
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

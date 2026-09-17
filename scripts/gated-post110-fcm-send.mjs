import { spawnSync } from 'node:child_process';
import { assertStagingFreezeContext, TUTOP_POST110_FCM_BRANCH } from './staging-freeze-guard.mjs';

assertStagingFreezeContext({
  allowEnv: 'TUTOP_ALLOW_V2_MAINTENANCE',
  allowValue: 'staging-v2',
  requireOctoberGate: false,
  requireStagingGate: false,
});

const branch = String(process.env.GITHUB_REF_NAME || '').trim();
if (branch !== TUTOP_POST110_FCM_BRANCH) throw new Error(`POST110_FCM_BRANCH_REQUIRED:${branch || 'missing'}`);

const runId = String(process.env.TUTOP_VALIDATED_FCM_RUN_ID || '').trim();
const validatedSha = String(process.env.TUTOP_VALIDATED_FCM_SHA || '').trim();
const githubSha = String(process.env.GITHUB_SHA || '').trim();
if (!/^\d+$/.test(runId)) throw new Error('POST110_FCM_VALIDATION_RUN_REQUIRED');
if (validatedSha !== githubSha) throw new Error('POST110_FCM_VALIDATION_SHA_MUST_EQUAL_GITHUB_SHA');

const result = spawnSync(process.execPath, ['scripts/post110-fcm-sender.mjs', '--apply'], {
  stdio: 'inherit',
  shell: false,
  env: process.env,
});

process.exit(result.status ?? 1);

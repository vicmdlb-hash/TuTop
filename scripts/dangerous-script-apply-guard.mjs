import path from 'node:path';
import { assertStagingFreezeContext } from './staging-freeze-guard.mjs';

const applyPolicies = {
  'seed-v2-catalog.mjs': {
    allowEnv: 'TUTOP_ALLOW_V2_SEED',
    allowValue: 'staging-v2',
    requireStagingGate: false,
  },
  'reconcile-v2-reservations.mjs': {
    allowEnv: 'TUTOP_ALLOW_V2_RECONCILE',
    allowValue: 'staging-v2',
    requireStagingGate: true,
  },
  'v2-trusted-maintenance.mjs': {
    allowEnv: 'TUTOP_ALLOW_V2_MAINTENANCE',
    allowValue: 'staging-v2',
    requireStagingGate: true,
  },
  'v2-observability-snapshot.mjs': {
    allowEnv: 'TUTOP_ALLOW_V2_OBSERVABILITY',
    allowValue: 'staging-v2',
    requireStagingGate: true,
  },
};

const entrypoint = path.basename(String(process.argv[1] || '').trim());
const policy = applyPolicies[entrypoint];

if (policy && process.argv.includes('--apply')) {
  assertStagingFreezeContext(policy);
}

export const GUARDED_RAW_APPLY_ENTRYPOINTS = Object.freeze(Object.keys(applyPolicies));

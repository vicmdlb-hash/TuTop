import assert from 'node:assert/strict';
import {assertStagingConfigReadContext} from './staging-freeze-guard.mjs';
const base={GITHUB_ACTIONS:'true',GITHUB_REF_NAME:'integration/tutop-121-122-fcm-owner-ci-20261022',GITHUB_SHA:'a'.repeat(40),TUTOP_FIREBASE_PROJECT_ID:'tutop-beta-vicmdlb-1356585881',TUTOP_ALLOW_STAGING_CONFIG_READ:'read-only-v2'};
assert.equal(assertStagingConfigReadContext({},base),base.TUTOP_FIREBASE_PROJECT_ID);
for(const changes of [{GITHUB_ACTIONS:'false'},{GITHUB_SHA:'x'},{GITHUB_REF_NAME:'main'},{TUTOP_FIREBASE_PROJECT_ID:'tutop-3a4f7'},{TUTOP_ALLOW_STAGING_CONFIG_READ:''},{TUTOP_ALLOW_FIREBASE_DEPLOY:'staging-v2'},{TUTOP_STAGING_RESET_ACK:'DELETE_ALL_BETA_ACCOUNTS'}])
 assert.throws(()=>assertStagingConfigReadContext({}, {...base,...changes}),/STAGING_FREEZE_BLOCKED/);
console.log('PASS integration branch read-only Firebase metadata is SHA/project/branch gated with no mutation authorization');

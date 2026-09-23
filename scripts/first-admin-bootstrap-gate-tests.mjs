import assert from 'node:assert/strict';
import { validateFirstAdminBootstrap } from './first-admin-bootstrap-gate-lib.mjs';

const base={projectId:'tutop-beta-vicmdlb-1356585881',uid:'uid_12345678',role:'moderator',institutionId:'',adminsActive:0,authUserExists:true,profileExists:true};

assert.deepEqual(validateFirstAdminBootstrap({...base,apply:false,ack:''}),{ok:true,code:'DRY_RUN_READY'});
assert.deepEqual(validateFirstAdminBootstrap({...base,apply:true,ack:''}),{ok:false,code:'EXACT_ACK_REQUIRED'});
assert.deepEqual(validateFirstAdminBootstrap({...base,apply:true,ack:'BOOTSTRAP_FIRST_STAGING_ADMIN:uid_12345678:moderator:-'}),{ok:true,code:'APPLY_AUTHORIZED'});

const scoped={...base,role:'institution_moderator',institutionId:'uatx'};
assert.deepEqual(validateFirstAdminBootstrap({...scoped,apply:true,ack:'BOOTSTRAP_FIRST_STAGING_ADMIN:uid_12345678:institution_moderator:uatx'}),{ok:true,code:'APPLY_AUTHORIZED'});
assert.equal(validateFirstAdminBootstrap({...base,role:'institution_moderator',institutionId:''}).code,'INSTITUTION_SCOPE_REQUIRED');
assert.equal(validateFirstAdminBootstrap({...base,role:'owner'}).code,'MODERATION_ROLE_REQUIRED');
assert.equal(validateFirstAdminBootstrap({...base,role:'super_admin'}).code,'MODERATION_ROLE_REQUIRED');
assert.equal(validateFirstAdminBootstrap({...base,institutionId:'uatx'}).code,'INSTITUTION_SCOPE_NOT_ALLOWED');
assert.equal(validateFirstAdminBootstrap({...base,adminsActive:1,apply:true,ack:'BOOTSTRAP_FIRST_STAGING_ADMIN:uid_12345678:moderator:-'}).code,'FIRST_ADMIN_ALREADY_EXISTS');
assert.equal(validateFirstAdminBootstrap({...base,authUserExists:false}).code,'AUTH_USER_REQUIRED');
assert.equal(validateFirstAdminBootstrap({...base,profileExists:false}).code,'PROFILE_REQUIRED');
assert.equal(validateFirstAdminBootstrap({...base,projectId:'production'}).code,'STAGING_PROJECT_REQUIRED');

console.log('PASS first-admin bootstrap is fail-closed to explicit moderator/institution_moderator roles');
console.log('PASS institution_moderator requires explicit institution scope and moderator forbids hidden scope');
console.log('PASS apply requires an exact UID + role + scope bound ACK');

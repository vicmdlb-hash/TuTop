import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nationalAcademicMetadata, validateBetaAcademicCatalog } from '../src/lib/nationalAcademicMetadata.ts';

assert.deepEqual(nationalAcademicMetadata({}), {});
assert.deepEqual(nationalAcademicMetadata({
  institution_id: 'uatx', institution_name: 'Universidad Autonoma de Tlaxcala',
  campus_id: 'huamantla', campus_name: 'Huamantla',
}), {
  institution_id: 'uatx', institution_name: 'Universidad Autonoma de Tlaxcala',
  campus_id: 'huamantla', campus_name: 'Huamantla',
});
for (const candidate of [
  { institution_id: 'uatx' },
  { campus_id: 'huamantla' },
  { institution_name: 'Universidad ficticia' },
  { institution_id: 'national', institution_name: 'Dummy', campus_id: 'dummy', campus_name: 'Dummy' },
  { institution_id: 'uatx', institution_name: 'Universidad', campus_id: 'no-campus', campus_name: 'Campus' },
  { institution_id: 'uatx', institution_name: 'Universidad', campus_id: 'huamantla' },
]) {
  assert.throws(() => nationalAcademicMetadata(candidate));
}
const betaInstitutions = [{id:'uatx',name:'UATx',active:true}, {id:'unam',name:'UNAM',active:true}];
const betaCampuses = [
  {id:'riberena',institution_id:'uatx',name:'Ribereña',active:true},
  {id:'unam-cu',institution_id:'unam',name:'Ciudad Universitaria',active:true},
  {id:'inactive',institution_id:'uatx',name:'Inactivo',active:false},
];
const realPair = {institution_id:'uatx',institution_name:'UATx',campus_id:'riberena',campus_name:'Ribereña'};
assert.doesNotThrow(() => validateBetaAcademicCatalog(realPair,betaInstitutions,betaCampuses));
for (const candidate of [
  {...realPair,campus_id:'not-in-catalog'},
  {...realPair,campus_id:'unam-cu',campus_name:'Ciudad Universitaria'},
  {...realPair,campus_id:'inactive',campus_name:'Inactivo'},
  {...realPair,institution_name:'UNAM'},
]) assert.throws(() => validateBetaAcademicCatalog(candidate,betaInstitutions,betaCampuses),/ACADEMIC_CATALOG_/);
// National metadata is PREPARED, not an active public-signup bypass.
// The existing registration and Firestore catalog validation remain in effect.
const register = fs.readFileSync('src/services/verifiedEmailBetaAuth.ts', 'utf8');
assert.match(register, /UNIVERSITY_IDENTITY_REQUIRED/);
assert.match(register, /nationalAcademicMetadata\(profile\)/);
assert.match(register, /\.\.\.academicMetadata/);
assert.doesNotMatch(register, /institution_id: profile\.institution_id,/);
assert.doesNotMatch(register, /campus_id: profile\.campus_id,/);
const policy = JSON.parse(fs.readFileSync('config/tutop-national-product-direction.json', 'utf8'));
assert.equal(policy.verification.publicRegistrationWithDualFactor, 'BLOCKED_UNTIL_REAL_PHONE_PROOF');
assert.equal(policy.release.releaseApproved, false);
console.log('PASS nation-wide metadata: optional, no fake academic IDs, existing live registration still gated');

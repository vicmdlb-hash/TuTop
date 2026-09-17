export const STAGING='tutop-beta-vicmdlb-1356585881';
// Release PATCH changes the server reference. Device installation is a separate
// coordinated gate; Firebase offers no cross-device transaction or release CAS.
export async function promoteVerifiedRules({api,project=STAGING,source,expectedRuleset,apply=false,deviceInstalled=false,exclusiveWindow=false,validated=false,record=()=>{}}){
 if(project!==STAGING)throw new Error('STAGING_ONLY');
 if(!validated)throw new Error('REGRESSION_REQUIRED');
 if(!source?.includes('email_verified == true')||!source.includes('email_password_verified_beta'))throw new Error('VERIFIED_RULES_REQUIRED');
 if(apply&&(!deviceInstalled||!exclusiveWindow))throw new Error('DEVICE_AND_EXCLUSIVE_WINDOW_REQUIRED');
 const billing=await api.billing();if(billing.billingEnabled!==false)throw new Error('SPEND_ZERO_REQUIRED');
 const original=await api.release();if(original.rulesetName!==expectedRuleset)throw new Error('RELEASE_DRIFT');
 const rollback=await api.ruleset(original.rulesetName);record({phase:'rollback_saved',original,rollback});
 const candidate=await api.createRuleset(source);record({phase:'compiled',candidate});
 if(!apply)return {status:'COMPILED_NOT_RELEASED',candidate:candidate.name,rollback:original.rulesetName};
 const before=await api.release();if(before.rulesetName!==original.rulesetName)throw new Error('RELEASE_DRIFT');
 let attempted=false;
 try{
  attempted=true;await api.patch(candidate.name);
  const after=await api.release();if(after.rulesetName!==candidate.name)throw new Error('RELEASE_READBACK_MISMATCH');
  await api.verify();record({phase:'verified',candidate});
  return {status:'BACKEND_RELEASE_VERIFIED_DEVICE_EVIDENCE_PENDING',candidate:candidate.name,rollback:original.rulesetName};
 }catch(error){
  if(attempted){const current=await api.release();
   if(current.rulesetName===candidate.name){await api.patch(original.rulesetName);const restored=await api.release();if(restored.rulesetName!==original.rulesetName)throw new Error('ROLLBACK_READBACK_FAILED');record({phase:'rolled_back',original});}
   else if(current.rulesetName!==original.rulesetName)throw new Error('CONCURRENT_RELEASE_REQUIRES_REVIEW');
  }throw error;
 }
}

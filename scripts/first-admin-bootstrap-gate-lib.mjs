const MODERATION_ROLES = new Set(['moderator','institution_moderator']);

export function validateFirstAdminBootstrap(input) {
  const projectId=String(input.projectId||'').trim();
  const uid=String(input.uid||'').trim();
  const role=String(input.role||'').trim();
  const institutionId=String(input.institutionId||'').trim();
  const ack=String(input.ack||'').trim();
  const apply=input.apply===true;
  const adminsActive=Number(input.adminsActive||0);
  const authUserExists=input.authUserExists===true;
  const profileExists=input.profileExists===true;

  if(projectId!=='tutop-beta-vicmdlb-1356585881') return {ok:false,code:'STAGING_PROJECT_REQUIRED'};
  if(!/^[A-Za-z0-9_-]{8,160}$/.test(uid)) return {ok:false,code:'VALID_UID_REQUIRED'};
  if(!MODERATION_ROLES.has(role)) return {ok:false,code:'MODERATION_ROLE_REQUIRED'};
  if(role==='institution_moderator'&&!/^[A-Za-z0-9_-]{2,120}$/.test(institutionId)) return {ok:false,code:'INSTITUTION_SCOPE_REQUIRED'};
  if(role==='moderator'&&institutionId) return {ok:false,code:'INSTITUTION_SCOPE_NOT_ALLOWED'};
  if(!authUserExists) return {ok:false,code:'AUTH_USER_REQUIRED'};
  if(!profileExists) return {ok:false,code:'PROFILE_REQUIRED'};
  if(adminsActive!==0) return {ok:false,code:'FIRST_ADMIN_ALREADY_EXISTS'};
  const expectedAck=`BOOTSTRAP_FIRST_STAGING_ADMIN:${uid}:${role}:${institutionId||'-'}`;
  if(apply&&ack!==expectedAck) return {ok:false,code:'EXACT_ACK_REQUIRED'};
  return {ok:true,code:apply?'APPLY_AUTHORIZED':'DRY_RUN_READY'};
}

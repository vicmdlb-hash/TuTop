const HOST='https://tutop-beta-vicmdlb-1356585881.web.app';

async function fetchText(path){
  const response=await fetch(HOST+path,{redirect:'error',headers:{'Cache-Control':'no-cache'}});
  const text=await response.text();
  if(!response.ok) throw new Error(`PUBLIC_WEB_HTTP_${response.status}:${path}`);
  return {response,text};
}

const privacy=await fetchText('/privacy.html');
if(!/Privacidad de TuTop/i.test(privacy.text)) throw new Error('PRIVACY_PAGE_MARKER_MISSING');
if(!/No es una política legal aprobada para publicación/i.test(privacy.text)) throw new Error('PRIVACY_LEGAL_PENDING_MARKER_MISSING');
if(!/eliminación de una cuenta TuTop/i.test(privacy.text)) throw new Error('PRIVACY_DELETION_LINK_MARKER_MISSING');

const deletion=await fetchText('/delete-account.html');
if(!/Solicitar eliminación de mi cuenta TuTop/i.test(deletion.text)) throw new Error('DELETE_PAGE_MARKER_MISSING');
if(!/delete-account\.js/i.test(deletion.text)) throw new Error('DELETE_PAGE_SCRIPT_MISSING');
const deletionCache=String(deletion.response.headers.get('cache-control')||'').toLowerCase();
if(!deletionCache.includes('no-store')) throw new Error('DELETE_PAGE_CACHE_UNSAFE');

const deletionJs=await fetchText('/delete-account.js');
if(!/accounts:signInWithPassword/.test(deletionJs.text)) throw new Error('DELETE_JS_AUTH_FLOW_MISSING');
if(!/account_deletion_requests/.test(deletionJs.text)) throw new Error('DELETE_JS_REQUEST_FLOW_MISSING');
if(/accounts:delete|batchDelete|deleteDocument/.test(deletionJs.text)) throw new Error('DELETE_JS_DESTRUCTIVE_CLIENT_PATH_PRESENT');

const auth=await fetchText('/auth-action.html');
if(!/Acción de cuenta TuTop/i.test(auth.text)) throw new Error('AUTH_ACTION_PAGE_MARKER_MISSING');
const authCache=String(auth.response.headers.get('cache-control')||'').toLowerCase();
if(!authCache.includes('no-store')) throw new Error('AUTH_ACTION_CACHE_UNSAFE');

console.log(JSON.stringify({
  status:'PASS',
  host:HOST,
  privacy_public:true,
  deletion_public:true,
  deletion_authenticated_request_flow:true,
  deletion_client_destructive_delete:false,
  auth_action_public:true,
  mutation:false,
  spend:0,
  production:false,
},null,2));
console.log('PASS staging public privacy/deletion/auth pages are externally reachable with expected safety markers.');

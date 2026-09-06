import fs from 'node:fs';

const path = 'firebase/firestore.v2.generated.rules';
let rules = fs.readFileSync(path, 'utf8');

function replaceOnce(from, to, label) {
  const count = rules.split(from).length - 1;
  if (count !== 1) {
    console.error(`DETENIDO: ${label} esperaba 1 coincidencia y encontró ${count}.`);
    process.exit(2);
  }
  rules = rules.replace(from, to);
}

const loose = `      allow update: if canSupportAppeals()
        && request.resource.data.uid == uid
        && request.resource.data.requested_at == resource.data.requested_at
        && request.resource.data.status in ['pending','processing','completed','rejected']
        && fresh(request.resource.data.updated_at);`;

const strict = `      allow update: if canSupportAppeals()
        && request.resource.data.uid == uid
        && request.resource.data.requested_at == resource.data.requested_at
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status','updated_at'])
        && (
          (resource.data.status == 'pending' && request.resource.data.status in ['processing','rejected'])
          || (resource.data.status == 'processing' && request.resource.data.status in ['completed','rejected'])
        )
        && fresh(request.resource.data.updated_at);`;

replaceOnce(loose, strict, 'account deletion transition');

replaceOnce(
  '      allow read: if globalModerationAdmin() || institutionModeratorFor(resource.data);',
  "      allow read: if globalModerationAdmin() || institutionModeratorFor(resource.data) || (canSupportAppeals() && ('target_type' in resource.data) && resource.data.target_type == 'account_deletion_request');",
  'support deletion audit read scope',
);

replaceOnce(
  "      allow create: if isAdmin() && request.resource.data.admin_uid == request.auth.uid && (globalModerationAdmin() || institutionModeratorFor(request.resource.data)) && fresh(request.resource.data.created_at);",
  "      allow create: if isAdmin() && request.resource.data.admin_uid == request.auth.uid && (globalModerationAdmin() || institutionModeratorFor(request.resource.data) || (canSupportAppeals() && ('target_type' in request.resource.data) && request.resource.data.target_type == 'account_deletion_request')) && fresh(request.resource.data.created_at);",
  'support deletion audit create scope',
);

fs.writeFileSync(path, rules);
console.log('✅ Account operations rules: transiciones irreversibles + auditoría limitada a solicitudes de eliminación.');

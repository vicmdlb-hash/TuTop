import fs from 'node:fs';

const path = 'firebase/firestore.v2.generated.rules';
let rules = fs.readFileSync(path, 'utf8');

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

const count = rules.split(loose).length - 1;
if (count !== 1) {
  console.error(`DETENIDO: account deletion hardener esperaba 1 coincidencia y encontró ${count}.`);
  process.exit(2);
}

rules = rules.replace(loose, strict);
fs.writeFileSync(path, rules);
console.log('✅ Account operations rules: transiciones de eliminación irreversibles y auditables.');

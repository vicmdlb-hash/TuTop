import fs from 'node:fs';
import path from 'node:path';

const projectId = String(process.argv[2] || process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
if (!/^[a-z][a-z0-9-]{4,29}$/.test(projectId)) {
  console.error('Uso: npm run firebase:link -- <project-id>');
  console.error('El projectId debe ser el ID exacto creado en Firebase Console, no sólo el nombre visible.');
  process.exit(2);
}
const target = path.join(process.cwd(), '.firebaserc');
if (fs.existsSync(target) && process.env.TUTOP_OVERWRITE_FIREBASE_RC !== '1') {
  console.error('.firebaserc ya existe. Revisa su contenido o define TUTOP_OVERWRITE_FIREBASE_RC=1 conscientemente.');
  process.exit(2);
}
fs.writeFileSync(target, `${JSON.stringify({ projects: { default: projectId } }, null, 2)}\n`);
console.log(`✅ Firebase project vinculado localmente: ${projectId}`);
console.log('Siguiente (Spark): registrar únicamente una app Web, habilitar Email/Password y Firestore, y copiar el firebaseConfig público en .env.local o pegarlo en TuTop al iniciar.');
console.log('La beta REST actual NO necesita google-services.json, Cloud Storage, Cloud Functions ni una app Android de Firebase.');

import assert from 'node:assert/strict';
import fs from 'node:fs';

const privacy = fs.readFileSync('public/privacy.html','utf8');
const controls = fs.readFileSync('src/components/NationalAccountControls.tsx','utf8');
const deletion = fs.readFileSync('public/delete-account.html','utf8');

assert.match(privacy, /No es una política legal aprobada para publicación/);
assert.match(privacy, /Firebase Cloud Messaging/);
assert.match(privacy, /Firebase AI Logic/);
assert.match(privacy, /ubicación aproximada/);
assert.match(privacy, /correo real y estado de verificación/);
assert.match(privacy, /revisión legal/);
assert.match(privacy, /\/delete-account\.html/);
assert.doesNotMatch(privacy, /no se usan Cloud Storage, Cloud Functions ni notificaciones push/);
assert.doesNotMatch(privacy, /número sirve para crear una identidad de acceso/);

assert.match(controls, /href="\/privacy\.html"/);
assert.match(controls, /href="\/delete-account\.html"/);
assert.match(controls, /La revisión legal final sigue pendiente/);
assert.match(controls, /Eliminar cuenta y datos/);

assert.match(deletion, /Perfil → Notificaciones y privacidad V2 → Eliminar cuenta y datos/);
assert.match(deletion, /ejecución destructiva no se dispara automáticamente/);

console.log('PASS privacy draft reflects current build110 technical surfaces without claiming legal approval');
console.log('PASS profile exposes privacy and deletion information in-app');
console.log('PASS account-deletion request remains an authenticated in-app action');

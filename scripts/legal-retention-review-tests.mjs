import fs from 'node:fs';
import assert from 'node:assert/strict';

const doc = fs.readFileSync('docs/LEGAL_RETENTION_REVIEW_TEMPLATE_0.9.md', 'utf8');
const lifecycle = fs.readFileSync('src/lib/privacyDataLifecycle.ts', 'utf8');
const legalPlayGate = fs.readFileSync('docs/LEGAL_RETENTION_REVIEW_DOSSIER_0.9.md', 'utf8');
assert.match(legalPlayGate, /Evidencia normativa contrastada: alcance infantil, cuenta y datos/);
for (const required of [
  'answer/9893335', 'answer/16302250', 'answer/10144311',
  'answer/13327111', 'PENDIENTE CLASIFICACIÓN',
  'no acceso real de menores', 'E1 sigue OPEN', 'E2 permanece HOLD',
]) {
  assert(legalPlayGate.includes(required), 'Gate Play/legal faltante: ' + required);
}
console.log('PASS Play minors/deletion release classification remains explicitly unresolved');

for (const token of ['Base legal','Plazo de retención','Evento de inicio del plazo','Excepciones / litigio / fraude','Responsable de aprobar']) assert(doc.includes(token), `Falta campo legal: ${token}`);
for (const collection of ['users','user_private','device_tokens','listings_v2','demand_requests','transactions_v2','listing_reservation_locks','offers','chats','reviews','reports','audit_log','account_deletion_requests']) assert(doc.includes(`\`${collection}\``), `Falta colección legal: ${collection}`);
assert((doc.match(/PENDIENTE LEGAL/g) || []).length >= 20, 'La plantilla debe conservar placeholders legales explícitos');
assert.doesNotMatch(doc, /\b(?:30|60|90|180|365)\s+d[ií]as\b/i, 'Ingeniería no debe inventar plazos legales');
assert.match(doc, /No convertir ningún `PENDIENTE LEGAL` en un valor inventado/);
console.log('PASS legal review matrix contains all decision fields');
console.log('PASS critical collections including reservation locks are represented');
console.log('PASS no retention duration is invented by engineering');
console.log('Legal retention review contract: PASS');

assert.doesNotMatch(lifecycle, /retention_days:\s*(?:30|60|90|180|365)\b/, 'Engineering lifecycle helper must not invent legal retention durations');
console.log('PASS lifecycle helper leaves legal retention duration external');

import fs from 'node:fs';
import assert from 'node:assert/strict';

const doc = fs.readFileSync('docs/LEGAL_RETENTION_REVIEW_TEMPLATE_0.9.md', 'utf8');
for (const token of ['Base legal','Plazo de retención','Evento de inicio del plazo','Excepciones / litigio / fraude','Responsable de aprobar']) assert(doc.includes(token), `Falta campo legal: ${token}`);
for (const collection of ['users','user_private','device_tokens','listings_v2','demand_requests','transactions_v2','offers','chats','reviews','reports','audit_log','account_deletion_requests']) assert(doc.includes(`\`${collection}\``), `Falta colección legal: ${collection}`);
assert((doc.match(/PENDIENTE LEGAL/g) || []).length >= 20, 'La plantilla debe conservar placeholders legales explícitos');
assert.doesNotMatch(doc, /\b(?:30|60|90|180|365)\s+d[ií]as\b/i, 'Ingeniería no debe inventar plazos legales');
assert.match(doc, /No convertir ningún `PENDIENTE LEGAL` en un valor inventado/);
console.log('PASS legal review matrix contains all decision fields');
console.log('PASS critical collections are represented');
console.log('PASS no retention duration is invented by engineering');
console.log('Legal retention review contract: PASS');

import assert from 'node:assert/strict';
import fs from 'node:fs';
const dossier = fs.readFileSync('docs/LEGAL_RETENTION_REVIEW_DOSSIER_0.9.md', 'utf8');
for (const term of ['users', 'device_tokens', 'Verificación universitaria', 'Listings/demand', 'Ofertas/chats', 'Transacciones/reviews', 'Reservation locks', 'Reportes/auditoría', 'Solicitudes de borrado', 'UCoins internos']) {
  assert.match(dossier, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}
// Do not silently omit secondary stores that may retain a deleting user's data.
for (const path of ['notification_outbox','age_proofs_v2','guardian_grants_v2','adult_actions_v2','chats/*/messages','chats/*/reads','chats/*/confirmations','moderation_cases']) {
  assert(dossier.includes(path), `Falta fuente secundaria de retención: ${path}`);
}
assert.match(dossier, /PENDIENTE LEGAL/);
assert.match(dossier, /no fija plazos/i);
assert.doesNotMatch(dossier, /\b(?:30|60|90|180|365)\s*(?:d[ií]as|days)\b/i);
assert.doesNotMatch(dossier, /base legal:\s*(?:consentimiento|contrato|inter[eé]s|obligaci[oó]n)/i);
console.log('PASS legal dossier covers critical data groups and required decision fields');
console.log('PASS engineering does not invent retention periods or legal bases');
// Safeguard the owner decision about all-ages access without converting a
// source-only privacy draft into a legally approved notice.
const privacyDraft = fs.readFileSync('public/privacy.html', 'utf8');
assert.match(privacyDraft, /La audiencia de producto decidida el 5 de noviembre incluye todas las edades/);
assert.match(privacyDraft, /menores de 13 años/);
assert.match(privacyDraft, /Ninguno de estos controles queda declarado operativo o aprobado por una prueba sintética/);
assert.doesNotMatch(privacyDraft, /Un lanzamiento inicial restringido a adultos es una alternativa condicionada/);
assert.match(privacyDraft, /No es una política legal aprobada ni una declaración de cumplimiento para publicación/);
assert.match(privacyDraft, /la aplicación sea apta para menores ni autoriza su publicación/);
console.log('PASS all-ages owner decision remains explicit while minors and legal/Play release stay gated');

console.log('Legal retention dossier contract: PASS');

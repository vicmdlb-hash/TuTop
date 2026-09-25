import assert from 'node:assert/strict';
import fs from 'node:fs';
const dossier = fs.readFileSync('docs/LEGAL_RETENTION_REVIEW_DOSSIER_0.9.md', 'utf8');
for (const term of ['users', 'device_tokens', 'Verificación universitaria', 'Listings/demand', 'Ofertas/chats', 'Transacciones/reviews', 'Reservation locks', 'Reportes/auditoría', 'Solicitudes de borrado', 'UCoins internos']) {
  assert.match(dossier, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}
assert.match(dossier, /PENDIENTE LEGAL/);
assert.match(dossier, /no fija plazos/i);
assert.doesNotMatch(dossier, /\b(?:30|60|90|180|365)\s*(?:d[ií]as|days)\b/i);
assert.doesNotMatch(dossier, /base legal:\s*(?:consentimiento|contrato|inter[eé]s|obligaci[oó]n)/i);
for (const token of [
  '0.9.2-beta.11',
  '579bdecd7e193b8661276f114b9d3e097792d8d6',
  '10835643904',
  'acd939e5aa4d078270b2fb485e9a41741638e4501cd3c3167871c9ca7bc6f6b8',
]) assert(dossier.includes(token), `legal dossier missing exact Build121 evidence token: ${token}`);
assert.match(dossier, /no constituye aprobación legal, Data Safety final, autorización de Play ni release/i);
console.log('PASS legal dossier covers critical data groups and required decision fields');
console.log('PASS engineering does not invent retention periods or legal bases');
console.log('PASS legal reviewer packet names the exact Build121 evidence without pre-filling legal decisions');
console.log('Legal retention dossier contract: PASS');

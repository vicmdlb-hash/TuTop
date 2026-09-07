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
console.log('PASS legal dossier covers critical data groups and required decision fields');
console.log('PASS engineering does not invent retention periods or legal bases');
console.log('Legal retention dossier contract: PASS');

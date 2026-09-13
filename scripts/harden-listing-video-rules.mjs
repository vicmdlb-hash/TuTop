import fs from 'node:fs';

const path = 'firebase/firestore.v2.generated.rules';
let rules = fs.readFileSync(path, 'utf8');

function stop(message) {
  console.error(`DETENIDO: ${message}`);
  process.exit(2);
}

function canonicalListingBounds(source) {
  const startMarker = '    match /listings_v2/{listingId} {';
  const start = source.indexOf(startMarker);
  if (start < 0) stop(`no se encontró ${startMarker}`);
  const nextMatch = source.indexOf('\n    match /', start + startMarker.length);
  if (nextMatch < 0) stop('no se encontró el siguiente bloque match después de listings_v2');
  return { start, end: nextMatch + 1 };
}

function replaceOnceInSection(section, needle, replacement, label) {
  const count = section.split(needle).length - 1;
  if (count !== 1) stop(`${label} esperaba 1 coincidencia dentro de listings_v2 y encontró ${count}`);
  return section.replace(needle, replacement);
}

const bounds = canonicalListingBounds(rules);
const before = rules.slice(0, bounds.start);
const after = rules.slice(bounds.end);
let listingRules = rules.slice(bounds.start, bounds.end);

const keyNeedle = "          'delivery_methods','meeting_point_ids','shipping_available','photo_urls','status','moderation_status','visibility_scope',\n";
listingRules = replaceOnceInSection(
  listingRules,
  keyNeedle,
  "          'delivery_methods','meeting_point_ids','shipping_available','photo_urls','video_urls','status','moderation_status','visibility_scope',\n",
  'listings_v2 allowlist video_urls',
);

const videoValidation = `        && (!('video_urls' in request.resource.data) || (\n          request.resource.data.video_urls is list\n          && request.resource.data.video_urls.size() <= 1\n          && (request.resource.data.video_urls.size() == 0 || (\n            request.resource.data.video_urls[0] is string\n            && request.resource.data.video_urls[0].size() <= 1200\n            && request.resource.data.video_urls[0].matches('^firebase-storage://[^/]+/product-videos/[A-Za-z0-9_-]+/[A-Za-z0-9._~%-]+$')\n          ))\n        ))\n`;

const createAnchor = "        && (request.resource.data.photo_urls.size() < 4 || (request.resource.data.photo_urls[3] is string && request.resource.data.photo_urls[3].size() <= 180000))\n";
listingRules = replaceOnceInSection(
  listingRules,
  createAnchor,
  `${createAnchor}${videoValidation}`,
  'listings_v2 create video validation',
);

// R2 expands the moderation invariant before R9 runs. Anchor the seller branch
// on that exact post-R2 structure and the status transition that follows it.
const updateAnchor = `          && request.resource.data.created_at == resource.data.created_at\n          && (\n            request.resource.data.moderation_status == resource.data.moderation_status\n            || (request.resource.data.moderation_status == 'pending' && resource.data.moderation_status in ['approved','rejected','flagged'])\n          )\n          && request.resource.data.status in ['draft','active','paused','sold_out','archived']\n`;
const updateVideoValidation = videoValidation.replace(/^ {8}/gm, '          ');
listingRules = replaceOnceInSection(
  listingRules,
  updateAnchor,
  `          && request.resource.data.created_at == resource.data.created_at\n          && (\n            request.resource.data.moderation_status == resource.data.moderation_status\n            || (request.resource.data.moderation_status == 'pending' && resource.data.moderation_status in ['approved','rejected','flagged'])\n          )\n${updateVideoValidation}          && request.resource.data.status in ['draft','active','paused','sold_out','archived']\n`,
  'listings_v2 update video validation',
);

const finalAllowlistCount = listingRules.split("'video_urls'").length - 1;
const finalValidationCount = listingRules.split('request.resource.data.video_urls.size() <= 1').length - 1;
if (finalAllowlistCount !== 1) stop(`video_urls debe existir exactamente una vez en allowlist; encontró ${finalAllowlistCount}`);
if (finalValidationCount !== 2) stop(`video_urls debe validarse en create+seller update; encontró ${finalValidationCount}`);
if (!listingRules.includes('firebase-storage://[^/]+/product-videos/')) stop('falta el prefijo canónico product-videos en validación');
if (!after.startsWith('    match /')) stop('el límite dinámico de listings_v2 no terminó justo antes del siguiente match');

rules = `${before}${listingRules}${after}`;
fs.writeFileSync(path, rules);
console.log('✅ Rules 0.9.2: listings_v2 acepta máximo un firebase-storage:// product-video; create/update quedan fail-closed y la transformación está aislada dinámicamente al bloque canónico.');
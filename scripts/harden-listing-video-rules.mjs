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

function replaceOnce(section, needle, replacement, label) {
  const count = section.split(needle).length - 1;
  if (count !== 1) stop(`${label} esperaba 1 coincidencia y encontró ${count}`);
  return section.replace(needle, replacement);
}

const bounds = canonicalListingBounds(rules);
const before = rules.slice(0, bounds.start);
const after = rules.slice(bounds.end);
let listingRules = rules.slice(bounds.start, bounds.end);

const allowCreateMarker = '      allow create: if signedIn() && notSuspended()';
const allowUpdateMarker = '      allow update: if signedIn() && notSuspended() && (';
const allowDeleteMarker = '      allow delete: if false;';
const createStart = listingRules.indexOf(allowCreateMarker);
const updateStart = listingRules.indexOf(allowUpdateMarker, createStart + allowCreateMarker.length);
const deleteStart = listingRules.lastIndexOf(allowDeleteMarker);
if (createStart < 0 || updateStart <= createStart || deleteStart <= updateStart) {
  stop(`estructura listings_v2 inesperada create=${createStart} update=${updateStart} delete=${deleteStart}`);
}

let prefix = listingRules.slice(0, createStart);
let createRules = listingRules.slice(createStart, updateStart);
let updateRules = listingRules.slice(updateStart, deleteStart);
const suffix = listingRules.slice(deleteStart);

const keyNeedle = "          'delivery_methods','meeting_point_ids','shipping_available','photo_urls','status','moderation_status','visibility_scope',\n";
const videoAllowlistNeedle = "          'delivery_methods','meeting_point_ids','shipping_available','photo_urls','video_urls','status','moderation_status','visibility_scope',\n";
createRules = replaceOnce(
  createRules,
  keyNeedle,
  videoAllowlistNeedle,
  'create allowlist video_urls',
);

const videoValidation = `        && (!('video_urls' in request.resource.data) || (\n          request.resource.data.video_urls is list\n          && request.resource.data.video_urls.size() <= 1\n          && (request.resource.data.video_urls.size() == 0 || (\n            request.resource.data.video_urls[0] is string\n            && request.resource.data.video_urls[0].size() <= 1200\n            && request.resource.data.video_urls[0].matches('^firebase-storage://[^/]+/product-videos/[A-Za-z0-9_-]+/[A-Za-z0-9._~%-]+$')\n          ))\n        ))\n`;

const createStatus = "        && request.resource.data.status in ['draft','active']\n";
createRules = replaceOnce(
  createRules,
  createStatus,
  `${videoValidation}${createStatus}`,
  'create video validation before listing status',
);

const updateStatus = "          && request.resource.data.status in ['draft','active','paused','sold_out','archived']\n";
const updateVideoValidation = videoValidation.replace(/^ {8}/gm, '          ');
updateRules = replaceOnce(
  updateRules,
  updateStatus,
  `${updateVideoValidation}${updateStatus}`,
  'seller update video validation before listing status',
);

listingRules = `${prefix}${createRules}${updateRules}${suffix}`;

// Count the exact allowlist entry, not every legitimate occurrence of the
// string key inside create/update validators.
const finalAllowlistCount = listingRules.split(videoAllowlistNeedle.trim()).length - 1;
const finalValidationCount = listingRules.split('request.resource.data.video_urls.size() <= 1').length - 1;
const canonicalPrefixCount = listingRules.split('firebase-storage://[^/]+/product-videos/').length - 1;
if (finalAllowlistCount !== 1) stop(`video_urls debe existir exactamente una vez en allowlist; encontró ${finalAllowlistCount}`);
if (finalValidationCount !== 2) stop(`video_urls debe validarse en create+seller update; encontró ${finalValidationCount}`);
if (canonicalPrefixCount !== 2) stop(`prefijo product-videos debe aparecer en create+update; encontró ${canonicalPrefixCount}`);
if (!after.startsWith('    match /')) stop('el límite dinámico de listings_v2 no terminó justo antes del siguiente match');

rules = `${before}${listingRules}${after}`;
fs.writeFileSync(path, rules);
console.log('✅ Rules 0.9.2: video_urls queda permitido sólo en listings_v2 y validado fail-closed en create + seller update, sin depender de la forma interna del bloque de moderación.');

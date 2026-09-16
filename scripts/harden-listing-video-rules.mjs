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
let before = rules.slice(0, bounds.start);
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

const videoHelperName = 'validListingVideoUrls';
const videoHelper = `    function ${videoHelperName}(data) {
      return !(('video_urls' in data))
        || (
          data.video_urls is list
          && data.video_urls.size() <= 1
          && (
            data.video_urls.size() == 0
            || (
              data.video_urls[0] is string
              && data.video_urls[0].size() <= 1200
              && data.video_urls[0].matches('^firebase-storage://[^/]+/product-videos/[^/]+/[^/]+$')
            )
          )
        );
    }

`;

if (before.includes(`function ${videoHelperName}(`) || listingRules.includes(`function ${videoHelperName}(`) || after.includes(`function ${videoHelperName}(`)) {
  stop(`${videoHelperName} ya existía antes del hardener`);
}
before += videoHelper;

const createStatus = "        && request.resource.data.status in ['draft','active']\n";
createRules = replaceOnce(
  createRules,
  createStatus,
  `        && ${videoHelperName}(request.resource.data)\n${createStatus}`,
  'create video validation before listing status',
);

const updateStatus = "          && request.resource.data.status in ['draft','active','paused','sold_out','archived']\n";
updateRules = replaceOnce(
  updateRules,
  updateStatus,
  `          && ${videoHelperName}(request.resource.data)\n${updateStatus}`,
  'seller update video validation before listing status',
);

listingRules = `${prefix}${createRules}${updateRules}${suffix}`;

const finalAllowlistCount = listingRules.split(videoAllowlistNeedle.trim()).length - 1;
const finalHelperDefinitionCount = before.split(`function ${videoHelperName}(`).length - 1;
const finalValidationCallCount = listingRules.split(`${videoHelperName}(request.resource.data)`).length - 1;
const canonicalPrefixCount = before.split('firebase-storage://[^/]+/product-videos/[^/]+/[^/]+').length - 1;
if (finalAllowlistCount !== 1) stop(`video_urls debe existir exactamente una vez en allowlist; encontró ${finalAllowlistCount}`);
if (finalHelperDefinitionCount !== 1) stop(`${videoHelperName} debe definirse exactamente una vez; encontró ${finalHelperDefinitionCount}`);
if (finalValidationCallCount !== 2) stop(`${videoHelperName} debe aplicarse en create+seller update; encontró ${finalValidationCallCount}`);
if (canonicalPrefixCount !== 1) stop(`prefijo product-videos debe existir una vez en el helper; encontró ${canonicalPrefixCount}`);
if (!after.startsWith('    match /')) stop('el límite dinámico de listings_v2 no terminó justo antes del siguiente match');

rules = `${before}${listingRules}${after}`;
fs.writeFileSync(path, rules);
console.log('✅ Rules 0.9.2: video_urls usa helper canónico compilable, allowlist única y validación fail-closed en create + seller update.');

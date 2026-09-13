import fs from 'node:fs';

const path = 'firebase/firestore.v2.generated.rules';
let rules = fs.readFileSync(path, 'utf8');

function replaceOnce(needle, replacement, label) {
  const count = rules.split(needle).length - 1;
  if (count !== 1) {
    console.error(`DETENIDO: ${label} esperaba 1 coincidencia y encontró ${count}.`);
    process.exit(2);
  }
  rules = rules.replace(needle, replacement);
}

const keyNeedle = "          'delivery_methods','meeting_point_ids','shipping_available','photo_urls','status','moderation_status','visibility_scope',\n";
replaceOnce(
  keyNeedle,
  "          'delivery_methods','meeting_point_ids','shipping_available','photo_urls','video_urls','status','moderation_status','visibility_scope',\n",
  'listings_v2 allowlist video_urls',
);

const videoValidation = `        && (!('video_urls' in request.resource.data) || (\n          request.resource.data.video_urls is list\n          && request.resource.data.video_urls.size() <= 1\n          && (request.resource.data.video_urls.size() == 0 || (\n            request.resource.data.video_urls[0] is string\n            && request.resource.data.video_urls[0].size() <= 1200\n            && request.resource.data.video_urls[0].matches('^firebase-storage://[^/]+/product-videos/[A-Za-z0-9_-]+/[A-Za-z0-9._~%-]+$')\n          ))\n        ))\n`;

const createAnchor = "        && (request.resource.data.photo_urls.size() < 4 || (request.resource.data.photo_urls[3] is string && request.resource.data.photo_urls[3].size() <= 180000))\n";
replaceOnce(createAnchor, `${createAnchor}${videoValidation}`, 'listings_v2 create video validation');

const updateAnchor = "          && request.resource.data.status in ['draft','active','paused','sold_out','archived']\n";
const updateVideoValidation = videoValidation.replace(/^ {8}/gm, '          ');
replaceOnce(updateAnchor, `${updateVideoValidation}${updateAnchor}`, 'listings_v2 update video validation');

fs.writeFileSync(path, rules);
console.log('✅ Rules 0.9.2: listings_v2 acepta máximo un firebase-storage:// product-video validado; create/update quedan fail-closed.');
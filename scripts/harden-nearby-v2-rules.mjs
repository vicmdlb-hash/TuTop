import fs from 'node:fs';

const path = 'firebase/firestore.v2.generated.rules';
let rules = fs.readFileSync(path, 'utf8');

function replaceAllExact(from, to, label, expectedAtLeast = 1) {
  const count = rules.split(from).length - 1;
  if (count < expectedAtLeast) {
    console.error(`DETENIDO: ${label} esperaba al menos ${expectedAtLeast} coincidencia(s) y encontró ${count}.`);
    process.exit(2);
  }
  rules = rules.split(from).join(to);
}

replaceAllExact(
  "          'delivery_methods','meeting_point_ids','shipping_available','photo_urls','status','moderation_status','visibility_scope',",
  "          'delivery_methods','meeting_point_ids','shipping_available','approx_latitude','approx_longitude','photo_urls','status','moderation_status','visibility_scope',",
  'canonical listing keys include approximate coordinates',
);

replaceAllExact(
  "        && request.resource.data.shipping_available is bool\n        && request.resource.data.photo_urls is list",
  `        && request.resource.data.shipping_available is bool
        && (
          (!('approx_latitude' in request.resource.data) && !('approx_longitude' in request.resource.data))
          || (
            request.resource.data.approx_latitude is number
            && request.resource.data.approx_longitude is number
            && request.resource.data.approx_latitude >= -90 && request.resource.data.approx_latitude <= 90
            && request.resource.data.approx_longitude >= -180 && request.resource.data.approx_longitude <= 180
          )
        )
        && request.resource.data.photo_urls is list`,
  'canonical approximate coordinate validation',
);

replaceAllExact(
  "        && (request.resource.data.visibility_scope != 'national' || request.resource.data.shipping_available == true)\n",
  '',
  'national discovery does not require TuTop shipping',
  2,
);

fs.writeFileSync(path, rules);
console.log('✅ Rules 0.9.1: ubicación aproximada opcional validada; alcance nacional ya no exige paquetería de TuTop.');

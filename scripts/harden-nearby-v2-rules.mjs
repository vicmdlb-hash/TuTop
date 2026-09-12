import fs from 'node:fs';

const path = 'firebase/firestore.v2.generated.rules';
let rules = fs.readFileSync(path, 'utf8');

const canonicalShippingRequirement = "        && (request.resource.data.visibility_scope != 'national' || request.resource.data.shipping_available == true)\n";
const canonicalCount = rules.split(canonicalShippingRequirement).length - 1;
if (canonicalCount !== 2) {
  console.error(`DETENIDO: canonical shipping mandate esperaba exactamente 2 coincidencias y encontró ${canonicalCount}.`);
  process.exit(2);
}
rules = rules.split(canonicalShippingRequirement).join('');

const legacyShippingRequirement = "        && (!('visibility_scope' in data) || data.visibility_scope != 'national' || ('shipping_available' in data && data.shipping_available == true))\n";
const legacyCount = rules.split(legacyShippingRequirement).length - 1;
if (legacyCount !== 1) {
  console.error(`DETENIDO: legacy shipping mandate esperaba exactamente 1 coincidencia y encontró ${legacyCount}.`);
  process.exit(2);
}
rules = rules.replace(legacyShippingRequirement, '');

// Approximate coordinates and geo_cell live inside the already-authorized attributes
// map. TuTop never makes shipping a condition of national discovery; any external
// courier is a private agreement between buyer and seller.
fs.writeFileSync(path, rules);
console.log('✅ Rules 0.9.1: alcance nacional no exige paquetería ni en listings_v2 ni en la ruta legacy products; cercanía permanece dentro de attributes.');

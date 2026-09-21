import fs from 'node:fs';

const path = 'firebase/firestore.v2.generated.rules';
let rules = fs.readFileSync(path, 'utf8');

const canonicalShippingRequirement = "        && (request.resource.data.visibility_scope != 'national' || request.resource.data.shipping_available == true)\n";
const canonicalCount = rules.split(canonicalShippingRequirement).length - 1;
if (canonicalCount !== 0) {
  console.error(`DETENIDO: listings_v2 volvió a introducir el mandato nacional de shipping (${canonicalCount} coincidencias).`);
  process.exit(2);
}

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
console.log('✅ Rules: listings_v2 nace sin mandato nacional de shipping; ruta legacy se normaliza igual y cercanía permanece dentro de attributes.');
